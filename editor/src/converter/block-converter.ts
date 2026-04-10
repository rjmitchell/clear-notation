/**
 * Block converter: maps block-level CST nodes to BNBlock[].
 *
 * Delegates to convertInline for inline content within blocks.
 * Returns an array because some nodes (lists) expand to multiple blocks.
 */

import type { CSTNode } from "../parser/types";
import type { BNBlock, BNInlineContent, ConvertOptions } from "./types";
import { convertInline } from "./inline-converter";
import {
  findChildByType,
  findChildrenByType,
  getDirectiveName,
  getHeadingLevel,
  getAttributeMap,
  getBodyText,
} from "../parser/cst-utils";
import { getDirectiveSpecByName } from "../schema";

// ── public API ────────────────────────────────────────────────

/**
 * Convert a block-level CST node to one or more BNBlocks.
 *
 * Async because parsed-mode directives may need to re-parse body text.
 */
export async function convertBlock(
  node: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock[]> {
  // Error nodes → error paragraph
  if (node.type === "ERROR" || node.hasError) {
    return [errorBlock(node)];
  }

  switch (node.type) {
    case "heading":
      return [convertHeading(node)];

    case "paragraph":
      return [convertParagraph(node)];

    case "fenced_code_block":
      return [convertFencedCodeBlock(node)];

    case "thematic_break":
      return [{ type: "clnThematicBreak", props: {}, content: [], children: [] }];

    case "unordered_list":
      return convertUnorderedList(node, options);

    case "ordered_list":
      return convertOrderedList(node, options);

    case "blockquote":
      return [convertBlockquote(node)];

    case "meta_block":
      return [convertMetaBlock(node)];

    case "comment":
      return [{
        type: "clnComment",
        props: { text: node.text.replace(/^[ \t]*\/\/\s?/, "").replace(/\s+$/, "") },
        content: [],
        children: [],
      }];

    case "block_directive_self_closing":
      return [convertSelfClosingDirective(node)];

    case "block_directive_with_body":
      return [await convertBodyDirective(node, options)];

    default:
      // Unknown block type: treat as paragraph with raw text
      return [
        {
          type: "clnParagraph",
          props: {},
          content: [{ type: "text", text: node.text, styles: {} }],
          children: [],
        },
      ];
  }
}

// ── heading ───────────────────────────────────────────────────

function convertHeading(node: CSTNode): BNBlock {
  const level = getHeadingLevel(node);
  const inlineNode = findChildByType(node, "inline_content");
  const content = inlineNode ? convertInline(inlineNode) : [];

  return {
    type: "clnHeading",
    props: { level },
    content,
    children: [],
  };
}

// ── paragraph ─────────────────────────────────────────────────

function convertParagraph(node: CSTNode): BNBlock {
  const lines = findChildrenByType(node, "paragraph_line");
  const content: BNInlineContent[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineNode = findChildByType(line, "inline_content");
    if (inlineNode) {
      content.push(...convertInline(inlineNode));
    }
    // Join lines with a newline text node (except after the last line)
    if (i < lines.length - 1) {
      content.push({ type: "text", text: "\n", styles: {} });
    }
  }

  return {
    type: "clnParagraph",
    props: {},
    content,
    children: [],
  };
}

// ── fenced code block ─────────────────────────────────────────

function convertFencedCodeBlock(node: CSTNode): BNBlock {
  const langNode = findChildByType(node, "language_tag");
  const language = langNode ? langNode.text : "";

  const codeNode = findChildByType(node, "code_block_content");
  const code = codeNode ? codeNode.text : "";

  return {
    type: "clnCodeBlock",
    props: { language, code },
    content: [],
    children: [],
  };
}

// ── unordered list ────────────────────────────────────────────

function convertUnorderedList(node: CSTNode, options?: ConvertOptions): BNBlock[] {
  const items = findChildrenByType(node, "unordered_list_item");
  return items.map((item) => {
    const inlineNode = findChildByType(item, "inline_content");
    const content = inlineNode ? convertInline(inlineNode) : [];

    const bodyNode = findChildByType(item, "list_item_body");
    const children: BNBlock[] = [];
    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === "nested_list") {
          const innerList = child.children.find(
            (c: CSTNode) => c.type === "unordered_list" || c.type === "ordered_list"
          );
          if (innerList) {
            const converted = innerList.type === "unordered_list"
              ? convertUnorderedList(innerList, options)
              : convertOrderedList(innerList, options);
            children.push(...converted);
          }
        } else if (child.type === "list_item_continuation") {
          const contInline = findChildByType(child, "inline_content");
          if (contInline) {
            children.push({
              type: "clnParagraph",
              props: {},
              content: convertInline(contInline),
              children: [],
            });
          }
        }
      }
    }

    return {
      type: "clnUnorderedList",
      props: {},
      content,
      children,
    };
  });
}

