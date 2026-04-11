/**
 * Phase A integration tests — full round-trip through the conversion +
 * serialization pipeline. These verify that notes, refs, and anchors
 * survive source → BNBlock[] → serialized source byte-identical when
 * the visual pane does not edit the content.
 *
 * Uses the same real-tree-sitter vi.mock pattern established in Design 1's
 * parse-source.test.ts — the production ClearNotationParser constructs a
 * Web Worker that JSDOM lacks, so we mock `../parser` with a Node-side
 * class that calls `web-tree-sitter` directly.
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
import { serializeDocument } from "../serializer";

async function roundTrip(source: string): Promise<string> {
  const result = await parseSourceToBlocks(source);
  if (result.state === "broken") {
    throw new Error(
      `unexpected broken state for source: ${JSON.stringify(source)}`
    );
  }
  return serializeDocument(result.blocks);
}

describe("Phase A — round-trip correctness", () => {
  it("footnote with plain content round-trips byte-identical", async () => {
    const source = "This paragraph has a ^{simple note} inside it.\n";
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("footnote with nested bold round-trips byte-identical", async () => {
    const source = "Text with a ^{+{bold}} footnote.\n";
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("footnote containing a ref round-trips byte-identical", async () => {
    const source =
      'Prose ^{See ::ref[target="intro"] for details} ends here.\n';
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("inline ref round-trips byte-identical", async () => {
    const source = 'See ::ref[target="intro"] for the setup.\n';
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("anchor before heading round-trips byte-identical", async () => {
    const source = '::anchor[id="intro"]\n# Introduction\n';
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("anchor before paragraph round-trips byte-identical", async () => {
    const source = '::anchor[id="note-1"]\nSome prose in a paragraph.\n';
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });

  it("all three constructs mixed in one document round-trips byte-identical", async () => {
    const source =
      '::anchor[id="top"]\n' +
      "# Document Heading\n" +
      "\n" +
      'First paragraph with ^{a note} and ::ref[target="top"] in one line.\n';
    const out = await roundTrip(source);
    expect(out).toBe(source);
  });
});
