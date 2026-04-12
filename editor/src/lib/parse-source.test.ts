/**
 * Tests for parseSourceToBlocks discriminated-union refactor.
 *
 * Testing strategy (Option A): real tree-sitter grammar, no Worker.
 *
 * The production `ClearNotationParser` constructs a Web Worker, which
 * JSDOM does not provide, so we mock `../parser` with a Node-side class
 * that calls `web-tree-sitter` directly. The engine WASM is loaded from
 * node_modules and the language WASM is loaded from editor/public via
 * `fs.readFileSync`, then both are handed to tree-sitter in-memory (the
 * `wasmBinary` init option bypasses the normal `locateFile` fetch path).
 *
 * This means the grammar assertions below — e.g. "'+{bold}' fails and
 * '+{bold}\n' succeeds" — are running against the real ClearNotation
 * grammar, so the recovered-path tests exercise the actual failure mode
 * the feature is meant to fix.
 */

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { CSTNode, ParseResult as ParserParseResult } from "../parser/types";

vi.mock("../parser", async () => {
  const engineWasm = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../node_modules/web-tree-sitter/web-tree-sitter.wasm"
    )
  );
  const langWasm = fs.readFileSync(
    path.resolve(__dirname, "../../public/tree-sitter-clearnotation.wasm")
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TS = (await import("web-tree-sitter")) as any;
  const Parser = TS.Parser;
  const Language = TS.Language;
  await Parser.init({ wasmBinary: engineWasm });
  const lang = await Language.load(new Uint8Array(langWasm));

  // Walk a tree-sitter SyntaxNode and produce the same CSTNode shape
  // that parser-worker.ts:serializeNode produces. Only named children
  // are included, matching the worker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function serializeNode(node: any): CSTNode {
    const children: CSTNode[] = [];
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) children.push(serializeNode(child));
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

  class MockClearNotationParser {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parser: any = null;

    async init(_wasmUrl: string): Promise<void> {
      this.parser = new Parser();
      this.parser.setLanguage(lang);
    }

    async parse(source: string): Promise<ParserParseResult> {
      if (!this.parser) throw new Error("not initialized");
      const tree = this.parser.parse(source);
      if (!tree) throw new Error("parse returned null");
      const serialized = serializeNode(tree.rootNode);
      tree.delete();
      return { tree: serialized, parseTimeMs: 0 };
    }

    dispose(): void {
      this.parser = null;
    }
  }

  return { ClearNotationParser: MockClearNotationParser };
});

import { parseSourceToBlocks } from "./parse-source";

describe("parseSourceToBlocks — discriminated union", () => {
  it("returns state:valid for clean source", async () => {
    const result = await parseSourceToBlocks("hello world\n");
    expect(result.state).toBe("valid");
    if (result.state === "valid") {
      expect(Array.isArray(result.blocks)).toBe(true);
      expect(result.blocks.length).toBeGreaterThan(0);
    }
  });

  it("returns state:recovered for source missing trailing newline (screenshot reproduction)", async () => {
    const result = await parseSourceToBlocks("  +{bold}");
    expect(result.state).toBe("recovered");
    if (result.state === "recovered") {
      expect(Array.isArray(result.blocks)).toBe(true);
    }
  });

  it("returns state:recovered for '+{bold}' with no leading whitespace", async () => {
    const result = await parseSourceToBlocks("+{bold}");
    expect(result.state).toBe("recovered");
  });

  it("state:recovered blocks match state:valid blocks for same intended content", async () => {
    const recovered = await parseSourceToBlocks("+{bold}");
    const valid = await parseSourceToBlocks("+{bold}\n");
    expect(recovered.state).toBe("recovered");
    expect(valid.state).toBe("valid");
    if (recovered.state === "recovered" && valid.state === "valid") {
      expect(recovered.blocks).toEqual(valid.blocks);
    }
  });

  it("returns state:broken for unclosed fenced code block", async () => {
    const result = await parseSourceToBlocks("```python\nprint('oops')\n");
    expect(result.state).toBe("broken");
    if (result.state === "broken") {
      expect(result.blocks).toBeNull();
    }
  });

  it("returns state:broken for unterminated attribute list", async () => {
    const result = await parseSourceToBlocks('::callout[type="note\n  body\n}\n');
    expect(result.state).toBe("broken");
  });

  it("discriminated union narrows blocks to non-null on valid state", async () => {
    const result = await parseSourceToBlocks("hello\n");
    if (result.state === "valid") {
      const count: number = result.blocks.length;
      expect(count).toBeGreaterThanOrEqual(0);
    } else {
      expect.fail("Expected valid state");
    }
  });

  it("discriminated union narrows blocks to null on broken state", async () => {
    const result = await parseSourceToBlocks("```unterminated\n");
    if (result.state === "broken") {
      expect(result.blocks).toBeNull();
    } else {
      expect.fail("Expected broken state");
    }
  });
});
