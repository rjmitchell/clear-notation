/**
 * Source text → ParseResult pipeline.
 *
 * Three-state discriminated union:
 *   valid     — raw source parsed cleanly
 *   recovered — raw source had errors, normalized source parsed cleanly
 *   broken    — even the normalized source fails to parse
 *
 * The user's buffer is never mutated — normalization happens on a copy
 * passed to tree-sitter. See docs/superpowers/specs/2026-04-11-bidirectional-trust-design.md.
 */

import { ClearNotationParser } from "../parser";
import { convertDocument } from "../converter";
import type { BNBlock } from "../converter/types";
import { normalizeForLiveParse } from "./live-recovery";

export type SyncState = "valid" | "recovered" | "broken";

/**
 * Discriminated union — type system enforces "broken → no blocks".
 * Consumers should `switch (result.state)` rather than checking
 * `blocks === null` manually.
 */
export type ParseResult =
  | { state: "valid"; blocks: BNBlock[] }
  | { state: "recovered"; blocks: BNBlock[] }
  | { state: "broken"; blocks: null };

let parser: ClearNotationParser | null = null;
let initPromise: Promise<void> | null = null;

async function ensureParser(): Promise<ClearNotationParser> {
  if (!parser) {
    parser = new ClearNotationParser();
    // Use Vite's BASE_URL so the WASM fetch resolves under any deploy base.
    const wasmUrl = `${import.meta.env.BASE_URL}tree-sitter-clearnotation.wasm`;
    initPromise = parser.init(wasmUrl).catch((err) => {
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
 * Parse ClearNotation source text into a ParseResult.
 *
 * Control flow:
 *   1. Try parsing source as-is. If !tree.hasError → valid.
 *   2. Otherwise normalize (append trailing newline) and parse again.
 *      If the normalized parse succeeds → recovered.
 *   3. Otherwise → broken.
 *   4. If ensureParser() throws (WASM fetch fails, etc.) → broken.
 */
export async function parseSourceToBlocks(source: string): Promise<ParseResult> {
  let p: ClearNotationParser;
  try {
    p = await ensureParser();
  } catch {
    return { state: "broken", blocks: null };
  }

  // Step 1: try raw source
  const rawTree = await p.parse(source);
  if (!rawTree.tree.hasError) {
    const blocks = await convertDocument(rawTree.tree);
    return { state: "valid", blocks };
  }

  // Step 2: try normalized source
  const { normalized } = normalizeForLiveParse(source);
  if (normalized !== source) {
    const normalizedTree = await p.parse(normalized);
    if (!normalizedTree.tree.hasError) {
      const blocks = await convertDocument(normalizedTree.tree);
      return { state: "recovered", blocks };
    }
  }

  // Step 3: broken
  return { state: "broken", blocks: null };
}