// ── ordered list ──────────────────────────────────────────────

function convertOrderedList(node: CSTNode, options?: ConvertOptions): BNBlock[] {
  const items = findChildrenByType(node, "ordered_list_item");
  return items.map((item) => {
    const markerNode = findChildByType(item, "ordered_list_marker");
    const startNumber = markerNode
      ? parseInt(markerNode.text.replace(/\D/g, ""), 10) || 1
      : 1;

    const inlineNode = findChildByType(item, "inline_content");
    const content = inlineNode ? convertInline(inlineNode) : [];

    const bodyNode = findChildByType(item, "list_item_body");
    const children: BNBlock[] = [];
    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === "nested_list") {
          const innerList = child.children.find(
            (c: CSTNode) => c.type === "unordered_list" || c.type === "ordered_list"
          );
          if (innerList) {
            const converted = innerList.type === "unordered_list"
              ? convertUnorderedList(innerList, options)
              : convertOrderedList(innerList, options);
            children.push(...converted);
          }
        } else if (child.type === "list_item_continuation") {
          const contInline = findChildByType(child, "inline_content");
          if (contInline) {
            children.push({
              type: "clnParagraph",
              props: {},
              content: convertInline(contInline),
              children: [],
            });
          }
        }
      }
    }

    return {
      type: "clnOrderedList",
      props: { startNumber },
      content,
      children,
    };
  });
}

// ── blockquote ────────────────────────────────────────────────

function convertBlockquote(node: CSTNode): BNBlock {
  const lines = findChildrenByType(node, "blockquote_line");
  const content: BNInlineContent[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineNode = findChildByType(line, "inline_content");
    if (inlineNode) {
      content.push(...convertInline(inlineNode));
    }
    if (i < lines.length - 1) {
      content.push({ type: "text", text: "\n", styles: {} });
    }
  }

  return {
    type: "clnBlockquote",
    props: {},
    content,
    children: [],
  };
}

// ── meta block ────────────────────────────────────────────────

function convertMetaBlock(node: CSTNode): BNBlock {
  const entries: Record<string, unknown> = {};
  const metaEntries = findChildrenByType(node, "meta_entry");

  for (const entry of metaEntries) {
    const keyNode = findChildByType(entry, "meta_key");
    const valueNode = findChildByType(entry, "value");
    if (!keyNode || !valueNode) continue;

    const key = keyNode.text;
    entries[key] = parseMetaValue(valueNode);
  }

  return {
    type: "clnMeta",
    props: { entries: JSON.stringify(entries) },
    content: [],
    children: [],
  };
}

