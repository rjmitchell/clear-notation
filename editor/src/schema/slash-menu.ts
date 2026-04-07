/**
 * Slash menu items generated from core blocks and the directive registry.
 *
 * When the user types "/" in the editor, BlockNote shows a menu of insertable
 * blocks. This module generates that menu from the registry so it stays in
 * sync with the language specification.
 *
 * Exclusions:
 *   - ::include is unsupported in the browser editor (no file system access)
 *   - ::meta is not insertable from the slash menu (only one per document,
 *     typically at the top)
 */

import { DIRECTIVE_BLOCK_SPECS, type CLNDirectiveBlockSpec } from "./directive-blocks";

/** A slash menu item. */
export interface SlashMenuItem {
  /** Display label in the menu. */
  label: string;
  /** The BlockNote block type to insert. */
  blockType: string;
  /** Menu group for visual separation. */
  group: string;
  /** Default props to set on the inserted block. */
  props: Record<string, unknown>;
  /** Search aliases for fuzzy matching. */
  aliases: string[];
  /** Short description shown in the menu. */
  description: string;
}

/** Human-readable labels and descriptions for directives. */
const DIRECTIVE_LABELS: Record<
  string,
  { label: string; description: string; aliases: string[] }
> = {
  callout: {
    label: "Callout",
    description: "Info, warning, danger, or tip callout box",
    aliases: ["admonition", "alert", "note", "warning", "info", "tip", "danger"],
  },
  figure: {
    label: "Figure",
    description: "Image with caption",
    aliases: ["image", "img", "picture"],
  },
  math: {
    label: "Math",
    description: "LaTeX math block",
    aliases: ["latex", "equation", "formula"],
  },
  table: {
    label: "Table",
    description: "Data table with optional header",
    aliases: ["grid", "data", "rows", "columns"],
  },
  source: {
    label: "Source Block",
    description: "Highlighted source code block (directive)",
    aliases: ["code", "highlight", "syntax"],
  },
  toc: {
    label: "Table of Contents",
    description: "Auto-generated table of contents",
    aliases: ["contents", "outline", "navigation"],
  },
  anchor: {
    label: "Anchor",
    description: "Named anchor for cross-references",
    aliases: ["bookmark", "link target", "id"],
  },
  include: {
    label: "Include",
    description: "Include another .cln file",
    aliases: ["import", "embed"],
  },
};

/** Directives excluded from the slash menu. */
const EXCLUDED_DIRECTIVES = new Set(["include"]);

/**
 * Build the full list of slash menu items.
 */
export function buildSlashMenuItems(): SlashMenuItem[] {
  const items: SlashMenuItem[] = [];

  // -- Core blocks ------------------------------------------------------

  // Headings 1-3 as separate items (4-6 accessible but not in menu)
  items.push({
    label: "Heading 1",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 1 },
    aliases: ["h1", "title"],
    description: "Top-level heading",
  });

  items.push({
    label: "Heading 2",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 2 },
    aliases: ["h2", "section"],
    description: "Section heading",
  });

  items.push({
    label: "Heading 3",
    blockType: "clnHeading",
    group: "Basic blocks",
    props: { level: 3 },
    aliases: ["h3", "subsection"],
    description: "Subsection heading",
  });

  items.push({
    label: "Paragraph",
    blockType: "clnParagraph",
    group: "Basic blocks",
    props: {},
    aliases: ["text", "body"],
    description: "Plain text paragraph",
  });

  items.push({
    label: "Bullet List",
    blockType: "clnUnorderedList",
    group: "Basic blocks",
    props: {},
    aliases: ["unordered", "ul", "bullets", "list"],
    description: "Unordered bullet list item",
  });

  items.push({
    label: "Numbered List",
    blockType: "clnOrderedList",
    group: "Basic blocks",
    props: { startNumber: 1 },
    aliases: ["ordered", "ol", "numbers", "list"],
    description: "Ordered numbered list item",
  });

  items.push({
    label: "Blockquote",
    blockType: "clnBlockquote",
    group: "Basic blocks",
    props: {},
    aliases: ["quote", "citation"],
    description: "Block quotation",
  });

  items.push({
    label: "Code Block",
    blockType: "clnCodeBlock",
    group: "Basic blocks",
    props: { language: "" },
    aliases: ["code", "fence", "snippet", "pre"],
    description: "Fenced code block with syntax highlighting",
  });

  items.push({
    label: "Horizontal Rule",
    blockType: "clnThematicBreak",
    group: "Basic blocks",
    props: {},
    aliases: ["hr", "divider", "separator", "---"],
    description: "Thematic break (horizontal rule)",
  });

  // -- Directive blocks -------------------------------------------------

  for (const [, spec] of Object.entries(DIRECTIVE_BLOCK_SPECS)) {
    if (EXCLUDED_DIRECTIVES.has(spec.directiveName)) continue;

    const meta = DIRECTIVE_LABELS[spec.directiveName] ?? {
      label: spec.directiveName,
      description: `${spec.directiveName} directive`,
      aliases: [],
    };

    items.push({
      label: meta.label,
      blockType: spec.type,
      group: "Directives",
      props: buildDefaultProps(spec),
      aliases: meta.aliases,
      description: meta.description,
    });
  }

  return items;
}

/**
 * Build default props for a directive block spec.
 */
function buildDefaultProps(
  spec: CLNDirectiveBlockSpec
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(spec.propSchema)) {
    props[key] = def.default;
  }
  return props;
}

/** Pre-built slash menu items. */
export const SLASH_MENU_ITEMS = buildSlashMenuItems();
