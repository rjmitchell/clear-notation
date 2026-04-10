/**
 * Block serializer: converts a single BlockNote block back to
 * ClearNotation source text.
 *
 * Handles core block types (heading, paragraph, list, code, etc.)
 * and directive blocks (callout, table, math, etc.) via the registry.
 */

import type { BNBlock } from "../converter/types";
import { getDirectiveSpecByName } from "../schema/index";
import { serializeInline } from "./inline-serializer";
import { escapeAttribute, escapeTableCell } from "./escaping";

/**
 * Serialize a single BlockNote block to ClearNotation source text.
 */
export function serializeBlock(block: BNBlock, depth: number = 0): string {
  // parseError blocks emit raw text as-is
  if (block.parseError && block.props.rawContent) {
    return String(block.props.rawContent);
  }

  switch (block.type) {
    case "clnHeading":
      return serializeHeading(block);
    case "clnParagraph":
      return serializeParagraph(block);
    case "clnCodeBlock":
      return serializeCodeBlock(block);
    case "clnThematicBreak":
      return "---";
    case "clnUnorderedList":
      return serializeUnorderedList(block, depth);
    case "clnOrderedList":
      return serializeOrderedList(block, depth);
    case "clnBlockquote":
      return serializeBlockquote(block);
    case "clnMeta":
      return serializeMeta(block);
    case "clnComment":
      return `// ${block.props.text || ""}`;
    default:
      return serializeDirective(block);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Core block serializers
// ═══════════════════════════════════════════════════════════════════

function serializeHeading(block: BNBlock): string {
  const level = typeof block.props.level === "number" ? block.props.level : 1;
  const hashes = "#".repeat(level);
  const inline = serializeInline(block.content);
  return `${hashes} ${inline}`;
}

function serializeParagraph(block: BNBlock): string {
  return serializeInline(block.content);
}

function serializeCodeBlock(block: BNBlock): string {
  const lang = block.props.language || "";
  const code = block.props.code || "";
  return "```" + lang + "\n" + code + "\n```";
}

function serializeUnorderedList(block: BNBlock, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const inline = serializeInline(block.content);
  const lines = [`${indent}- ${inline}`];

  for (const child of block.children) {
    if (child.type === "clnUnorderedList" || child.type === "clnOrderedList") {
      lines.push(serializeBlock(child, depth + 1));
    } else if (child.type === "clnParagraph") {
      const childIndent = indent + "  ";
      lines.push("");  // blank line before continuation
      lines.push(`${childIndent}${serializeInline(child.content)}`);
    }
  }

  return lines.join("\n");
}

function serializeOrderedList(block: BNBlock, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const num = typeof block.props.startNumber === "number" ? block.props.startNumber : 1;
  const marker = `${num}. `;
  const inline = serializeInline(block.content);
  const lines = [`${indent}${marker}${inline}`];

  for (const child of block.children) {
    if (child.type === "clnUnorderedList" || child.type === "clnOrderedList") {
      lines.push(serializeBlock(child, depth + 1));
    } else if (child.type === "clnParagraph") {
      const childIndent = indent + " ".repeat(marker.length);
      lines.push("");  // blank line before continuation
      lines.push(`${childIndent}${serializeInline(child.content)}`);
    }
  }

  return lines.join("\n");
}

function serializeBlockquote(block: BNBlock): string {
  const inline = serializeInline(block.content);
  const lines = inline.split("\n");
  return lines.map((line) => `> ${line}`).join("\n");
}

function serializeMeta(block: BNBlock): string {
  const entriesJson = typeof block.props.entries === "string" ? block.props.entries : "{}";
  let entries: Record<string, unknown>;
  try {
    entries = JSON.parse(entriesJson);
  } catch {
    entries = {};
  }

  const keys = Object.keys(entries);
  if (keys.length === 0) {
    return "::meta{\n}";
  }

  const lines = keys.map((key) => formatMetaEntry(key, entries[key]));
  return "::meta{\n" + lines.join("\n") + "\n}";
}

function formatMetaEntry(key: string, value: unknown): string {
  if (typeof value === "string") {
    return `${key} = "${escapeAttribute(value)}"`;
  }
  if (typeof value === "boolean") {
    return `${key} = ${value}`;
  }
  if (typeof value === "number") {
    return `${key} = ${value}`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) =>
      typeof v === "string" ? `"${escapeAttribute(v)}"` : String(v)
    );
    return `${key} = [${items.join(", ")}]`;
  }
  return `${key} = "${escapeAttribute(String(value))}"`;
}

