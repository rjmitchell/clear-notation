/**
 * Normalized AST types for ClearNotation.
 *
 * These mirror the Python models.py normalized AST (NHeading, NParagraph, etc.)
 * and form the renderer-facing data model produced by the normalizer.
 *
 * All node types use a `type` discriminant for the discriminated union pattern.
 */

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------

export interface NText {
  type: "text";
  value: string;
}

export interface NCodeSpan {
  type: "code_span";
  value: string;
}

export interface NStrong {
  type: "strong";
  children: NormalizedInline[];
}

export interface NEmphasis {
  type: "emphasis";
  children: NormalizedInline[];
}

export interface NLink {
  type: "link";
  label: NormalizedInline[];
  target: string;
}

export interface NNote {
  type: "note";
  children: NormalizedInline[];
  number: number;
}

export interface NRef {
  type: "ref";
  target: string;
}

export type NormalizedInline =
  | NText
  | NCodeSpan
  | NStrong
  | NEmphasis
  | NLink
  | NNote
  | NRef;

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export interface NHeading {
  type: "heading";
  level: number;
  id: string;
  content: NormalizedInline[];
}

export interface NParagraph {
  type: "paragraph";
  content: NormalizedInline[];
  id?: string;
}

export interface NThematicBreak {
  type: "thematic_break";
}

export interface NBlockQuote {
  type: "blockquote";
  lines: NormalizedInline[][];
  id?: string;
}

export interface NListItem {
  content: NormalizedInline[];
  blocks: NormalizedBlock[];
}

export interface NUnorderedList {
  type: "unordered_list";
  items: NListItem[];
  id?: string;
}

export interface NOrderedItem {
  ordinal: number;
  content: NormalizedInline[];
  blocks: NormalizedBlock[];
}

export interface NOrderedList {
  type: "ordered_list";
  items: NOrderedItem[];
  id?: string;
}

export interface NToc {
  type: "toc";
  id?: string;
}

export interface NCallout {
  type: "callout";
  kind: string;
  title: string | undefined;
  compact: boolean;
  blocks: NormalizedBlock[];
  id?: string;
}

export interface NFigure {
  type: "figure";
  src: string;
  blocks: NormalizedBlock[];
  id?: string;
}

export interface NMathBlock {
  type: "math_block";
  text: string;
  id?: string;
}

export interface NTableCell {
  content: NormalizedInline[];
}

export interface NTableRow {
  cells: NTableCell[];
}

export interface NTable {
  type: "table";
  header: boolean;
  align: string[] | undefined;
  rows: NTableRow[];
  id?: string;
}

export interface NSourceBlock {
  type: "source_block";
  language: string;
  text: string;
  id?: string;
}

export type NormalizedBlock =
  | NHeading
  | NParagraph
  | NThematicBreak
  | NBlockQuote
  | NUnorderedList
  | NOrderedList
  | NToc
  | NCallout
  | NFigure
  | NMathBlock
  | NTable
  | NSourceBlock;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface NormalizedDocument {
  meta: Record<string, unknown>;
  blocks: NormalizedBlock[];
  notes: NNote[];
}
