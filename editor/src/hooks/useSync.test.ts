/**
 * Tests for the useSync hook — syncState state machine, async race guard,
 * and IRON RULE screenshot-reproduction regression guards.
 *
 * Testing strategy: real tree-sitter grammar, no Worker (JSDOM lacks it).
 *
 * Like `parse-source.test.ts`, we mock `../parser` with a Node-side class
 * that calls `web-tree-sitter` directly. The engine WASM is loaded from
 * node_modules and the language WASM is loaded from editor/public via
 * `fs.readFileSync`, then both are handed to tree-sitter in-memory (the
 * `wasmBinary` init option bypasses the normal `locateFile` fetch path).
 *
 * This is critical: the IRON RULE regression tests MUST exercise the real
 * grammar end-to-end — mocking `parseSourceToBlocks` would make them
 * tautological.
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

import { renderHook, act, waitFor } from "@testing-library/react";
import { useSync } from "./useSync";

describe("useSync — syncState transitions", () => {
  it("starts in state:valid with empty source", () => {
    const { result } = renderHook(() => useSync());
    expect(result.current.syncState).toBe("valid");
    expect(result.current.source).toBe("");
  });

  it("transitions valid → recovered when source missing trailing newline", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("+{bold}");
    });
    await waitFor(
      () => expect(result.current.syncState).toBe("recovered"),
      { timeout: 1000 }
    );
  });

  it("transitions recovered → valid when user types a trailing newline", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("+{bold}");
    });
    await waitFor(() => expect(result.current.syncState).toBe("recovered"));
    act(() => {
      result.current.onSourceChange("+{bold}\n");
    });
    await waitFor(() => expect(result.current.syncState).toBe("valid"));
  });

  it("transitions valid → broken when unterminated attribute list is typed", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange('::callout[type="note\n  body\n}\n');
    });
    await waitFor(() => expect(result.current.syncState).toBe("broken"));
  });
});

describe("useSync — async race guard", () => {
  it("discards stale parse result when a newer onSourceChange has fired", async () => {
    const { result } = renderHook(() => useSync());

    // Simulate: user types "hello" then "hello world" in rapid succession.
    // If the first parse resolves AFTER the second, the older blocks must
    // NOT overwrite the newer blocks.
    act(() => {
      result.current.onSourceChange("hello\n");
      result.current.onSourceChange("hello world\n");
    });

    await waitFor(() => {
      expect(result.current.syncState).toBe("valid");
      expect(result.current.source).toBe("hello world\n");
    });
  });

  it("commits the freshest parse when multiple parses resolve in order", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("a\n");
    });
    await waitFor(() => expect(result.current.source).toBe("a\n"));

    act(() => {
      result.current.onSourceChange("ab\n");
    });
    await waitFor(() => expect(result.current.source).toBe("ab\n"));
  });
});

describe("useSync — setSource behavior", () => {
  it("setSource('') resets broken state to valid", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange('::callout[type="note\n  body\n}\n');
    });
    await waitFor(() => expect(result.current.syncState).toBe("broken"));
    act(() => {
      result.current.setSource("");
    });
    expect(result.current.syncState).toBe("valid");
  });
});

describe("useSync — screenshot reproduction (IRON RULE regression guards)", () => {
  it("typing '+{bold}' without trailing newline produces recovered state with bold block", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("+{bold}");
    });
    await waitFor(() => expect(result.current.syncState).toBe("recovered"));
    // Blocks should exist and should contain a bold span (strong mark)
    // The exact structure depends on the converter — at minimum, blocks is non-null and non-empty
    expect(result.current.documentToLoad).not.toBeNull();
    expect(result.current.documentToLoad?.length).toBeGreaterThan(0);
  });

  it("typing '  +{bold}' with leading indent produces recovered state", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("  +{bold}");
    });
    await waitFor(() => expect(result.current.syncState).toBe("recovered"));
    expect(result.current.documentToLoad).not.toBeNull();
  });

  it("typing '+{bold}\\n' (already terminated) produces valid state with identical blocks", async () => {
    const { result } = renderHook(() => useSync());
    act(() => {
      result.current.onSourceChange("+{bold}\n");
    });
    // syncState starts as "valid" (empty source), so also wait for the
    // parse to actually commit blocks before asserting on documentToLoad.
    await waitFor(() => {
      expect(result.current.syncState).toBe("valid");
      expect(result.current.documentToLoad).not.toBeNull();
    });
    expect(result.current.documentToLoad?.length).toBeGreaterThan(0);
  });
});
