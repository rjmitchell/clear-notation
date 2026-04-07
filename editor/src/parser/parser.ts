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

  getState(): ParserState {
    return this.state;
  }

  getError(): string | null {
    return this.initError;
  }

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
            originalHandler?.call(this.worker!, event);
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

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.state = "uninitialized";
    this.initPromise = null;
    this.initError = null;

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
    }
  }
}
