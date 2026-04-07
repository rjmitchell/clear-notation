/**
 * Inline converter: walks CST inline nodes and produces BNInlineContent[].
 *
 * Uses "style stacking": when entering a `strong` node, adds `clnStrong: true`
 * to the active styles map, then recurses. Text nodes inherit active styles.
 */

import type { CSTNode } from "../parser/types";
import type { BNInlineContent, BNStyledText, BNLink } from "./types";
import { findChildByType, getDirectiveName, getAttributeMap } from "../parser/cst-utils";

/** Node types that map directly to a BNStyledText leaf. */
const TEXT_TYPES = new Set([
  "text",
  "styled_text",
  "note_text",
  "link_text",
]);

/** Delimiter/punctuation nodes to skip entirely. */
const SKIP_TYPES = new Set([
  "strong_open",
  "styled_close",
  "note_open",
  "note_close",
  "emphasis_open",
  "link_open",
  "link_close",
  "link_separator",
  "code_span_delimiter",
  "directive_marker",
  "directive_name",
  "attribute_list",
]);

/**
 * Convert a CST inline node (or container) to BlockNote inline content.
 *
 * @param node - A CST node from the inline portion of the tree.
 * @param activeStyles - Styles inherited from ancestor nodes.
 * @returns An array of BNInlineContent items.
 */
export function convertInline(
  node: CSTNode,
  activeStyles: Record<string, boolean | string> = {}
): BNInlineContent[] {
  const { type } = node;

  // ── leaf: text nodes ────────────────────────────────────
  if (TEXT_TYPES.has(type)) {
    return [styledText(node.text, activeStyles)];
  }

  // ── leaf: escape sequence ───────────────────────────────
  if (type === "escape_sequence") {
    // Text is e.g. "\\{" — take the char after the backslash.
    const char = node.text.length > 1 ? node.text.slice(1) : node.text;
    return [styledText(char, activeStyles)];
  }

  // ── skip: delimiters and punctuation ────────────────────
  if (SKIP_TYPES.has(type)) {
    return [];
  }

  // ── strong: +{...} ─────────────────────────────────────
  if (type === "strong") {
    return recurseChildren(node, { ...activeStyles, clnStrong: true });
  }

  // ── emphasis: *{...} ───────────────────────────────────
  if (type === "emphasis") {
    return recurseChildren(node, { ...activeStyles, clnEmphasis: true });
  }

  // ── note: ^{...} ──────────────────────────────────────
  if (type === "note") {
    return recurseChildren(node, { ...activeStyles, clnNote: true });
  }

  // ── code_span: `...` ──────────────────────────────────
  if (type === "code_span") {
    const content = findChildByType(node, "code_span_content");
    const text = content ? content.text : "";
    return [styledText(text, { ...activeStyles, clnCode: true })];
  }

  // ── link: [label -> url] ──────────────────────────────
  if (type === "link") {
    return [convertLink(node, activeStyles)];
  }

  // ── inline_directive (ref): ::ref[target="x"] ─────────
  if (type === "inline_directive") {
    return convertInlineDirective(node, activeStyles);
  }

  // ── container: recurse children with current styles ───
  return recurseChildren(node, activeStyles);
}

// ── helpers ────────────────────────────────────────────────

function styledText(
  text: string,
  styles: Record<string, boolean | string>
): BNStyledText {
  return { type: "text", text, styles: { ...styles } };
}

function recurseChildren(
  node: CSTNode,
  styles: Record<string, boolean | string>
): BNInlineContent[] {
  const result: BNInlineContent[] = [];
  for (const child of node.children) {
    result.push(...convertInline(child, styles));
  }
  return result;
}

function convertLink(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNLink {
  // Find the link target (URL)
  const targetNode = findChildByType(node, "link_target");
  const href = targetNode ? targetNode.text.trim() : "";

  // Find the link label and convert its children
  const labelNode = findChildByType(node, "link_label");
  const content: BNStyledText[] = [];

  if (labelNode) {
    // Recurse into the label's children; links can contain styled text
    const inlineResults = recurseChildren(labelNode, activeStyles);
    // BNLink.content is BNStyledText[], flatten any nested links to text
    for (const item of inlineResults) {
      if (item.type === "text") {
        content.push(item);
      }
    }
  }

  return { type: "link", href, content };
}

function convertInlineDirective(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNInlineContent[] {
  const name = getDirectiveName(node);

  if (name === "ref") {
    const attrs = getAttributeMap(node);
    const target = typeof attrs.target === "string" ? attrs.target : "";
    return [styledText(target, { ...activeStyles, clnRef: target })];
  }

  // Unknown inline directive — pass through text
  return [styledText(node.text, activeStyles)];
}
