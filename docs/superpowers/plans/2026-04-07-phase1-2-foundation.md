# Phase 1-2: Tree-sitter WASM Browser Parser + BlockNote Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two foundation layers the visual editor depends on: (1) a reusable TypeScript module that loads the tree-sitter WASM parser in a Web Worker for off-main-thread parsing, and (2) a registry-driven BlockNote schema that maps every ClearNotation construct to an editable block or inline mark.

**Architecture:** Phase 1 creates `editor/src/parser/` — a Web Worker that loads `tree-sitter-clearnotation.wasm`, exposes `parse(source: string) => Promise<CSTNode>` via a typed message protocol, and handles WASM initialization/error states. Phase 2 creates `editor/src/schema/` — reads the directive registry (converted to JSON at build time), generates BlockNote BlockSpecs for each directive based on body_mode, maps core syntax (headings, paragraphs, lists, code blocks, meta) to BlockNote blocks, and maps inline constructs to TipTap marks. The schema module also generates the slash menu from the registry.

**Tech Stack:** TypeScript 5.3+, Vite 8+, web-tree-sitter 0.26+, BlockNote 0.47+, React 19+, TipTap (via BlockNote), Vitest, pnpm workspace

---

## Phase 1: Tree-sitter WASM Browser Parser + Web Worker

### Task 1: Add Vitest to the editor package

**Files:**
- Modify: `editor/package.json`
- Create: `editor/vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm add -D vitest jsdom
```

- [ ] **Step 2: Create Vitest config**

Create `editor/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Add test script to editor/package.json**

In `editor/package.json`, add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: "No test files found" or similar — no failures. Vitest is wired correctly.

- [ ] **Step 5: Commit**

```bash
git add editor/package.json editor/vitest.config.ts editor/pnpm-lock.yaml
git commit -m "chore: add Vitest to editor package"
```

---

### Task 2: Define the CST node types and parser API

**Files:**
- Create: `editor/src/parser/types.ts`

- [ ] **Step 1: Write the CST node type definitions**

Create `editor/src/parser/types.ts`:

```typescript
/**
 * ClearNotation CST (Concrete Syntax Tree) types.
 *
 * These are a simplified, serializable representation of tree-sitter's
 * SyntaxNode. The Web Worker serializes tree-sitter nodes into this
 * format before posting back to the main thread, because tree-sitter
 * SyntaxNode objects are bound to the Tree's memory and cannot be
 * transferred across the worker boundary.
 */

/** A single node in the concrete syntax tree. */
export interface CSTNode {
  /** The grammar rule name (e.g. "document", "heading", "paragraph"). */
  type: string;
  /** The source text this node spans. */
  text: string;
  /** Zero-based byte offset of the start. */
  startIndex: number;
  /** Zero-based byte offset of the end. */
  endIndex: number;
  /** Start position as {row, column} (zero-based). */
  startPosition: CSTPoint;
  /** End position as {row, column} (zero-based). */
  endPosition: CSTPoint;
  /** Whether this node is named (vs anonymous punctuation). */
  isNamed: boolean;
  /** Whether this node or any descendant has a parse error. */
  hasError: boolean;
  /** Child nodes. */
  children: CSTNode[];
  /** The field name this child occupies in its parent, if any. */
  fieldName: string | null;
}

/** A zero-based row/column position in the source text. */
export interface CSTPoint {
  row: number;
  column: number;
}

/** Parse result returned from the worker. */
export interface ParseResult {
  /** The root CST node ("document"). */
  tree: CSTNode;
  /** Time taken to parse, in milliseconds. */
  parseTimeMs: number;
}

/** Error info when parsing fails. */
export interface ParseError {
  message: string;
  phase: "init" | "load" | "parse";
}

/**
 * Messages sent from main thread to the parser worker.
 */
export type WorkerRequest =
  | { type: "init"; wasmUrl: string }
  | { type: "parse"; id: number; source: string };

/**
 * Messages sent from the parser worker back to the main thread.
 */
export type WorkerResponse =
  | { type: "init-ok" }
  | { type: "init-error"; error: string }
  | { type: "parse-ok"; id: number; result: ParseResult }
  | { type: "parse-error"; id: number; error: string };
```

- [ ] **Step 2: Commit**

```bash
git add editor/src/parser/types.ts
git commit -m "feat: define CST node types and worker message protocol"
```

---

### Task 3: Implement the Web Worker (parser-worker.ts)

**Files:**
- Create: `editor/src/parser/parser-worker.ts`

- [ ] **Step 1: Write the worker implementation**

Create `editor/src/parser/parser-worker.ts`:

```typescript
/**
 * Web Worker that loads tree-sitter WASM and provides off-main-thread parsing.
 *
 * Message protocol:
 *   Main -> Worker: { type: "init", wasmUrl: string }
 *   Worker -> Main: { type: "init-ok" } | { type: "init-error", error: string }
 *
 *   Main -> Worker: { type: "parse", id: number, source: string }
 *   Worker -> Main: { type: "parse-ok", id, result } | { type: "parse-error", id, error }
 */

import type { WorkerRequest, WorkerResponse, CSTNode } from "./types";

// web-tree-sitter types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterParser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyntaxNode = any;

let parser: TreeSitterParser | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Recursively convert a tree-sitter SyntaxNode to a serializable CSTNode.
 * Only includes named children to keep the payload lean.
 */
function serializeNode(node: SyntaxNode): CSTNode {
  const children: CSTNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      children.push(serializeNode(child));
    }
  }

  return {
    type: node.type,
    text: node.text,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    endPosition: {
      row: node.endPosition.row,
      column: node.endPosition.column,
    },
    isNamed: node.isNamed,
    hasError: node.hasError,
    children,
    fieldName: null,
  };
}