// ═══════════════════════════════════════════════════════════════════
// Directive serializer
// ═══════════════════════════════════════════════════════════════════

/**
 * Derive the directive name from a block type.
 * "clnCallout" → "callout", "clnToc" → "toc"
 */
function toDirectiveName(blockType: string): string {
  const name = blockType.replace(/^cln/, "");
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function serializeDirective(block: BNBlock): string {
  const directiveName = toDirectiveName(block.type);
  const spec = getDirectiveSpecByName(directiveName);

  const attrs = serializeAttributes(block, directiveName);
  const attrStr = attrs ? `[${attrs}]` : "";

  if (!spec) {
    // Unknown directive — best effort: emit with attrs only
    return `::${directiveName}${attrStr}`;
  }

  switch (spec.bodyMode) {
    case "none":
      return `::${directiveName}${attrStr}`;

    case "raw": {
      if (directiveName === "table") {
        return serializeTableDirective(block, directiveName, attrStr);
      }
      const raw = block.props.rawContent || "";
      return `::${directiveName}${attrStr}{\n${raw}\n}`;
    }

    case "parsed": {
      const childLines = block.children
        .map((child) => serializeBlock(child))
        .join("\n");
      if (childLines) {
        return `::${directiveName}${attrStr}{\n${childLines}\n}`;
      }
      // Empty parsed body
      return `::${directiveName}${attrStr}{\n}`;
    }

    default:
      return `::${directiveName}${attrStr}`;
  }
}

/**
 * Serialize block props as directive attributes.
 * Skips internal props (rawContent, tableData) and props at their default value.
 */
function serializeAttributes(block: BNBlock, directiveName: string): string {
  const spec = getDirectiveSpecByName(directiveName);
  const parts: string[] = [];

  for (const [key, value] of Object.entries(block.props)) {
    // Skip internal props
    if (key === "rawContent" || key === "tableData") continue;

    // Check against spec for defaults
    if (spec) {
      const attrSpec = spec.registryAttributes.find((a) => a.name === key);
      if (attrSpec) {
        // Skip if value equals default (unless required)
        if (!attrSpec.required && attrSpec.default !== undefined) {
          if (value === attrSpec.default) continue;
        }
        // Skip non-required attrs with empty/falsy default values
        if (!attrSpec.required && attrSpec.default === undefined) {
          if (value === "" || value === false || value === 0) continue;
        }
      }
    }

    // Format the attribute value
    if (typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (typeof value === "number") {
      parts.push(`${key}=${value}`);
    } else {
      parts.push(`${key}="${escapeAttribute(String(value))}"`);
    }
  }

  return parts.join(" ");
}

/**
 * Serialize a table directive from its tableData prop.
 */
function serializeTableDirective(
  block: BNBlock,
  directiveName: string,
  attrStr: string
): string {
  const tableDataJson = typeof block.props.tableData === "string" ? block.props.tableData : "[]";
  let rows: string[][];
  try {
    rows = JSON.parse(tableDataJson);
  } catch {
    rows = [];
  }

  const serializedRows = rows.map((row) =>
    row.map((cell) => escapeTableCell(cell)).join(" | ")
  );

  if (serializedRows.length === 0) {
    return `::${directiveName}${attrStr}{\n}`;
  }

  return `::${directiveName}${attrStr}{\n${serializedRows.join("\n")}\n}`;
}
