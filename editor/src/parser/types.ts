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