async function handleInit(wasmUrl: string): Promise<void> {
  try {
    // Dynamic import for web-tree-sitter
    const TreeSitter = (await import("web-tree-sitter")).default;
    await TreeSitter.init();

    parser = new TreeSitter();

    // Load the ClearNotation language WASM
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch WASM: ${response.status} ${response.statusText}`
      );
    }
    const wasmBuffer = await response.arrayBuffer();
    const lang = await TreeSitter.Language.load(new Uint8Array(wasmBuffer));
    parser.setLanguage(lang);

    post({ type: "init-ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "init-error", error: message });
  }
}

function handleParse(id: number, source: string): void {
  if (!parser) {
    post({ type: "parse-error", id, error: "Parser not initialized" });
    return;
  }

  try {
    const start = performance.now();
    const tree = parser.parse(source);
    const parseTimeMs = performance.now() - start;

    const serialized = serializeNode(tree.rootNode);
    tree.delete();

    post({
      type: "parse-ok",
      id,
      result: { tree: serialized, parseTimeMs },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "parse-error", id, error: message });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      handleInit(msg.wasmUrl);
      break;
    case "parse":
      handleParse(msg.id, msg.source);
      break;
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add editor/src/parser/parser-worker.ts
git commit -m "feat: implement tree-sitter WASM Web Worker"
```

---

### Task 4: Implement the main-thread parser client

**Files:**
- Create: `editor/src/parser/parser.ts`

- [ ] **Step 1: Write the parser client**

Create `editor/src/parser/parser.ts`:

```typescript
/**
 * Main-thread parser client.
 *
 * Wraps the Web Worker and exposes a clean Promise-based API:
 *   const parser = new ClearNotationParser();
 *   await parser.init("/tree-sitter-clearnotation.wasm");
 *   const result = await parser.parse("# Hello\n");
 */

import type {
  ParseResult,
  ParseError,
  WorkerRequest,
  WorkerResponse,
} from "./types";

export type ParserState = "uninitialized" | "initializing" | "ready" | "error";

interface PendingParse {
  resolve: (result: ParseResult) => void;
  reject: (error: ParseError) => void;
}

export class ClearNotationParser {
  private worker: Worker | null = null;
  private state: ParserState = "uninitialized";
  private initError: string | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingParse>();
  private initPromise: Promise<void> | null = null;

  /** Current parser state. */
  getState(): ParserState {
    return this.state;
  }

  /** The error message if state is "error". */
  getError(): string | null {
    return this.initError;
  }

  /**
   * Initialize the parser. Loads the Web Worker and the WASM binary.
   * Can be called multiple times safely — subsequent calls return the
   * same promise.
   *
   * @param wasmUrl - URL to the tree-sitter-clearnotation.wasm file.
   *   In dev, this is served from `public/`. In production, it's in
   *   the Vite output directory.
   * @param workerFactory - Optional factory for creating the worker.
   *   Defaults to creating a new Worker from the bundled worker module.
   *   Pass a custom factory for testing.
   */
  init(
    wasmUrl: string,
    workerFactory?: () => Worker
  ): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.state = "initializing";

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        if (workerFactory) {
          this.worker = workerFactory();
        } else {
          this.worker = new Worker(
            new URL("./parser-worker.ts", import.meta.url),
            { type: "module" }
          );
        }

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          this.handleMessage(event.data);
        };

        this.worker.onerror = (event) => {
          this.state = "error";
          this.initError = event.message || "Worker error";
          reject({ message: this.initError, phase: "init" as const });
        };

        // Wait for the init-ok/init-error response
        const originalHandler = this.worker.onmessage;
        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (msg.type === "init-ok") {
            this.state = "ready";
            this.worker!.onmessage = (e: MessageEvent<WorkerResponse>) => {
              this.handleMessage(e.data);
            };
            resolve();
          } else if (msg.type === "init-error") {
            this.state = "error";
            this.initError = msg.error;
            reject({ message: msg.error, phase: "init" as const });
          } else {
            // Forward any other messages to the normal handler
            originalHandler?.call(this.worker, event);
          }
        };

        this.postMessage({ type: "init", wasmUrl });
      } catch (err) {
        this.state = "error";
        const message = err instanceof Error ? err.message : String(err);
        this.initError = message;
        reject({ message, phase: "init" as const });
      }
    });

    return this.initPromise;
  }

  /**
   * Parse ClearNotation source text.
   *
   * @param source - The .cln source text.
   * @returns The parse result with the CST and timing info.
   * @throws ParseError if the parser is not initialized or parsing fails.
   */
  parse(source: string): Promise<ParseResult> {
    if (this.state !== "ready" || !this.worker) {
      return Promise.reject({
        message: `Parser not ready (state: ${this.state})`,
        phase: "parse" as const,
      } satisfies ParseError);
    }

    const id = this.nextId++;

    return new Promise<ParseResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.postMessage({ type: "parse", id, source });
    });
  }

  /**
   * Terminate the worker and clean up resources.
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.state = "uninitialized";
    this.initPromise = null;
    this.initError = null;

    // Reject all pending parses
    for (const [, pending] of this.pending) {
      pending.reject({ message: "Parser disposed", phase: "parse" });
    }
    this.pending.clear();
  }

  private postMessage(msg: WorkerRequest): void {
    this.worker?.postMessage(msg);
  }

  private handleMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case "parse-ok": {
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          pending.resolve(msg.result);
        }
        break;
      }
      case "parse-error": {
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          pending.reject({ message: msg.error, phase: "parse" });
        }
        break;
      }
      // init-ok/init-error are handled in the init() method
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add editor/src/parser/parser.ts
git commit -m "feat: implement main-thread parser client with Promise API"
```

---

### Task 5: Create the parser barrel export

**Files:**
- Create: `editor/src/parser/index.ts`

- [ ] **Step 1: Write the barrel export**

Create `editor/src/parser/index.ts`:

```typescript
export { ClearNotationParser } from "./parser";
export type { ParserState } from "./parser";
export type {
  CSTNode,
  CSTPoint,
  ParseResult,
  ParseError,
  WorkerRequest,
  WorkerResponse,
} from "./types";
```

- [ ] **Step 2: Commit**

```bash
git add editor/src/parser/index.ts
git commit -m "feat: add parser module barrel export"
```

---

### Task 6: Write unit tests for the CST serialization types

**Files:**
- Create: `editor/src/parser/types.test.ts`

- [ ] **Step 1: Write type-level tests**

Create `editor/src/parser/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { CSTNode, ParseResult, WorkerRequest, WorkerResponse } from "./types";

describe("CSTNode type", () => {
  it("represents a minimal document node", () => {
    const node: CSTNode = {
      type: "document",
      text: "# Hello\n",
      startIndex: 0,
      endIndex: 9,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 1, column: 0 },
      isNamed: true,
      hasError: false,
      children: [],
      fieldName: null,
    };

    expect(node.type).toBe("document");
    expect(node.hasError).toBe(false);
    expect(node.children).toHaveLength(0);
  });

  it("represents nested nodes", () => {
    const heading: CSTNode = {
      type: "heading",
      text: "# Hello\n",
      startIndex: 0,
      endIndex: 9,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 9 },
      isNamed: true,
      hasError: false,
      children: [
        {
          type: "heading_marker",
          text: "#",
          startIndex: 0,
          endIndex: 1,
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 1 },
          isNamed: true,
          hasError: false,
          children: [],
          fieldName: null,
        },
        {
          type: "inline_content",
          text: "Hello",
          startIndex: 2,
          endIndex: 7,
          startPosition: { row: 0, column: 2 },
          endPosition: { row: 0, column: 7 },
          isNamed: true,
          hasError: false,
          children: [
            {
              type: "text",
              text: "Hello",
              startIndex: 2,
              endIndex: 7,
              startPosition: { row: 0, column: 2 },
              endPosition: { row: 0, column: 7 },
              isNamed: true,
              hasError: false,
              children: [],
              fieldName: null,
            },
          ],
          fieldName: null,
        },
      ],
      fieldName: null,
    };

    expect(heading.children).toHaveLength(2);
    expect(heading.children[0].type).toBe("heading_marker");
    expect(heading.children[1].type).toBe("inline_content");
    expect(heading.children[1].children[0].text).toBe("Hello");
  });

  it("represents error nodes", () => {
    const errorNode: CSTNode = {
      type: "document",
      text: "::unknown{\nbad\n",
      startIndex: 0,
      endIndex: 15,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 2, column: 0 },
      isNamed: true,
      hasError: true,
      children: [],
      fieldName: null,
    };

    expect(errorNode.hasError).toBe(true);
  });
});

describe("ParseResult type", () => {
  it("contains tree and timing", () => {
    const result: ParseResult = {
      tree: {
        type: "document",
        text: "",
        startIndex: 0,
        endIndex: 0,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 0 },
        isNamed: true,
        hasError: false,
        children: [],
        fieldName: null,
      },
      parseTimeMs: 1.5,
    };

    expect(result.parseTimeMs).toBe(1.5);
    expect(result.tree.type).toBe("document");
  });
});

describe("WorkerRequest discriminated union", () => {
  it("has init variant", () => {
    const msg: WorkerRequest = { type: "init", wasmUrl: "/parser.wasm" };
    expect(msg.type).toBe("init");
  });

  it("has parse variant", () => {
    const msg: WorkerRequest = { type: "parse", id: 1, source: "# Hi\n" };
    expect(msg.type).toBe("parse");
    expect(msg.id).toBe(1);
  });
});

describe("WorkerResponse discriminated union", () => {
  it("has init-ok variant", () => {
    const msg: WorkerResponse = { type: "init-ok" };
    expect(msg.type).toBe("init-ok");
  });

  it("has init-error variant", () => {
    const msg: WorkerResponse = { type: "init-error", error: "WASM failed" };
    expect(msg.type).toBe("init-error");
  });

  it("has parse-ok variant", () => {
    const msg: WorkerResponse = {
      type: "parse-ok",
      id: 1,
      result: {
        tree: {
          type: "document",
          text: "",
          startIndex: 0,
          endIndex: 0,
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 0 },
          isNamed: true,
          hasError: false,
          children: [],
          fieldName: null,
        },
        parseTimeMs: 0.5,
      },
    };
    expect(msg.id).toBe(1);
  });

  it("has parse-error variant", () => {
    const msg: WorkerResponse = {
      type: "parse-error",
      id: 2,
      error: "Parse failed",
    };
    expect(msg.id).toBe(2);
    expect(msg.error).toBe("Parse failed");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add editor/src/parser/types.test.ts
git commit -m "test: add CST type and worker message protocol tests"
```

---

### Task 7: Write unit tests for the parser client

**Files:**
- Create: `editor/src/parser/parser.test.ts`

- [ ] **Step 1: Write parser client tests using a mock worker**

Create `editor/src/parser/parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add editor/src/parser/parser.test.ts
git commit -m "test: add parser client unit tests with mock workers"
```

---

### Task 8: Copy WASM binary to editor public directory

**Files:**
- Create: `editor/public/tree-sitter-clearnotation.wasm` (copy from tree-sitter build)
- Modify: `editor/vite.config.ts` (configure WASM handling)

- [ ] **Step 1: Copy the WASM binary**

```bash
mkdir -p /Users/ryan/projects/clear-notation/editor/public
cp /Users/ryan/projects/clear-notation/tree-sitter-clearnotation/tree-sitter-clearnotation.wasm \
   /Users/ryan/projects/clear-notation/editor/public/tree-sitter-clearnotation.wasm
```

- [ ] **Step 2: Update Vite config for worker bundling**

Replace the contents of `editor/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  plugins: [react()],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
```

- [ ] **Step 3: Add web-tree-sitter as a dependency**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm add web-tree-sitter
```

- [ ] **Step 4: Commit**

```bash
git add editor/public/tree-sitter-clearnotation.wasm editor/vite.config.ts editor/package.json editor/pnpm-lock.yaml
git commit -m "feat: copy WASM binary to editor public and configure Vite for workers"
```

---

### Task 9: Write CST helper utilities

**Files:**
- Create: `editor/src/parser/cst-utils.ts`
- Create: `editor/src/parser/cst-utils.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/parser/cst-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  findChildByType,
  findChildrenByType,
  getDirectiveName,
  getHeadingLevel,
  getAttributeMap,
  getBodyText,
  hasErrorDescendant,
} from "./cst-utils";
import type { CSTNode } from "./types";

function makeNode(
  type: string,
  text: string,
  children: CSTNode[] = []
): CSTNode {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    isNamed: true,
    hasError: false,
    children,
    fieldName: null,
  };
}

describe("findChildByType", () => {
  it("finds first matching child", () => {
    const node = makeNode("heading", "# Hello\n", [
      makeNode("heading_marker", "#"),
      makeNode("inline_content", "Hello"),
    ]);
    const result = findChildByType(node, "heading_marker");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("heading_marker");
  });

  it("returns null when not found", () => {
    const node = makeNode("heading", "# Hello\n");
    expect(findChildByType(node, "code_span")).toBeNull();
  });
});

describe("findChildrenByType", () => {
  it("finds all matching children", () => {
    const node = makeNode("paragraph", "a b c\n", [
      makeNode("paragraph_line", "a"),
      makeNode("paragraph_line", "b"),
      makeNode("paragraph_line", "c"),
    ]);
    const results = findChildrenByType(node, "paragraph_line");
    expect(results).toHaveLength(3);
  });

  it("returns empty array when none found", () => {
    const node = makeNode("document", "");
    expect(findChildrenByType(node, "heading")).toHaveLength(0);
  });
});

describe("getDirectiveName", () => {
  it("extracts directive name", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "toc"),
    ]);
    expect(getDirectiveName(node)).toBe("toc");
  });

  it("returns null if no directive_name child", () => {
    const node = makeNode("paragraph", "hello");
    expect(getDirectiveName(node)).toBeNull();
  });
});

describe("getHeadingLevel", () => {
  it("returns level 1 for #", () => {
    const node = makeNode("heading", "# Title\n", [
      makeNode("heading_marker", "#"),
    ]);
    expect(getHeadingLevel(node)).toBe(1);
  });

  it("returns level 3 for ###", () => {
    const node = makeNode("heading", "### Sub\n", [
      makeNode("heading_marker", "###"),
    ]);
    expect(getHeadingLevel(node)).toBe(3);
  });

  it("returns level 6 for ######", () => {
    const node = makeNode("heading", "###### Deep\n", [
      makeNode("heading_marker", "######"),
    ]);
    expect(getHeadingLevel(node)).toBe(6);
  });

  it("returns 0 if no heading_marker", () => {
    const node = makeNode("paragraph", "not a heading");
    expect(getHeadingLevel(node)).toBe(0);
  });
});

