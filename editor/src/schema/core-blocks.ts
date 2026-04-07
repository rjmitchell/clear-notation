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
