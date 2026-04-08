/**
 * Source text → BNBlock[] pipeline.
 *
 * Lazily initializes the tree-sitter WASM parser, parses CLN source,
 * and converts the resulting CST to BNBlocks via the converter module.
 * Returns null when the parse tree contains errors (fail-closed).
 */

import { ClearNotationParser } from "../parser";
import { convertDocument } from "../converter";
import type { BNBlock } from "../converter/types";

let parser: ClearNotationParser | null = null;
let initPromise: Promise<void> | null = null;

async function ensureParser(): Promise<ClearNotationParser> {
  if (!parser) {
    parser = new ClearNotationParser();
    initPromise = parser.init("/tree-sitter-clearnotation.wasm").catch((err) => {
      console.error("[parse-source] Parser init failed:", err);
      parser = null;
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return parser;
}

/**
 * Parse ClearNotation source text into BNBlocks.
 *
 * Returns null if the source has parse errors (the visual editor
 * should keep showing the last valid state in that case).
 */
export async function parseSourceToBlocks(
  source: string
): Promise<BNBlock[] | null> {
  const p = await ensureParser();
  const result = await p.parse(source);

  // Fail-closed: if the tree has any errors, refuse to convert
  if (result.tree.hasError) {
    console.warn("[parse-source] Parse tree has errors, skipping conversion");
    return null;
  }

  const blocks = await convertDocument(result.tree);
  return blocks;
}