describe("getAttributeMap", () => {
  it("extracts key-value attributes", () => {
    const attrList = makeNode("attribute_list", '[kind="info"]', [
      makeNode("attribute", 'kind="info"', [
        makeNode("attribute_key", "kind"),
        makeNode("value", '"info"', [
          makeNode("string", '"info"', [
            makeNode("string_content", "info"),
          ]),
        ]),
      ]),
    ]);
    const node = makeNode("block_directive_self_closing", '::callout[kind="info"]', [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "callout"),
      attrList,
    ]);

    const attrs = getAttributeMap(node);
    expect(attrs).toEqual({ kind: "info" });
  });

  it("handles boolean attributes", () => {
    const attrList = makeNode("attribute_list", "[header=true]", [
      makeNode("attribute", "header=true", [
        makeNode("attribute_key", "header"),
        makeNode("value", "true", [
          makeNode("boolean", "true"),
        ]),
      ]),
    ]);
    const node = makeNode("block_directive_with_body", "::table[header=true]{", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "table"),
      attrList,
    ]);

    const attrs = getAttributeMap(node);
    expect(attrs).toEqual({ header: true });
  });

  it("returns empty map for no attributes", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "toc"),
    ]);
    expect(getAttributeMap(node)).toEqual({});
  });
});

describe("getBodyText", () => {
  it("extracts directive body content text", () => {
    const node = makeNode("block_directive_with_body", '::callout[kind="info"]{\nbody text\n}', [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "callout"),
      makeNode("directive_body_open", "{"),
      makeNode("directive_body_content", "body text\n"),
      makeNode("block_close", "}"),
    ]);
    expect(getBodyText(node)).toBe("body text\n");
  });

  it("returns empty string for no body", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n");
    expect(getBodyText(node)).toBe("");
  });
});