function parseMetaValue(valueNode: CSTNode): unknown {
  // Check for string
  const stringNode = findChildByType(valueNode, "string");
  if (stringNode) {
    const content = findChildByType(stringNode, "string_content");
    return content ? content.text : "";
  }

  // Check for boolean
  const boolNode = findChildByType(valueNode, "boolean");
  if (boolNode) {
    return boolNode.text === "true";
  }

  // Check for integer
  const intNode = findChildByType(valueNode, "integer");
  if (intNode) {
    return parseInt(intNode.text, 10);
  }

  // Check for array
  const arrayNode = findChildByType(valueNode, "array");
  if (arrayNode) {
    const elements: string[] = [];
    for (const child of arrayNode.children) {
      if (child.type === "string") {
        const content = findChildByType(child, "string_content");
        elements.push(content ? content.text : "");
      }
    }
    return elements;
  }

  // Fallback: raw text
  return valueNode.text;
}

// ── self-closing directive ────────────────────────────────────

function convertSelfClosingDirective(node: CSTNode): BNBlock {
  const name = getDirectiveName(node);
  const spec = name ? getDirectiveSpecByName(name) : undefined;

  if (!spec) {
    // Unknown directive — fallback to paragraph
    return {
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: node.text, styles: {} }],
      children: [],
    };
  }

  const attrs = getAttributeMap(node);
  const props = coerceProps(attrs, spec.propSchema);

  return {
    type: spec.type,
    props,
    content: [],
    children: [],
  };
}

// ── body directive ────────────────────────────────────────────

async function convertBodyDirective(
  node: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock> {
  const name = getDirectiveName(node);
  const spec = name ? getDirectiveSpecByName(name) : undefined;

  if (!spec) {
    return {
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: node.text, styles: {} }],
      children: [],
    };
  }

  const attrs = getAttributeMap(node);
  const props = coerceProps(attrs, spec.propSchema);
  const bodyText = getBodyText(node);

  if (spec.bodyMode === "raw") {
    // Special case: table directive stores tableData
    if (spec.directiveName === "table") {
      props.tableData = JSON.stringify(parseTableData(bodyText));
    } else {
      props.rawContent = bodyText;
    }

    return {
      type: spec.type,
      props,
      content: [],
      children: [],
    };
  }

  // parsed mode: re-parse body text and convert recursively
  if (spec.bodyMode === "parsed") {
    if (options?.parseFn) {
      const bodyCst = await options.parseFn(bodyText);
      // Dynamic import to avoid circular dependency
      const { convertDocument } = await import("./converter");
      const children = await convertDocument(bodyCst, options);

      return {
        type: spec.type,
        props,
        content: [],
        children,
      };
    }

    // No parseFn — fallback to text content
    return {
      type: spec.type,
      props,
      content: bodyText
        ? [{ type: "text", text: bodyText, styles: {} }]
        : [],
      children: [],
    };
  }

  // body_mode = "none" with a body (shouldn't happen, but handle gracefully)
  return {
    type: spec.type,
    props,
    content: [],
    children: [],
  };
}

// ── helpers ───────────────────────────────────────────────────

/**
 * Parse table body text into a 2D array of cell strings.
 */
function parseTableData(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

/**
 * Coerce raw attribute values to match the expected prop schema types.
 */
function coerceProps(
  attrs: Record<string, string | boolean | number | string[]>,
  propSchema: Record<string, { type: string; default: string | number | boolean }>
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(attrs)) {
    const schemaDef = propSchema[key];
    if (!schemaDef) {
      // Attribute not in schema — store as string
      props[key] = Array.isArray(value) ? value.join(", ") : String(value);
      continue;
    }

    switch (schemaDef.type) {
      case "boolean":
        props[key] = typeof value === "boolean" ? value : value === "true";
        break;
      case "number":
        props[key] = typeof value === "number" ? value : parseInt(String(value), 10) || 0;
        break;
      default:
        // string — arrays become comma-separated
        props[key] = Array.isArray(value) ? value.join(", ") : String(value);
        break;
    }
  }

  return props;
}

/**
 * Create an error fallback block from a node with parse errors.
 */
function errorBlock(node: CSTNode): BNBlock {
  return {
    type: "clnParagraph",
    props: {},
    content: [{ type: "text", text: node.text, styles: {} }],
    children: [],
    parseError: true,
  };
}
