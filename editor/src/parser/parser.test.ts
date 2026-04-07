import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClearNotationParser } from "./parser";
import type { WorkerResponse, CSTNode } from "./types";

/**
 * Mock Worker that simulates the parser-worker.ts behavior.
 * In unit tests we cannot load real WASM, so we mock the worker
 * message protocol.
 */
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  // Simulate the worker responding after a microtask
  private respond(msg: WorkerResponse): void {
    queueMicrotask(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent("message", { data: msg }));
      }
    });
  }

  postMessage(data: unknown): void {
    const msg = data as { type: string; id?: number; source?: string; wasmUrl?: string };

    if (msg.type === "init") {
      this.respond({ type: "init-ok" });
    } else if (msg.type === "parse") {
      const source = msg.source ?? "";
      const tree = makeMockTree(source);
      this.respond({
        type: "parse-ok",
        id: msg.id!,
        result: { tree, parseTimeMs: 0.1 },
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** Create a MockWorker that fails initialization. */
class MockWorkerInitFail {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(data: unknown): void {
    const msg = data as { type: string };
    if (msg.type === "init") {
      queueMicrotask(() => {
        if (this.onmessage) {
          this.onmessage(
            new MessageEvent("message", {
              data: {
                type: "init-error",
                error: "WASM load failed",
              } satisfies WorkerResponse,
            })
          );
        }
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** Create a MockWorker that returns parse errors. */
class MockWorkerParseFail {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(data: unknown): void {
    const msg = data as { type: string; id?: number; wasmUrl?: string };
    if (msg.type === "init") {
      queueMicrotask(() => {
        if (this.onmessage) {
          this.onmessage(
            new MessageEvent("message", {
              data: { type: "init-ok" } satisfies WorkerResponse,
            })
          );
        }
      });
    } else if (msg.type === "parse") {
      queueMicrotask(() => {
        if (this.onmessage) {
          this.onmessage(
            new MessageEvent("message", {
              data: {
                type: "parse-error",
                id: msg.id!,
                error: "Internal parse error",
              } satisfies WorkerResponse,
            })
          );
        }
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeMockTree(source: string): CSTNode {
  return {
    type: "document",
    text: source,
    startIndex: 0,
    endIndex: source.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: source.split("\n").length - 1, column: 0 },
    isNamed: true,
    hasError: false,
    children: [],
    fieldName: null,
  };
}

describe("ClearNotationParser", () => {
  let parser: ClearNotationParser;

  beforeEach(() => {
    parser = new ClearNotationParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  describe("lifecycle", () => {
    it("starts in uninitialized state", () => {
      expect(parser.getState()).toBe("uninitialized");
      expect(parser.getError()).toBeNull();
    });

    it("transitions to ready after successful init", async () => {
      await parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);
      expect(parser.getState()).toBe("ready");
      expect(parser.getError()).toBeNull();
    });

    it("transitions to error on init failure", async () => {
      await expect(
        parser.init("/test.wasm", () => new MockWorkerInitFail() as unknown as Worker)
      ).rejects.toEqual(
        expect.objectContaining({ message: "WASM load failed", phase: "init" })
      );
      expect(parser.getState()).toBe("error");
      expect(parser.getError()).toBe("WASM load failed");
    });

    it("returns same promise for multiple init calls", async () => {
      const p1 = parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);
      const p2 = parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);
      expect(p1).toBe(p2);
      await p1;
    });

    it("resets state on dispose", async () => {
      await parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);
      expect(parser.getState()).toBe("ready");
      parser.dispose();
      expect(parser.getState()).toBe("uninitialized");
    });
  });

  describe("parsing", () => {
    it("parses source text and returns CST", async () => {
      await parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);

      const result = await parser.parse("# Hello\n");
      expect(result.tree.type).toBe("document");
      expect(result.tree.text).toBe("# Hello\n");
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("rejects if parser not initialized", async () => {
      await expect(parser.parse("# Hello\n")).rejects.toEqual(
        expect.objectContaining({
          message: expect.stringContaining("not ready"),
          phase: "parse",
        })
      );
    });

    it("rejects on parse error from worker", async () => {
      await parser.init("/test.wasm", () => new MockWorkerParseFail() as unknown as Worker);

      await expect(parser.parse("# Hello\n")).rejects.toEqual(
        expect.objectContaining({
          message: "Internal parse error",
          phase: "parse",
        })
      );
    });

    it("handles multiple concurrent parses", async () => {
      await parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);

      const [r1, r2, r3] = await Promise.all([
        parser.parse("# One\n"),
        parser.parse("# Two\n"),
        parser.parse("# Three\n"),
      ]);

      expect(r1.tree.text).toBe("# One\n");
      expect(r2.tree.text).toBe("# Two\n");
      expect(r3.tree.text).toBe("# Three\n");
    });

    it("rejects pending parses on dispose", async () => {
      await parser.init("/test.wasm", () => new MockWorker() as unknown as Worker);

      // Start a parse but dispose before it resolves
      // We need a slow worker for this
      class SlowWorker extends MockWorker {
        override postMessage(data: unknown): void {
          const msg = data as { type: string; id?: number; source?: string; wasmUrl?: string };
          if (msg.type === "init") {
            super.postMessage(data);
          }
          // Don't respond to parse messages
        }
      }

      const slowParser = new ClearNotationParser();
      await slowParser.init("/test.wasm", () => new SlowWorker() as unknown as Worker);
      const parsePromise = slowParser.parse("# Hello\n");
      slowParser.dispose();

      await expect(parsePromise).rejects.toEqual(
        expect.objectContaining({ message: "Parser disposed" })
      );
    });
  });
});