describe("hasErrorDescendant", () => {
  it("returns false for clean tree", () => {
    const node = makeNode("document", "# Hello\n");
    expect(hasErrorDescendant(node)).toBe(false);
  });

  it("returns true when node has error", () => {
    const node: CSTNode = {
      ...makeNode("document", "bad"),
      hasError: true,
    };
    expect(hasErrorDescendant(node)).toBe(true);
  });

  it("returns true when descendant has error", () => {
    const child: CSTNode = {
      ...makeNode("paragraph", "bad"),
      hasError: true,
    };
    const node = makeNode("document", "bad", [child]);
    expect(hasErrorDescendant(node)).toBe(true);
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/parser/cst-utils.ts`:

```typescript
/**
 * Utility functions for traversing and querying serialized CSTNode trees.
 *
 * These work on the serializable CSTNode type (not tree-sitter's native
 * SyntaxNode), so they can be used on both the main thread and in tests.
 */

import type { CSTNode } from "./types";

/** Find the first direct child with the given node type. */
export function findChildByType(
  node: CSTNode,
  type: string
): CSTNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

/** Find all direct children with the given node type. */
export function findChildrenByType(
  node: CSTNode,
  type: string
): CSTNode[] {
  return node.children.filter((child) => child.type === type);
}

/**
 * Extract the directive name from a directive node.
 * Works for block_directive_self_closing, block_directive_with_body,
 * and inline_directive nodes.
 */
export function getDirectiveName(node: CSTNode): string | null {
  const nameNode = findChildByType(node, "directive_name");
  return nameNode ? nameNode.text : null;
}

/**
 * Extract the heading level from a heading node.
 * Returns the number of '#' characters (1-6), or 0 if not a heading.
 */
export function getHeadingLevel(node: CSTNode): number {
  const marker = findChildByType(node, "heading_marker");
  if (!marker) return 0;
  return marker.text.length;
}

/**
 * Extract attributes from a directive node as a key-value map.
 * Handles string, boolean, and integer values.
 */
export function getAttributeMap(
  node: CSTNode
): Record<string, string | boolean | number | string[]> {
  const attrList = findChildByType(node, "attribute_list");
  if (!attrList) return {};

  const attrs: Record<string, string | boolean | number | string[]> = {};
  const attrNodes = findChildrenByType(attrList, "attribute");

  for (const attr of attrNodes) {
    const keyNode = findChildByType(attr, "attribute_key");
    const valueNode = findChildByType(attr, "value");
    if (!keyNode || !valueNode) continue;

    const key = keyNode.text;
    const value = parseValue(valueNode);
    if (value !== undefined) {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Parse a value node into a JS primitive.
 */
function parseValue(
  valueNode: CSTNode
): string | boolean | number | string[] | undefined {
  // Check for string
  const stringNode = findChildByType(valueNode, "string");
  if (stringNode) {
    const content = findChildByType(stringNode, "string_content");
    return content ? content.text : "";
  }

  // Check for boolean
  const boolNode = findChildByType(valueNode, "boolean");
  if (boolNode) {
    return boolNode.text === "true";
  }

  // Check for integer
  const intNode = findChildByType(valueNode, "integer");
  if (intNode) {
    return parseInt(intNode.text, 10);
  }

  // Check for array
  const arrayNode = findChildByType(valueNode, "array");
  if (arrayNode) {
    const elements: string[] = [];
    // Array contains _scalar_value nodes which contain string/boolean/integer
    // In practice, ClearNotation arrays contain strings
    for (const child of arrayNode.children) {
      if (child.type === "string") {
        const content = findChildByType(child, "string_content");
        elements.push(content ? content.text : "");
      }
    }
    return elements;
  }

  return undefined;
}

/**
 * Extract the raw body text from a directive-with-body node.
 */
export function getBodyText(node: CSTNode): string {
  const bodyContent = findChildByType(node, "directive_body_content");
  return bodyContent ? bodyContent.text : "";
}

/**
 * Check if a node or any of its descendants has a parse error.
 */
export function hasErrorDescendant(node: CSTNode): boolean {
  if (node.hasError) return true;
  for (const child of node.children) {
    if (hasErrorDescendant(child)) return true;
  }
  return false;
}
```

- [ ] **Step 3: Update the barrel export**

Replace `editor/src/parser/index.ts`:

```typescript
export { ClearNotationParser } from "./parser";
export type { ParserState } from "./parser";
export type {
  CSTNode,
  CSTPoint,
  ParseResult,
  ParseError,
  WorkerRequest,
  WorkerResponse,
} from "./types";
export {
  findChildByType,
  findChildrenByType,
  getDirectiveName,
  getHeadingLevel,
  getAttributeMap,
  getBodyText,
  hasErrorDescendant,
} from "./cst-utils";
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add editor/src/parser/cst-utils.ts editor/src/parser/cst-utils.test.ts editor/src/parser/index.ts
git commit -m "feat: add CST traversal utilities with full test coverage"
```

---

## Phase 2: BlockNote Schema from Registry

### Task 10: Convert builtin-registry.toml to JSON at build time

**Files:**
- Create: `editor/scripts/convert-registry.ts`
- Create: `editor/src/schema/registry.json`

- [ ] **Step 1: Write the conversion script**

Create `editor/scripts/convert-registry.ts`:

```typescript
/**
 * Build-time script: converts reference/builtin-registry.toml to a JSON
 * module that the editor can import directly. This runs during `pnpm build`
 * and `pnpm dev` (via a Vite plugin or pre-build script).
 *
 * Usage: npx tsx editor/scripts/convert-registry.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOML_PATH = join(__dirname, "..", "..", "reference", "builtin-registry.toml");
const OUTPUT_PATH = join(__dirname, "..", "src", "schema", "registry.json");

interface Attribute {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  allowed_values?: string[];
  cardinality?: string;
}

interface Directive {
  name: string;
  placement: string;
  body_mode: string;
  emits: string[];
  built_in: boolean;
  attributes: Attribute[];
}

interface Registry {
  spec: string;
  registry_kind: string;
  registry_source: string;
  directives: Directive[];
}

/**
 * Minimal TOML parser for the specific structure of builtin-registry.toml.
 * We avoid a full TOML dependency since the registry format is constrained.
 */
function parseRegistryToml(content: string): Registry {
  const lines = content.split("\n");
  const registry: Registry = {
    spec: "",
    registry_kind: "",
    registry_source: "",
    directives: [],
  };

  let currentDirective: Directive | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    // Top-level key-value pairs
    if (line.startsWith("spec")) {
      registry.spec = extractStringValue(line);
      continue;
    }
    if (line.startsWith("registry_kind")) {
      registry.registry_kind = extractStringValue(line);
      continue;
    }
    if (line.startsWith("registry_source")) {
      registry.registry_source = extractStringValue(line);
      continue;
    }

    // New directive section
    if (line === "[[directive]]") {
      if (currentDirective) {
        registry.directives.push(currentDirective);
      }
      currentDirective = {
        name: "",
        placement: "",
        body_mode: "",
        emits: [],
        built_in: true,
        attributes: [],
      };
      continue;
    }

    // Directive attribute section
    if (line === "[[directive.attribute]]") {
      if (!currentDirective) continue;
      currentDirective.attributes.push({
        name: "",
        type: "",
        required: false,
      });
      continue;
    }

    // Key-value inside a section
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();

    if (currentDirective && currentDirective.attributes.length > 0) {
      // We might be inside a [[directive.attribute]] or inside [[directive]]
      const lastAttr = currentDirective.attributes[currentDirective.attributes.length - 1];
      if (key === "name" && lastAttr.name === "") {
        lastAttr.name = extractStringValue(line);
        continue;
      }
      if (key === "type" && lastAttr.type === "") {
        lastAttr.type = extractStringValue(line);
        continue;
      }
      if (key === "required") {
        lastAttr.required = rawValue === "true";
        continue;
      }
      if (key === "default") {
        if (rawValue === "true") lastAttr.default = true;
        else if (rawValue === "false") lastAttr.default = false;
        else lastAttr.default = extractStringValue(line);
        continue;
      }
      if (key === "allowed_values") {
        lastAttr.allowed_values = extractArrayValue(rawValue);
        continue;
      }
      if (key === "cardinality") {
        lastAttr.cardinality = extractStringValue(line);
        continue;
      }
    }

    if (currentDirective) {
      if (key === "name") {
        currentDirective.name = extractStringValue(line);
      } else if (key === "placement") {
        currentDirective.placement = extractStringValue(line);
      } else if (key === "body_mode") {
        currentDirective.body_mode = extractStringValue(line);
      } else if (key === "emits") {
        currentDirective.emits = extractArrayValue(rawValue);
      } else if (key === "built_in") {
        currentDirective.built_in = rawValue === "true";
      }
    }
  }

  // Push last directive
  if (currentDirective) {
    registry.directives.push(currentDirective);
  }

  return registry;
}

function extractStringValue(line: string): string {
  const match = line.match(/"([^"]*)"/);
  return match ? match[1] : "";
}

function extractArrayValue(raw: string): string[] {
  const match = raw.match(/\[([^\]]*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^"/, "").replace(/"$/, ""))
    .filter((s) => s.length > 0);
}

// Main
const tomlContent = readFileSync(TOML_PATH, "utf-8");
const registry = parseRegistryToml(tomlContent);

// Validate
if (registry.directives.length === 0) {
  console.error("ERROR: No directives found in registry TOML");
  process.exit(1);
}

console.log(`Parsed ${registry.directives.length} directives:`);
for (const d of registry.directives) {
  console.log(`  ${d.name} (${d.placement}, ${d.body_mode}, ${d.attributes.length} attrs)`);
}

writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2) + "\n");
console.log(`\nWritten to ${OUTPUT_PATH}`);
```

- [ ] **Step 2: Install tsx for running the script**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm add -D tsx
```

- [ ] **Step 3: Create the schema directory and run the conversion**

```bash
mkdir -p /Users/ryan/projects/clear-notation/editor/src/schema
cd /Users/ryan/projects/clear-notation
npx tsx editor/scripts/convert-registry.ts
```

Expected output:
```
Parsed 9 directives:
  toc (block, none, 0 attrs)
  ref (inline, none, 1 attrs)
  anchor (block, none, 1 attrs)
  include (block, none, 1 attrs)
  callout (block, parsed, 3 attrs)
  figure (block, parsed, 1 attrs)
  math (block, raw, 0 attrs)
  table (block, raw, 2 attrs)
  source (block, raw, 1 attrs)

Written to editor/src/schema/registry.json
```

- [ ] **Step 4: Add prebuild script to editor/package.json**

In `editor/package.json`, update the `"scripts"` object:

```json
"prebuild": "tsx scripts/convert-registry.ts",
"predev": "tsx scripts/convert-registry.ts"
```

- [ ] **Step 5: Commit**

```bash
git add editor/scripts/convert-registry.ts editor/src/schema/registry.json editor/package.json editor/pnpm-lock.yaml
git commit -m "feat: build-time conversion of builtin-registry.toml to JSON"
```

---

### Task 11: Define the registry TypeScript types

**Files:**
- Create: `editor/src/schema/registry-types.ts`
- Create: `editor/src/schema/registry-types.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/schema/registry-types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  loadRegistry,
  getBlockDirectives,
  getInlineDirectives,
  getParsedModeDirectives,
  getRawModeDirectives,
  getNoneModeDirectives,
} from "./registry-types";

describe("loadRegistry", () => {
  it("loads the built-in registry JSON", () => {
    const registry = loadRegistry();
    expect(registry.spec).toBe("0.1");
    expect(registry.directives.length).toBe(9);
  });

  it("includes all expected directive names", () => {
    const registry = loadRegistry();
    const names = registry.directives.map((d) => d.name);
    expect(names).toContain("callout");
    expect(names).toContain("figure");
    expect(names).toContain("math");
    expect(names).toContain("table");
    expect(names).toContain("source");
    expect(names).toContain("toc");
    expect(names).toContain("anchor");
    expect(names).toContain("include");
    expect(names).toContain("ref");
  });
});

describe("getBlockDirectives", () => {
  it("returns only block-placement directives", () => {
    const directives = getBlockDirectives();
    expect(directives.length).toBe(8);
    for (const d of directives) {
      expect(d.placement).toBe("block");
    }
  });

  it("excludes inline directives", () => {
    const directives = getBlockDirectives();
    const names = directives.map((d) => d.name);
    expect(names).not.toContain("ref");
  });
});

describe("getInlineDirectives", () => {
  it("returns only inline-placement directives", () => {
    const directives = getInlineDirectives();
    expect(directives.length).toBe(1);
    expect(directives[0].name).toBe("ref");
  });
});

describe("getParsedModeDirectives", () => {
  it("returns callout and figure", () => {
    const directives = getParsedModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("callout");
    expect(names).toContain("figure");
    expect(names).toHaveLength(2);
  });
});

describe("getRawModeDirectives", () => {
  it("returns math, table, and source", () => {
    const directives = getRawModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("math");
    expect(names).toContain("table");
    expect(names).toContain("source");
    expect(names).toHaveLength(3);
  });
});

describe("getNoneModeDirectives", () => {
  it("returns toc, anchor, and include", () => {
    const directives = getNoneModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("toc");
    expect(names).toContain("anchor");
    expect(names).toContain("include");
    expect(names).toHaveLength(3);
  });
});

describe("directive attributes", () => {
  it("callout has kind (required), title (optional), compact (optional)", () => {
    const registry = loadRegistry();
    const callout = registry.directives.find((d) => d.name === "callout")!;
    expect(callout.attributes).toHaveLength(3);

    const kind = callout.attributes.find((a) => a.name === "kind")!;
    expect(kind.type).toBe("string");
    expect(kind.required).toBe(true);
    expect(kind.allowed_values).toEqual(["info", "warning", "danger", "tip"]);

    const title = callout.attributes.find((a) => a.name === "title")!;
    expect(title.required).toBe(false);

    const compact = callout.attributes.find((a) => a.name === "compact")!;
    expect(compact.type).toBe("boolean");
    expect(compact.required).toBe(false);
    expect(compact.default).toBe(false);
  });

  it("table has header and align attributes", () => {
    const registry = loadRegistry();
    const table = registry.directives.find((d) => d.name === "table")!;
    expect(table.attributes).toHaveLength(2);

    const align = table.attributes.find((a) => a.name === "align")!;
    expect(align.type).toBe("string[]");
    expect(align.allowed_values).toEqual(["left", "center", "right"]);
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/schema/registry-types.ts`:

```typescript
/**
 * TypeScript types and accessors for the ClearNotation directive registry.
 *
 * The registry is loaded from the build-time generated registry.json,
 * which is converted from reference/builtin-registry.toml.
 */

import registryData from "./registry.json";

/** An attribute specification for a directive. */
export interface RegistryAttribute {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  allowed_values?: string[];
  cardinality?: string;
}

/** A directive specification from the registry. */
export interface RegistryDirective {
  name: string;
  placement: "block" | "inline";
  body_mode: "parsed" | "raw" | "none";
  emits: string[];
  built_in: boolean;
  attributes: RegistryAttribute[];
}

/** The full registry structure. */
export interface Registry {
  spec: string;
  registry_kind: string;
  registry_source: string;
  directives: RegistryDirective[];
}

/** Load the built-in registry. */
export function loadRegistry(): Registry {
  return registryData as Registry;
}

/** Get all block-placement directives. */
export function getBlockDirectives(): RegistryDirective[] {
  return loadRegistry().directives.filter((d) => d.placement === "block");
}

/** Get all inline-placement directives. */
export function getInlineDirectives(): RegistryDirective[] {
  return loadRegistry().directives.filter((d) => d.placement === "inline");
}

/** Get block directives with body_mode="parsed" (content is nested blocks). */
export function getParsedModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "parsed");
}

/** Get block directives with body_mode="raw" (content is verbatim text). */
export function getRawModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "raw");
}

/** Get block directives with body_mode="none" (no body). */
export function getNoneModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "none");
}
```

- [ ] **Step 3: Add JSON import support to tsconfig**

In `editor/tsconfig.json`, add `"resolveJsonModule": true` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add editor/src/schema/registry-types.ts editor/src/schema/registry-types.test.ts editor/tsconfig.json
git commit -m "feat: typed registry accessors with body_mode filtering"
```

---

### Task 12: Define core block specs (headings, paragraphs, lists, code, meta)

**Files:**
- Create: `editor/src/schema/core-blocks.ts`
- Create: `editor/src/schema/core-blocks.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/schema/core-blocks.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  clnHeadingBlockSpec,
  clnParagraphBlockSpec,
  clnCodeBlockSpec,
  clnUnorderedListBlockSpec,
  clnOrderedListBlockSpec,
  clnBlockquoteBlockSpec,
  clnThematicBreakBlockSpec,
  clnMetaBlockSpec,
  CORE_BLOCK_SPECS,
} from "./core-blocks";

describe("Core block specs", () => {
  it("exports all 8 core block types", () => {
    expect(Object.keys(CORE_BLOCK_SPECS)).toHaveLength(8);
  });

  it("heading spec has level prop with default 1", () => {
    const spec = clnHeadingBlockSpec;
    expect(spec.type).toBe("clnHeading");
    expect(spec.propSchema.level.default).toBe(1);
    expect(spec.content).toBe("inline");
  });

  it("paragraph spec has inline content", () => {
    const spec = clnParagraphBlockSpec;
    expect(spec.type).toBe("clnParagraph");
    expect(spec.content).toBe("inline");
  });

  it("code block spec has language prop and no inline content", () => {
    const spec = clnCodeBlockSpec;
    expect(spec.type).toBe("clnCodeBlock");
    expect(spec.propSchema.language.default).toBe("");
    expect(spec.content).toBe("none");
  });

  it("unordered list spec has inline content", () => {
    const spec = clnUnorderedListBlockSpec;
    expect(spec.type).toBe("clnUnorderedList");
    expect(spec.content).toBe("inline");
  });

  it("ordered list spec has inline content and startNumber prop", () => {
    const spec = clnOrderedListBlockSpec;
    expect(spec.type).toBe("clnOrderedList");
    expect(spec.propSchema.startNumber.default).toBe(1);
    expect(spec.content).toBe("inline");
  });

  it("blockquote spec has inline content", () => {
    const spec = clnBlockquoteBlockSpec;
    expect(spec.type).toBe("clnBlockquote");
    expect(spec.content).toBe("inline");
  });

  it("thematic break spec has no content", () => {
    const spec = clnThematicBreakBlockSpec;
    expect(spec.type).toBe("clnThematicBreak");
    expect(spec.content).toBe("none");
  });

  it("meta block spec has entries prop", () => {
    const spec = clnMetaBlockSpec;
    expect(spec.type).toBe("clnMeta");
    expect(spec.propSchema.entries.default).toBe("{}");
    expect(spec.content).toBe("none");
  });

  it("all specs have a valid type name", () => {
    for (const [key, spec] of Object.entries(CORE_BLOCK_SPECS)) {
      expect(spec.type).toBe(key);
      expect(spec.type).toMatch(/^cln[A-Z]/);
    }
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/schema/core-blocks.ts`:

```typescript
/**
 * Core ClearNotation block specifications for BlockNote.
 *
 * These map the fundamental ClearNotation syntax elements (headings,
 * paragraphs, lists, code blocks, blockquotes, thematic breaks, meta)
 * to BlockNote block specs. They are NOT from the directive registry —
 * they are built-in syntax.
 *
 * NOTE: BlockNote's BlockSpec system uses React render functions.
 * This module defines the SCHEMA (prop definitions and content model)
 * separately from the React render components, which are in
 * core-block-components.tsx. This separation allows the schema to
 * be tested without React.
 */

/** Block spec definition (schema-only, no render function). */
export interface CLNBlockSpec {
  type: string;
  propSchema: Record<string, CLNPropDef>;
  content: "inline" | "none";
}

/** Property definition for a block spec. */
export interface CLNPropDef {
  type: "string" | "number" | "boolean";
  default: string | number | boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Heading: # through ######
// ═══════════════════════════════════════════════════════════════════

export const clnHeadingBlockSpec: CLNBlockSpec = {
  type: "clnHeading",
  propSchema: {
    level: { type: "number", default: 1 },
  },
  content: "inline",
};

// ═══════════════════════════════════════════════════════════════════
// Paragraph: default text block
// ═══════════════════════════════════════════════════════════════════

export const clnParagraphBlockSpec: CLNBlockSpec = {
  type: "clnParagraph",
  propSchema: {},
  content: "inline",
};

// ═══════════════════════════════════════════════════════════════════
// Fenced code block: ```lang ... ```
// ═══════════════════════════════════════════════════════════════════

export const clnCodeBlockSpec: CLNBlockSpec = {
  type: "clnCodeBlock",
  propSchema: {
    language: { type: "string", default: "" },
    code: { type: "string", default: "" },
  },
  content: "none",
};

// ═══════════════════════════════════════════════════════════════════
// Unordered list: - item
// ═══════════════════════════════════════════════════════════════════

export const clnUnorderedListBlockSpec: CLNBlockSpec = {
  type: "clnUnorderedList",
  propSchema: {},
  content: "inline",
};

// ═══════════════════════════════════════════════════════════════════
// Ordered list: 1. item
// ═══════════════════════════════════════════════════════════════════

export const clnOrderedListBlockSpec: CLNBlockSpec = {
  type: "clnOrderedList",
  propSchema: {
    startNumber: { type: "number", default: 1 },
  },
  content: "inline",
};

// ═══════════════════════════════════════════════════════════════════
// Blockquote: > text
// ═══════════════════════════════════════════════════════════════════

export const clnBlockquoteBlockSpec: CLNBlockSpec = {
  type: "clnBlockquote",
  propSchema: {},
  content: "inline",
};

// ═══════════════════════════════════════════════════════════════════
// Thematic break: ---
// ═══════════════════════════════════════════════════════════════════

export const clnThematicBreakBlockSpec: CLNBlockSpec = {
  type: "clnThematicBreak",
  propSchema: {},
  content: "none",
};

// ═══════════════════════════════════════════════════════════════════
// Meta block: ::meta{ key = "value" }
// ═══════════════════════════════════════════════════════════════════

export const clnMetaBlockSpec: CLNBlockSpec = {
  type: "clnMeta",
  propSchema: {
    /** JSON-encoded key-value pairs. Stored as string because BlockNote
     *  props must be serializable primitives. */
    entries: { type: "string", default: "{}" },
  },
  content: "none",
};

// ═══════════════════════════════════════════════════════════════════
// Collected map of all core block specs
// ═══════════════════════════════════════════════════════════════════

export const CORE_BLOCK_SPECS: Record<string, CLNBlockSpec> = {
  clnHeading: clnHeadingBlockSpec,
  clnParagraph: clnParagraphBlockSpec,
  clnCodeBlock: clnCodeBlockSpec,
  clnUnorderedList: clnUnorderedListBlockSpec,
  clnOrderedList: clnOrderedListBlockSpec,
  clnBlockquote: clnBlockquoteBlockSpec,
  clnThematicBreak: clnThematicBreakBlockSpec,
  clnMeta: clnMetaBlockSpec,
};
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add editor/src/schema/core-blocks.ts editor/src/schema/core-blocks.test.ts
git commit -m "feat: define core block specs for headings, paragraphs, lists, code, meta"
```

---

### Task 13: Define directive block specs from registry

**Files:**
- Create: `editor/src/schema/directive-blocks.ts`
- Create: `editor/src/schema/directive-blocks.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/schema/directive-blocks.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildDirectiveBlockSpec,
  buildAllDirectiveBlockSpecs,
  DIRECTIVE_BLOCK_SPECS,
} from "./directive-blocks";
import type { RegistryDirective } from "./registry-types";

describe("buildDirectiveBlockSpec", () => {
  it("maps parsed-mode directive to inline content block", () => {
    const directive: RegistryDirective = {
      name: "callout",
      placement: "block",
      body_mode: "parsed",
      emits: ["callout"],
      built_in: true,
      attributes: [
        { name: "kind", type: "string", required: true, allowed_values: ["info", "warning", "danger", "tip"] },
        { name: "title", type: "string", required: false },
        { name: "compact", type: "boolean", required: false, default: false },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnCallout");
    expect(spec.content).toBe("inline");
    expect(spec.propSchema.kind.type).toBe("string");
    expect(spec.propSchema.kind.default).toBe("info");
    expect(spec.propSchema.title.type).toBe("string");
    expect(spec.propSchema.title.default).toBe("");
    expect(spec.propSchema.compact.type).toBe("boolean");
    expect(spec.propSchema.compact.default).toBe(false);
    expect(spec.directiveName).toBe("callout");
    expect(spec.bodyMode).toBe("parsed");
  });

  it("maps raw-mode directive (non-table) to none content block", () => {
    const directive: RegistryDirective = {
      name: "math",
      placement: "block",
      body_mode: "raw",
      emits: ["math"],
      built_in: true,
      attributes: [],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnMath");
    expect(spec.content).toBe("none");
    expect(spec.propSchema.rawContent.type).toBe("string");
    expect(spec.propSchema.rawContent.default).toBe("");
    expect(spec.bodyMode).toBe("raw");
  });

  it("maps table directive to table content block", () => {
    const directive: RegistryDirective = {
      name: "table",
      placement: "block",
      body_mode: "raw",
      emits: ["table"],
      built_in: true,
      attributes: [
        { name: "header", type: "boolean", required: false, default: false },
        { name: "align", type: "string[]", required: false, allowed_values: ["left", "center", "right"] },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnTable");
    expect(spec.content).toBe("table");
    expect(spec.propSchema.header.type).toBe("boolean");
    expect(spec.propSchema.header.default).toBe(false);
    expect(spec.propSchema.tableData.type).toBe("string");
    expect(spec.propSchema.tableData.default).toBe("[]");
    expect(spec.bodyMode).toBe("raw");
  });

  it("maps none-mode directive to void block", () => {
    const directive: RegistryDirective = {
      name: "toc",
      placement: "block",
      body_mode: "none",
      emits: ["toc"],
      built_in: true,
      attributes: [],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnToc");
    expect(spec.content).toBe("none");
    expect(spec.bodyMode).toBe("none");
  });

  it("maps anchor with id attribute", () => {
    const directive: RegistryDirective = {
      name: "anchor",
      placement: "block",
      body_mode: "none",
      emits: ["anchor"],
      built_in: true,
      attributes: [
        { name: "id", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnAnchor");
    expect(spec.propSchema.id.type).toBe("string");
    expect(spec.propSchema.id.default).toBe("");
  });

  it("maps source directive with language attribute and rawContent", () => {
    const directive: RegistryDirective = {
      name: "source",
      placement: "block",
      body_mode: "raw",
      emits: ["source"],
      built_in: true,
      attributes: [
        { name: "language", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnSource");
    expect(spec.propSchema.language.type).toBe("string");
    expect(spec.propSchema.language.default).toBe("");
    expect(spec.propSchema.rawContent.type).toBe("string");
    expect(spec.content).toBe("none");
  });

  it("maps figure directive as parsed-mode block", () => {
    const directive: RegistryDirective = {
      name: "figure",
      placement: "block",
      body_mode: "parsed",
      emits: ["figure"],
      built_in: true,
      attributes: [
        { name: "src", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnFigure");
    expect(spec.content).toBe("inline");
    expect(spec.propSchema.src.type).toBe("string");
  });
});

describe("buildAllDirectiveBlockSpecs", () => {
  it("builds specs for all block directives", () => {
    const specs = buildAllDirectiveBlockSpecs();
    const types = Object.keys(specs);

    // 8 block directives (ref is inline, excluded)
    expect(types).toHaveLength(8);
    expect(types).toContain("clnCallout");
    expect(types).toContain("clnFigure");
    expect(types).toContain("clnMath");
    expect(types).toContain("clnTable");
    expect(types).toContain("clnSource");
    expect(types).toContain("clnToc");
    expect(types).toContain("clnAnchor");
    expect(types).toContain("clnInclude");
  });

  it("excludes inline directives", () => {
    const specs = buildAllDirectiveBlockSpecs();
    const types = Object.keys(specs);
    expect(types).not.toContain("clnRef");
  });
});

describe("DIRECTIVE_BLOCK_SPECS constant", () => {
  it("is pre-built from the registry", () => {
    expect(Object.keys(DIRECTIVE_BLOCK_SPECS)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/schema/directive-blocks.ts`:

```typescript
/**
 * Directive block specifications generated from the registry.
 *
 * Each directive in the registry maps to a BlockNote block spec
 * based on its body_mode:
 *
 *   body_mode="parsed" -> content: "inline" (nested contentEditable)
 *   body_mode="raw"    -> content: "none" (code editor, rawContent prop)
 *   body_mode="none"   -> content: "none" (void block, no body)
 *
 * Special case: table is body_mode="raw" but gets content: "table"
 * because it needs a custom editable table UI, not a code editor.
 */

import type { CLNPropDef } from "./core-blocks";
import {
  getBlockDirectives,
  type RegistryDirective,
  type RegistryAttribute,
} from "./registry-types";

/** Extended block spec that includes registry metadata. */
export interface CLNDirectiveBlockSpec {
  type: string;
  propSchema: Record<string, CLNPropDef>;
  content: "inline" | "none" | "table";
  directiveName: string;
  bodyMode: "parsed" | "raw" | "none";
  registryAttributes: RegistryAttribute[];
}

/**
 * Convert a directive name to a BlockNote block type name.
 * "callout" -> "clnCallout", "toc" -> "clnToc"
 */
function toBlockType(directiveName: string): string {
  return "cln" + directiveName.charAt(0).toUpperCase() + directiveName.slice(1);
}

/**
 * Determine the default value for an attribute based on its type.
 */
function attrDefault(attr: RegistryAttribute): string | number | boolean {
  if (attr.default !== undefined) {
    if (typeof attr.default === "boolean") return attr.default;
    if (typeof attr.default === "number") return attr.default;
    return String(attr.default);
  }

  // For required string attributes with allowed_values, default to the first
  if (attr.type === "string" && attr.allowed_values && attr.allowed_values.length > 0) {
    return attr.allowed_values[0];
  }

  switch (attr.type) {
    case "string":
      return "";
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string[]":
      return ""; // Serialized as string for BlockNote prop compatibility
    default:
      return "";
  }
}

/**
 * Map a registry attribute type to a BlockNote prop type.
 */
function attrPropType(attr: RegistryAttribute): "string" | "number" | "boolean" {
  switch (attr.type) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    default:
      return "string"; // string, string[] both stored as string props
  }
}

/**
 * Build a BlockNote block spec from a registry directive.
 */
export function buildDirectiveBlockSpec(
  directive: RegistryDirective
): CLNDirectiveBlockSpec {
  const propSchema: Record<string, CLNPropDef> = {};

  // Map each registry attribute to a BlockNote prop
  for (const attr of directive.attributes) {
    // Skip align for table — it's encoded in tableData
    if (directive.name === "table" && attr.name === "align") {
      continue;
    }

    propSchema[attr.name] = {
      type: attrPropType(attr),
      default: attrDefault(attr),
    };
  }

  // Determine content model based on body_mode
  let content: "inline" | "none" | "table";
  if (directive.name === "table") {
    content = "table";
    // Table stores its cell data as a JSON-encoded prop
    propSchema["tableData"] = { type: "string", default: "[]" };
  } else if (directive.body_mode === "parsed") {
    content = "inline";
  } else {
    content = "none";
    // Raw-mode directives store their body text in a prop
    if (directive.body_mode === "raw") {
      propSchema["rawContent"] = { type: "string", default: "" };
    }
  }

  return {
    type: toBlockType(directive.name),
    propSchema,
    content,
    directiveName: directive.name,
    bodyMode: directive.body_mode as "parsed" | "raw" | "none",
    registryAttributes: directive.attributes,
  };
}

/**
 * Build block specs for all block-placement directives in the registry.
 */
export function buildAllDirectiveBlockSpecs(): Record<
  string,
  CLNDirectiveBlockSpec
> {
  const specs: Record<string, CLNDirectiveBlockSpec> = {};
  for (const directive of getBlockDirectives()) {
    const spec = buildDirectiveBlockSpec(directive);
    specs[spec.type] = spec;
  }
  return specs;
}

/** Pre-built directive block specs from the built-in registry. */
export const DIRECTIVE_BLOCK_SPECS = buildAllDirectiveBlockSpecs();
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add editor/src/schema/directive-blocks.ts editor/src/schema/directive-blocks.test.ts
git commit -m "feat: generate directive block specs from registry with body_mode mapping"
```

---

### Task 14: Define inline mark specs (strong, emphasis, code, note, link, ref)

**Files:**
- Create: `editor/src/schema/inline-marks.ts`
- Create: `editor/src/schema/inline-marks.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/schema/inline-marks.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  CLN_INLINE_MARKS,
  INLINE_NESTING_WHITELIST,
  isNestingAllowed,
} from "./inline-marks";

describe("CLN_INLINE_MARKS", () => {
  it("defines all 6 inline mark types", () => {
    const names = Object.keys(CLN_INLINE_MARKS);
    expect(names).toHaveLength(6);
    expect(names).toContain("clnStrong");
    expect(names).toContain("clnEmphasis");
    expect(names).toContain("clnCode");
    expect(names).toContain("clnNote");
    expect(names).toContain("clnLink");
    expect(names).toContain("clnRef");
  });

  it("strong uses +{ as opener and } as closer", () => {
    const mark = CLN_INLINE_MARKS.clnStrong;
    expect(mark.clnSyntax.open).toBe("+{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("strong");
  });

  it("emphasis uses *{ as opener and } as closer", () => {
    const mark = CLN_INLINE_MARKS.clnEmphasis;
    expect(mark.clnSyntax.open).toBe("*{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("em");
  });

  it("code uses backtick delimiters", () => {
    const mark = CLN_INLINE_MARKS.clnCode;
    expect(mark.clnSyntax.open).toBe("`");
    expect(mark.clnSyntax.close).toBe("`");
    expect(mark.tag).toBe("code");
  });

  it("note uses ^{ as opener", () => {
    const mark = CLN_INLINE_MARKS.clnNote;
    expect(mark.clnSyntax.open).toBe("^{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("sup");
  });

  it("link has label and target structure", () => {
    const mark = CLN_INLINE_MARKS.clnLink;
    expect(mark.clnSyntax.open).toBe("[");
    expect(mark.clnSyntax.separator).toBe(" -> ");
    expect(mark.clnSyntax.close).toBe("]");
    expect(mark.tag).toBe("a");
    expect(mark.attrs).toContain("href");
  });

  it("ref is an inline directive", () => {
    const mark = CLN_INLINE_MARKS.clnRef;
    expect(mark.clnSyntax.open).toBe("::ref[");
    expect(mark.clnSyntax.close).toBe("]");
    expect(mark.tag).toBe("a");
    expect(mark.attrs).toContain("target");
  });
});

describe("INLINE_NESTING_WHITELIST", () => {
  it("allows code inside strong", () => {
    expect(INLINE_NESTING_WHITELIST.clnStrong).toEqual(["clnCode"]);
  });

  it("allows code inside emphasis", () => {
    expect(INLINE_NESTING_WHITELIST.clnEmphasis).toEqual(["clnCode"]);
  });

  it("does not allow nesting inside code", () => {
    expect(INLINE_NESTING_WHITELIST.clnCode).toEqual([]);
  });

  it("allows strong, emphasis, code, link, ref inside note", () => {
    expect(INLINE_NESTING_WHITELIST.clnNote).toEqual([
      "clnStrong",
      "clnEmphasis",
      "clnCode",
      "clnLink",
      "clnRef",
    ]);
  });

  it("allows strong, emphasis, code inside link label", () => {
    expect(INLINE_NESTING_WHITELIST.clnLink).toEqual([
      "clnStrong",
      "clnEmphasis",
      "clnCode",
    ]);
  });
});

describe("isNestingAllowed", () => {
  it("returns true for code inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnCode")).toBe(true);
  });

  it("returns false for strong inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnStrong")).toBe(false);
  });

  it("returns false for emphasis inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnEmphasis")).toBe(false);
  });

  it("returns false for link inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnLink")).toBe(false);
  });

  it("returns true for strong inside note", () => {
    expect(isNestingAllowed("clnNote", "clnStrong")).toBe(true);
  });

  it("returns true for link inside note", () => {
    expect(isNestingAllowed("clnNote", "clnLink")).toBe(true);
  });

  it("returns false for anything inside code", () => {
    expect(isNestingAllowed("clnCode", "clnStrong")).toBe(false);
    expect(isNestingAllowed("clnCode", "clnEmphasis")).toBe(false);
    expect(isNestingAllowed("clnCode", "clnLink")).toBe(false);
  });

  it("returns false for unknown parent", () => {
    expect(isNestingAllowed("unknown", "clnCode")).toBe(false);
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/schema/inline-marks.ts`:

```typescript
/**
 * ClearNotation inline mark specifications for TipTap (via BlockNote).
 *
 * ClearNotation inline constructs:
 *   +{strong}      -> <strong>
 *   *{emphasis}    -> <em>
 *   `code`         -> <code>
 *   ^{note}        -> <sup> (footnote marker)
 *   [label -> url] -> <a href="url">
 *   ::ref[target]  -> <a href="#target"> (cross-reference)
 *
 * Nesting rules (whitelist approach):
 *   - strong/emphasis ONLY allow code_span inside them
 *   - code allows NO nesting (atomic)
 *   - note allows strong, emphasis, code, link, ref
 *   - link label allows strong, emphasis, code
 *   - ref allows NO nesting (atomic)
 */

/** Syntax description for a ClearNotation inline construct. */
export interface CLNInlineSyntax {
  /** Opening delimiter. */
  open: string;
  /** Closing delimiter. */
  close: string;
  /** Separator between parts (only for link: " -> "). */
  separator?: string;
}

/** Specification for a ClearNotation inline mark. */
export interface CLNInlineMark {
  /** TipTap mark name. */
  name: string;
  /** ClearNotation syntax delimiters. */
  clnSyntax: CLNInlineSyntax;
  /** HTML tag to render as. */
  tag: string;
  /** Attribute names this mark carries (e.g., "href" for links). */
  attrs: string[];
  /** Whether this mark's content is parsed (false = atomic like code). */
  contentParsed: boolean;
}

export const CLN_INLINE_MARKS: Record<string, CLNInlineMark> = {
  clnStrong: {
    name: "clnStrong",
    clnSyntax: { open: "+{", close: "}" },
    tag: "strong",
    attrs: [],
    contentParsed: true,
  },
  clnEmphasis: {
    name: "clnEmphasis",
    clnSyntax: { open: "*{", close: "}" },
    tag: "em",
    attrs: [],
    contentParsed: true,
  },
  clnCode: {
    name: "clnCode",
    clnSyntax: { open: "`", close: "`" },
    tag: "code",
    attrs: [],
    contentParsed: false,
  },
  clnNote: {
    name: "clnNote",
    clnSyntax: { open: "^{", close: "}" },
    tag: "sup",
    attrs: [],
    contentParsed: true,
  },
  clnLink: {
    name: "clnLink",
    clnSyntax: { open: "[", close: "]", separator: " -> " },
    tag: "a",
    attrs: ["href"],
    contentParsed: true,
  },
  clnRef: {
    name: "clnRef",
    clnSyntax: { open: "::ref[", close: "]" },
    tag: "a",
    attrs: ["target"],
    contentParsed: false,
  },
};

/**
 * Whitelist of which marks can appear inside which other marks.
 *
 * This is the ClearNotation nesting rule: strong/emphasis ONLY allow
 * code_span inside them. Notes are more permissive. Code and ref are atomic.
 */
export const INLINE_NESTING_WHITELIST: Record<string, string[]> = {
  clnStrong: ["clnCode"],
  clnEmphasis: ["clnCode"],
  clnCode: [],
  clnNote: ["clnStrong", "clnEmphasis", "clnCode", "clnLink", "clnRef"],
  clnLink: ["clnStrong", "clnEmphasis", "clnCode"],
  clnRef: [],
};

/**
 * Check if a child mark is allowed inside a parent mark.
 */
export function isNestingAllowed(
  parentMark: string,
  childMark: string
): boolean {
  const allowed = INLINE_NESTING_WHITELIST[parentMark];
  if (!allowed) return false;
  return allowed.includes(childMark);
}
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add editor/src/schema/inline-marks.ts editor/src/schema/inline-marks.test.ts
git commit -m "feat: define inline mark specs with nesting whitelist rules"
```

---

### Task 15: Build the slash menu configuration from registry

**Files:**
- Create: `editor/src/schema/slash-menu.ts`
- Create: `editor/src/schema/slash-menu.test.ts`

- [ ] **Step 1: Write the test first**

Create `editor/src/schema/slash-menu.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildSlashMenuItems,
  type SlashMenuItem,
} from "./slash-menu";

describe("buildSlashMenuItems", () => {
  let items: SlashMenuItem[];

  beforeAll(() => {
    items = buildSlashMenuItems();
  });

  it("returns items for all insertable block types", () => {
    // Core: heading (6 levels), paragraph, code block, unordered list,
    //        ordered list, blockquote, thematic break
    // Directives: callout, figure, math, table, source, toc, anchor
    // Excluded: meta (only one per doc, not from slash menu), include (unsupported in browser)
    expect(items.length).toBeGreaterThanOrEqual(15);
  });

  it("includes heading levels 1-3 as separate items", () => {
    const headings = items.filter((i) => i.blockType === "clnHeading");
    expect(headings.length).toBeGreaterThanOrEqual(3);

    const h1 = headings.find((h) => h.label === "Heading 1");
    expect(h1).toBeDefined();
    expect(h1!.props).toEqual({ level: 1 });

    const h2 = headings.find((h) => h.label === "Heading 2");
    expect(h2).toBeDefined();
    expect(h2!.props).toEqual({ level: 2 });

    const h3 = headings.find((h) => h.label === "Heading 3");
    expect(h3).toBeDefined();
    expect(h3!.props).toEqual({ level: 3 });
  });

  it("includes paragraph", () => {
    const para = items.find((i) => i.blockType === "clnParagraph");
    expect(para).toBeDefined();
    expect(para!.label).toBe("Paragraph");
  });

  it("includes code block", () => {
    const code = items.find((i) => i.blockType === "clnCodeBlock");
    expect(code).toBeDefined();
    expect(code!.label).toBe("Code Block");
  });

  it("includes callout with default kind", () => {
    const callout = items.find((i) => i.blockType === "clnCallout");
    expect(callout).toBeDefined();
    expect(callout!.label).toBe("Callout");
    expect(callout!.group).toBe("Directives");
  });

  it("includes math", () => {
    const math = items.find((i) => i.blockType === "clnMath");
    expect(math).toBeDefined();
    expect(math!.label).toBe("Math");
  });

  it("includes table", () => {
    const table = items.find((i) => i.blockType === "clnTable");
    expect(table).toBeDefined();
    expect(table!.label).toBe("Table");
  });

  it("includes toc", () => {
    const toc = items.find((i) => i.blockType === "clnToc");
    expect(toc).toBeDefined();
    expect(toc!.label).toBe("Table of Contents");
  });

  it("includes anchor", () => {
    const anchor = items.find((i) => i.blockType === "clnAnchor");
    expect(anchor).toBeDefined();
    expect(anchor!.label).toBe("Anchor");
  });

  it("excludes include (unsupported in browser editor)", () => {
    const inc = items.find((i) => i.blockType === "clnInclude");
    expect(inc).toBeUndefined();
  });

  it("excludes meta (not insertable from slash menu)", () => {
    const meta = items.find((i) => i.blockType === "clnMeta");
    expect(meta).toBeUndefined();
  });

  it("groups core syntax and directives separately", () => {
    const groups = new Set(items.map((i) => i.group));
    expect(groups).toContain("Basic blocks");
    expect(groups).toContain("Directives");
  });

  it("all items have aliases for fuzzy matching", () => {
    for (const item of items) {
      expect(Array.isArray(item.aliases)).toBe(true);
    }
  });

  it("source has aliases including 'code highlight'", () => {
    const source = items.find((i) => i.blockType === "clnSource");
    expect(source).toBeDefined();
    expect(source!.aliases).toContain("code");
    expect(source!.aliases).toContain("highlight");
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `editor/src/schema/slash-menu.ts`:

```typescript
/**
 * Slash menu items generated from core blocks and the directive registry.
 *
 * When the user types "/" in the editor, BlockNote shows a menu of insertable
 * blocks. This module generates that menu from the registry so it stays in
 * sync with the language specification.
 *
 * Exclusions:
 *   - ::include is unsupported in the browser editor (no file system access)
 *   - ::meta is not insertable from the slash menu (only one per document,
 *     typically at the top)
 */

import { DIRECTIVE_BLOCK_SPECS, type CLNDirectiveBlockSpec } from "./directive-blocks";

/** A slash menu item. */
export interface SlashMenuItem {
  /** Display label in the menu. */
  label: string;
  /** The BlockNote block type to insert. */
  blockType: string;
  /** Menu group for visual separation. */
  group: string;
  /** Default props to set on the inserted block. */
  props: Record<string, unknown>;
  /** Search aliases for fuzzy matching. */
  aliases: string[];
  /** Short description shown in the menu. */
  description: string;
}

/** Human-readable labels and descriptions for directives. */
const DIRECTIVE_LABELS: Record<
  string,
  { label: string; description: string; aliases: string[] }
> = {
  callout: {
    label: "Callout",
    description: "Info, warning, danger, or tip callout box",
    aliases: ["admonition", "alert", "note", "warning", "info", "tip", "danger"],
  },
  figure: {
    label: "Figure",
    description: "Image with caption",
    aliases: ["image", "img", "picture"],
  },
  math: {
    label: "Math",
    description: "LaTeX math block",
    aliases: ["latex", "equation", "formula"],
  },
  table: {
    label: "Table",
    description: "Data table with optional header",
    aliases: ["grid", "data", "rows", "columns"],
  },
  source: {
    label: "Source Block",
    description: "Highlighted source code block (directive)",
    aliases: ["code", "highlight", "syntax"],
  },
  toc: {
    label: "Table of Contents",
    description: "Auto-generated table of contents",
    aliases: ["contents", "outline", "navigation"],
  },
  anchor: {
    label: "Anchor",
    description: "Named anchor for cross-references",
    aliases: ["bookmark", "link target", "id"],
  },
  include: {
    label: "Include",
    description: "Include another .cln file",
    aliases: ["import", "embed"],
  },
};

/** Directives excluded from the slash menu. */
const EXCLUDED_DIRECTIVES = new Set(["include"]);

/**
 * Build the full list of slash menu items.
 */
export function buildSlashMenuItems(): SlashMenuItem[] {
  const items: SlashMenuItem[] = [];

  // ── Core blocks ──────────────────────────────────────────────────

  // Headings 1-3 as separate items (4-6 accessible but not in menu)
  items.push({
    label: "Heading 1",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 1 },
    aliases: ["h1", "title"],
    description: "Top-level heading",
  });

  items.push({
    label: "Heading 2",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 2 },
    aliases: ["h2", "section"],
    description: "Section heading",
  });

  items.push({
    label: "Heading 3",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 3 },
    aliases: ["h3", "subsection"],
    description: "Subsection heading",
  });

  items.push({
    label: "Paragraph",
    blockType: "clnParagraph",
    group: "Basic blocks",
    props: {},
    aliases: ["text", "body"],
    description: "Plain text paragraph",
  });

  items.push({
    label: "Bullet List",
    blockType: "clnUnorderedList",
    group: "Basic blocks",
    props: {},
    aliases: ["unordered", "ul", "bullets", "list"],
    description: "Unordered bullet list item",
  });

  items.push({
    label: "Numbered List",
    blockType: "clnOrderedList",
    group: "Basic blocks",
    props: { startNumber: 1 },
    aliases: ["ordered", "ol", "numbers", "list"],
    description: "Ordered numbered list item",
  });

  items.push({
    label: "Blockquote",
    blockType: "clnBlockquote",
    group: "Basic blocks",
    props: {},
    aliases: ["quote", "citation"],
    description: "Block quotation",
  });

  items.push({
    label: "Code Block",
    blockType: "clnCodeBlock",
    group: "Basic blocks",
    props: { language: "" },
    aliases: ["code", "fence", "snippet", "pre"],
    description: "Fenced code block with syntax highlighting",
  });

  items.push({
    label: "Horizontal Rule",
    blockType: "clnThematicBreak",
    group: "Basic blocks",
    props: {},
    aliases: ["hr", "divider", "separator", "---"],
    description: "Thematic break (horizontal rule)",
  });

  // ── Directive blocks ─────────────────────────────────────────────

  for (const [, spec] of Object.entries(DIRECTIVE_BLOCK_SPECS)) {
    if (EXCLUDED_DIRECTIVES.has(spec.directiveName)) continue;

    const meta = DIRECTIVE_LABELS[spec.directiveName] ?? {
      label: spec.directiveName,
      description: `${spec.directiveName} directive`,
      aliases: [],
    };

    items.push({
      label: meta.label,
      blockType: spec.type,
      group: "Directives",
      props: buildDefaultProps(spec),
      aliases: meta.aliases,
      description: meta.description,
    });
  }

  return items;
}

/**
 * Build default props for a directive block spec.
 */
function buildDefaultProps(
  spec: CLNDirectiveBlockSpec
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(spec.propSchema)) {
    props[key] = def.default;
  }
  return props;
}

/** Pre-built slash menu items. */
export const SLASH_MENU_ITEMS = buildSlashMenuItems();
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add editor/src/schema/slash-menu.ts editor/src/schema/slash-menu.test.ts
git commit -m "feat: generate slash menu items from registry and core blocks"
```

---

### Task 16: Create the unified schema barrel export

**Files:**
- Create: `editor/src/schema/index.ts`
- Create: `editor/src/schema/schema.test.ts`

- [ ] **Step 1: Write the integration test first**

Create `editor/src/schema/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  CORE_BLOCK_SPECS,
  DIRECTIVE_BLOCK_SPECS,
  CLN_INLINE_MARKS,
  SLASH_MENU_ITEMS,
  ALL_BLOCK_SPECS,
  getBlockSpecByType,
  getDirectiveSpecByName,
} from "./index";

describe("schema integration", () => {
  it("ALL_BLOCK_SPECS combines core and directive specs", () => {
    const coreCount = Object.keys(CORE_BLOCK_SPECS).length;
    const directiveCount = Object.keys(DIRECTIVE_BLOCK_SPECS).length;
    const allCount = Object.keys(ALL_BLOCK_SPECS).length;

    expect(allCount).toBe(coreCount + directiveCount);
    expect(allCount).toBe(16); // 8 core + 8 directive
  });

  it("no type name collisions between core and directive specs", () => {
    const coreTypes = new Set(Object.keys(CORE_BLOCK_SPECS));
    const directiveTypes = Object.keys(DIRECTIVE_BLOCK_SPECS);

    for (const dt of directiveTypes) {
      expect(coreTypes.has(dt)).toBe(false);
    }
  });

  it("every slash menu item references a valid block type", () => {
    for (const item of SLASH_MENU_ITEMS) {
      expect(ALL_BLOCK_SPECS[item.blockType]).toBeDefined();
    }
  });

  it("getBlockSpecByType finds core blocks", () => {
    const heading = getBlockSpecByType("clnHeading");
    expect(heading).toBeDefined();
    expect(heading!.type).toBe("clnHeading");
  });

  it("getBlockSpecByType finds directive blocks", () => {
    const callout = getBlockSpecByType("clnCallout");
    expect(callout).toBeDefined();
  });

  it("getBlockSpecByType returns undefined for unknown type", () => {
    expect(getBlockSpecByType("clnUnknown")).toBeUndefined();
  });

  it("getDirectiveSpecByName finds by directive name", () => {
    const callout = getDirectiveSpecByName("callout");
    expect(callout).toBeDefined();
    expect(callout!.directiveName).toBe("callout");
  });

  it("getDirectiveSpecByName returns undefined for non-directive", () => {
    expect(getDirectiveSpecByName("heading")).toBeUndefined();
  });

  it("inline marks are complete", () => {
    expect(Object.keys(CLN_INLINE_MARKS)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Write the barrel export**

Create `editor/src/schema/index.ts`:

```typescript
/**
 * ClearNotation editor schema.
 *
 * This module combines:
 *   - Core block specs (headings, paragraphs, lists, code, meta)
 *   - Directive block specs (from the registry)
 *   - Inline mark specs (strong, emphasis, code, note, link, ref)
 *   - Slash menu items
 *
 * It is the single source of truth for the editor's block and inline model.
 */

export {
  CORE_BLOCK_SPECS,
  clnHeadingBlockSpec,
  clnParagraphBlockSpec,
  clnCodeBlockSpec,
  clnUnorderedListBlockSpec,
  clnOrderedListBlockSpec,
  clnBlockquoteBlockSpec,
  clnThematicBreakBlockSpec,
  clnMetaBlockSpec,
  type CLNBlockSpec,
  type CLNPropDef,
} from "./core-blocks";

export {
  DIRECTIVE_BLOCK_SPECS,
  buildDirectiveBlockSpec,
  buildAllDirectiveBlockSpecs,
  type CLNDirectiveBlockSpec,
} from "./directive-blocks";

export {
  CLN_INLINE_MARKS,
  INLINE_NESTING_WHITELIST,
  isNestingAllowed,
  type CLNInlineMark,
  type CLNInlineSyntax,
} from "./inline-marks";

export {
  SLASH_MENU_ITEMS,
  buildSlashMenuItems,
  type SlashMenuItem,
} from "./slash-menu";

export {
  loadRegistry,
  getBlockDirectives,
  getInlineDirectives,
  getParsedModeDirectives,
  getRawModeDirectives,
  getNoneModeDirectives,
  type Registry,
  type RegistryDirective,
  type RegistryAttribute,
} from "./registry-types";

// ── Unified lookups ────────────────────────────────────────────────

import { CORE_BLOCK_SPECS, type CLNBlockSpec } from "./core-blocks";
import {
  DIRECTIVE_BLOCK_SPECS,
  type CLNDirectiveBlockSpec,
} from "./directive-blocks";

/** All block specs (core + directive), keyed by block type name. */
export const ALL_BLOCK_SPECS: Record<
  string,
  CLNBlockSpec | CLNDirectiveBlockSpec
> = {
  ...CORE_BLOCK_SPECS,
  ...DIRECTIVE_BLOCK_SPECS,
};

/** Look up a block spec by its type name (e.g., "clnHeading"). */
export function getBlockSpecByType(
  type: string
): CLNBlockSpec | CLNDirectiveBlockSpec | undefined {
  return ALL_BLOCK_SPECS[type];
}

/** Look up a directive block spec by its directive name (e.g., "callout"). */
export function getDirectiveSpecByName(
  directiveName: string
): CLNDirectiveBlockSpec | undefined {
  return Object.values(DIRECTIVE_BLOCK_SPECS).find(
    (spec) => spec.directiveName === directiveName
  );
}
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add editor/src/schema/index.ts editor/src/schema/schema.test.ts
git commit -m "feat: unified schema barrel export with block/inline/menu lookups"
```

---

### Task 17: Remove the spike-blocks.ts file and update main.tsx imports

**Files:**
- Remove: `editor/src/spike-blocks.ts`
- Modify: `editor/src/main.tsx`

- [ ] **Step 1: Update main.tsx to import from the new schema module**

Replace the contents of `editor/src/main.tsx`:

```tsx
import React, { useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  ALL_BLOCK_SPECS,
  CLN_INLINE_MARKS,
  SLASH_MENU_ITEMS,
  DIRECTIVE_BLOCK_SPECS,
} from "./schema";

function EditorApp() {
  const editor = useMemo(() => {
    return BlockNoteEditor.create();
  }, []);

  const hasLogged = useRef(false);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    // Log schema summary to console
    console.log("=== ClearNotation Editor Schema ===");
    console.log(`Block specs: ${Object.keys(ALL_BLOCK_SPECS).length}`);
    console.log(`Inline marks: ${Object.keys(CLN_INLINE_MARKS).length}`);
    console.log(`Slash menu items: ${SLASH_MENU_ITEMS.length}`);
    console.log("");

    console.log("Block types:");
    for (const [type, spec] of Object.entries(ALL_BLOCK_SPECS)) {
      const props = Object.keys(spec.propSchema).join(", ") || "(none)";
      console.log(`  ${type} [content=${spec.content}] props: ${props}`);
    }

    console.log("\nDirective blocks:");
    for (const [, spec] of Object.entries(DIRECTIVE_BLOCK_SPECS)) {
      console.log(
        `  ::${spec.directiveName} -> ${spec.type} [${spec.bodyMode}]`
      );
    }

    console.log("\nInline marks:");
    for (const [name, mark] of Object.entries(CLN_INLINE_MARKS)) {
      console.log(
        `  ${name}: ${mark.clnSyntax.open}...${mark.clnSyntax.close} -> <${mark.tag}>`
      );
    }

    console.log("\nSlash menu:");
    for (const item of SLASH_MENU_ITEMS) {
      console.log(`  [${item.group}] ${item.label} -> ${item.blockType}`);
    }
  }, []);

  return <BlockNoteView editor={editor} theme="light" />;
}

const container = document.getElementById("editor");
if (container) {
  const root = createRoot(container);
  root.render(<EditorApp />);
}
```

- [ ] **Step 2: Remove spike-blocks.ts**

```bash
rm /Users/ryan/projects/clear-notation/editor/src/spike-blocks.ts
```

- [ ] **Step 3: Verify the editor still builds**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add editor/src/main.tsx
git rm editor/src/spike-blocks.ts
git commit -m "refactor: replace spike-blocks with schema module imports"
```

---

### Task 18: Final verification — run all tests and build

- [ ] **Step 1: Run all editor tests**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm test
```

Expected: all tests pass. Count should be approximately:
- types.test.ts: 7 tests
- parser.test.ts: 7 tests
- cst-utils.test.ts: 10 tests
- registry-types.test.ts: 10 tests
- core-blocks.test.ts: 9 tests
- directive-blocks.test.ts: 10 tests
- inline-marks.test.ts: 14 tests
- slash-menu.test.ts: 13 tests
- schema.test.ts: 8 tests

- [ ] **Step 2: Run the production build**

```bash
cd /Users/ryan/projects/clear-notation/editor
pnpm build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify bundle size is still within budget**

```bash
cd /Users/ryan/projects/clear-notation/editor
ls -la dist/assets/*.js
for f in dist/assets/*.js; do gzip -c "$f" | wc -c; done
```

Expected: gzipped JS total still under 750KB (schema modules add negligible size since they're data).

- [ ] **Step 4: Run root workspace tests**

```bash
cd /Users/ryan/projects/clear-notation
pnpm test
```

Expected: editor tests pass, other packages either pass or have no tests.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: Phase 1-2 complete — tree-sitter WASM parser module + BlockNote schema from registry"
```
