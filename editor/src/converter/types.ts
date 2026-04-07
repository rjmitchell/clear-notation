/**
 * Converter output types that mirror BlockNote's document model.
 *
 * These types are intentionally independent of BlockNote imports so the
 * converter logic can be tested and used without pulling in the full
 * editor dependency tree. The BlockNote schema adapter maps these
 * types to real BlockNote blocks at the editor boundary.
 */

import type { CSTNode } from "../parser/types";

/** A styled text span (maps to BlockNote's StyledText). */
export interface BNStyledText {
  type: "text";
  text: string;
  styles: Record<string, boolean | string>;
}

/** A link containing styled text spans (maps to BlockNote's Link). */
export interface BNLink {
  type: "link";
  href: string;
  content: BNStyledText[];
}

/** Inline content: either styled text or a link. */
export type BNInlineContent = BNStyledText | BNLink;

/** A single row in a table block. */
export interface BNTableRow {
  cells: BNInlineContent[][];
}

/** Table content wrapper used by table blocks. */
export interface BNTableContent {
  type: "tableContent";
  rows: BNTableRow[];
}

/**
 * A generic block in the BlockNote document model.
 *
 * The converter produces these; the schema adapter consumes them.
 * `type` is a string like "paragraph", "heading", "codeBlock", etc.
 */
export interface BNBlock {
  id?: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content: BNInlineContent[];
  children: BNBlock[];
  parseError?: boolean;
}

/** Options for the top-level document converter. */
export interface ConvertOptions {
  parseFn?: (source: string) => Promise<CSTNode>;
}
