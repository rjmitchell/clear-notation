/**
 * Normalizer: converts BlockNote BNBlock[] into the renderer-facing
 * NormalizedDocument. This is the JS counterpart of the Python normalizer.py.
 *
 * The core challenge is converting flat BNStyledText (with style flags like
 * clnStrong: true) back into nested NormalizedInline trees (NStrong with
 * children).
 */

// These types mirror the editor's converter types. Defined locally so this
// package compiles independently without reaching outside its rootDir.

/** A styled text span (mirrors editor BNStyledText). */
interface BNStyledText {
  type: "text";
  text: string;
  styles: Record<string, boolean | string>;
}

/** A link containing styled text spans (mirrors editor BNLink). */
interface BNLink {
  type: "link";
  href: string;
  content: BNStyledText[];
}

/** Inline content: either styled text or a link. */
type BNInlineContent = BNStyledText | BNLink;

/**
 * A generic block in the BlockNote document model (mirrors editor BNBlock).
 */
export interface BNBlock {
  id?: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content: BNInlineContent[];
  children: BNBlock[];
  parseError?: boolean;
}
import type {
  NormalizedBlock,
  NormalizedDocument,
  NormalizedInline,
  NText,
  NCodeSpan,
  NStrong,
  NEmphasis,
  NLink,
  NNote,
  NRef,
  NHeading,
  NParagraph,
  NThematicBreak,
  NBlockQuote,
  NListItem,
  NUnorderedList,
  NOrderedList,
  NOrderedItem,
  NToc,
  NCallout,
  NFigure,
  NMathBlock,
  NTable,
  NTableRow,
  NTableCell,
  NSourceBlock,
} from "./types";
import { slugify } from "./utils";

// ---------------------------------------------------------------------------
// State container
// ---------------------------------------------------------------------------

interface NormalizerState {
  noteCounter: number;
  notes: NNote[];
  slugCounts: Map<string, number>;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a BlockNote block array into a NormalizedDocument.
 */
export function normalize(
  blocks: BNBlock[],
  meta?: Record<string, unknown>,
): NormalizedDocument {
  const state: NormalizerState = {
    noteCounter: 1,
    notes: [],
    slugCounts: new Map(),
    meta: meta ? { ...meta } : {},
  };

  const normalized = normalizeBlocks(blocks, state, undefined);

  return {
    meta: state.meta,
    blocks: normalized,
    notes: [...state.notes],
  };
}

// ---------------------------------------------------------------------------
// Block normalization
// ---------------------------------------------------------------------------

function normalizeBlocks(
  blocks: BNBlock[],
  state: NormalizerState,
  pendingAnchor: string | undefined,
): NormalizedBlock[] {
  const result: NormalizedBlock[] = [];

  for (const blk of blocks) {
    switch (blk.type) {
      case "clnHeading": {
        const level = (blk.props.level as number) || 1;
        let headingId: string;
        if (pendingAnchor !== undefined) {
          headingId = pendingAnchor;
          pendingAnchor = undefined;
        } else {
          const base = slugify(plainText(blk.content));
          const count = (state.slugCounts.get(base) ?? 0) + 1;
          state.slugCounts.set(base, count);
          headingId = count === 1 ? base : `${base}-${count}`;
        }
        result.push({
          type: "heading",
          level,
          id: headingId,
          content: normalizeInlines(blk.content, state),
        } satisfies NHeading);
        break;
      }

      case "clnParagraph": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const para: NParagraph = {
          type: "paragraph",
          content: normalizeInlines(blk.content, state),
        };
        if (blockId !== undefined) para.id = blockId;
        result.push(para);
        break;
      }

      case "clnThematicBreak": {
        result.push({ type: "thematic_break" } satisfies NThematicBreak);
        break;
      }

      case "clnCodeBlock": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const src: NSourceBlock = {
          type: "source_block",
          language: (blk.props.language as string) || "",
          text: (blk.props.code as string) || "",
        };
        if (blockId !== undefined) src.id = blockId;
        result.push(src);
        break;
      }

      case "clnBlockquote": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        // Split content by newline text nodes into lines
        const lines = splitIntoLines(blk.content, state);
        const bq: NBlockQuote = { type: "blockquote", lines };
        if (blockId !== undefined) bq.id = blockId;
        result.push(bq);
        break;
      }

      case "clnUnorderedList": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const listItem: NListItem = {
          content: normalizeInlines(blk.content, state),
          blocks: normalizeBlocks(blk.children, state, undefined),
        };
        const ul: NUnorderedList = {
          type: "unordered_list",
          items: [listItem],
        };
        if (blockId !== undefined) ul.id = blockId;
        result.push(ul);
        break;
      }

      case "clnOrderedList": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const ordinal = (blk.props.startNumber as number) || 1;
        const ol: NOrderedList = {
          type: "ordered_list",
          items: [
            {
              ordinal,
              content: normalizeInlines(blk.content, state),
              blocks: normalizeBlocks(blk.children, state, undefined),
            },
          ],
        };
        if (blockId !== undefined) ol.id = blockId;
        result.push(ol);
        break;
      }

      case "clnToc": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const toc: NToc = { type: "toc" };
        if (blockId !== undefined) toc.id = blockId;
        result.push(toc);
        break;
      }

      case "clnCallout": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const callout: NCallout = {
          type: "callout",
          kind: (blk.props.kind as string) || "",
          title: (blk.props.title as string) || undefined,
          compact: Boolean(blk.props.compact),
          blocks: normalizeBlocks(blk.children, state, undefined),
        };
        if (blockId !== undefined) callout.id = blockId;
        result.push(callout);
        break;
      }

      case "clnFigure": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const figure: NFigure = {
          type: "figure",
          src: (blk.props.src as string) || "",
          blocks: normalizeBlocks(blk.children, state, undefined),
        };
        if (blockId !== undefined) figure.id = blockId;
        result.push(figure);
        break;
      }

      case "clnMath": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const math: NMathBlock = {
          type: "math_block",
          text: (blk.props.rawContent as string) || "",
        };
        if (blockId !== undefined) math.id = blockId;
        result.push(math);
        break;
      }

      case "clnSource": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const src: NSourceBlock = {
          type: "source_block",
          language: (blk.props.language as string) || "",
          text: (blk.props.rawContent as string) || "",
        };
        if (blockId !== undefined) src.id = blockId;
        result.push(src);
        break;
      }

      case "clnTable": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const table = normalizeTable(blk, state, blockId);
        result.push(table);
        break;
      }

      case "clnMeta": {
        // Merge props into document meta; don't emit a block
        for (const [key, val] of Object.entries(blk.props)) {
          state.meta[key] = val;
        }
        break;
      }

      case "clnAnchor": {
        // Set pending anchor for next block
        pendingAnchor = (blk.props.id as string) || undefined;
        break;
      }

      case "clnInclude": {
        // Skip includes (not inlined in v0.1)
        break;
      }

      default:
        // Unknown block types are silently skipped
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Table normalization
// ---------------------------------------------------------------------------

function normalizeTable(
  blk: BNBlock,
  state: NormalizerState,
  blockId: string | undefined,
): NTable {
  // Table data comes as a JSON string in props.tableData
  const tableData = blk.props.tableData as string | undefined;
  const rows: NTableRow[] = [];

  if (tableData) {
    try {
      const parsed = JSON.parse(tableData) as {
        rows?: Array<{ cells?: Array<{ content?: BNInlineContent[] }> }>;
      };
      if (parsed.rows) {
        for (const row of parsed.rows) {
          const cells: NTableCell[] = [];
          if (row.cells) {
            for (const cell of row.cells) {
              cells.push({
                content: normalizeInlines(cell.content || [], state),
              });
            }
          }
          rows.push({ cells });
        }
      }
    } catch {
      // Invalid JSON — produce empty table
    }
  }

  const table: NTable = {
    type: "table",
    header: Boolean(blk.props.header),
    align: blk.props.align
      ? (blk.props.align as string).split(",")
      : undefined,
    rows,
  };
  if (blockId !== undefined) table.id = blockId;
  return table;
}

// ---------------------------------------------------------------------------
// Inline normalization — flat-to-tree conversion
// ---------------------------------------------------------------------------

/**
 * Convert flat BNInlineContent[] to nested NormalizedInline[].
 *
 * The algorithm handles BNStyledText with style flags (clnStrong, clnEmphasis,
 * clnNote, clnCode, clnRef) and converts them into nested tree nodes.
 */
function normalizeInlines(
  items: BNInlineContent[],
  state: NormalizerState,
): NormalizedInline[] {
  return flatToTree(items, state);
}

/** Priority-ordered marks for the flat-to-tree grouping algorithm. */
const MARK_PRIORITY: string[] = ["clnNote", "clnStrong", "clnEmphasis"];

function flatToTree(
  items: BNInlineContent[],
  state: NormalizerState,
): NormalizedInline[] {
  const result: NormalizedInline[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    // Handle links
    if (item.type === "link") {
      const bnLink = item as BNLink;
      result.push({
        type: "link",
        label: flatToTree(bnLink.content, state),
        target: bnLink.href,
      } satisfies NLink);
      i++;
      continue;
    }

    // From here, item is BNStyledText
    const styled = item as BNStyledText;

    // clnRef → NRef (text is the target)
    if (styled.styles.clnRef) {
      result.push({ type: "ref", target: styled.text } satisfies NRef);
      i++;
      continue;
    }

    // clnCode → NCodeSpan (no nesting inside code)
    if (styled.styles.clnCode) {
      result.push({ type: "code_span", value: styled.text } satisfies NCodeSpan);
      i++;
      continue;
    }

    // Find outermost mark from priority list
    const mark = MARK_PRIORITY.find((m) => styled.styles[m]);

    if (mark === undefined) {
      // Plain text — no marks
      result.push({ type: "text", value: styled.text } satisfies NText);
      i++;
      continue;
    }

    // Group consecutive items sharing this mark
    let j = i;
    while (j < items.length) {
      const next = items[j];
      if (next.type !== "text") break;
      if (!(next as BNStyledText).styles[mark]) break;
      j++;
    }

    // Extract the group, strip the mark, recurse
    const group = items.slice(i, j) as BNStyledText[];
    const stripped: BNStyledText[] = group.map((g) => {
      const newStyles = { ...g.styles };
      delete newStyles[mark];
      return { type: "text" as const, text: g.text, styles: newStyles };
    });

    const children = flatToTree(stripped, state);

    switch (mark) {
      case "clnNote": {
        const noteNumber = state.noteCounter++;
        const note: NNote = {
          type: "note",
          children,
          number: noteNumber,
        };
        state.notes.push(note);
        result.push(note);
        break;
      }
      case "clnStrong":
        result.push({ type: "strong", children } satisfies NStrong);
        break;
      case "clnEmphasis":
        result.push({ type: "emphasis", children } satisfies NEmphasis);
        break;
    }

    i = j;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract plain text from BNInlineContent[] for slug generation.
 */
function plainText(items: BNInlineContent[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.type === "text") {
      parts.push((item as BNStyledText).text);
    } else if (item.type === "link") {
      parts.push(plainText((item as BNLink).content));
    }
  }
  return parts.join("");
}

/**
 * Split inline content into lines (for blockquotes).
 * Text nodes containing \n are split; other items go on the current line.
 */
function splitIntoLines(
  items: BNInlineContent[],
  state: NormalizerState,
): NormalizedInline[][] {
  const lines: NormalizedInline[][] = [[]];

  for (const item of items) {
    if (item.type === "text") {
      const styled = item as BNStyledText;
      const parts = styled.text.split("\n");
      for (let p = 0; p < parts.length; p++) {
        if (p > 0) lines.push([]);
        if (parts[p]) {
          const wrappedItems: BNStyledText[] = [
            { type: "text", text: parts[p], styles: styled.styles },
          ];
          const converted = flatToTree(wrappedItems, state);
          lines[lines.length - 1].push(...converted);
        }
      }
    } else {
      // Links and other items go on the current line
      const converted = flatToTree([item], state);
      lines[lines.length - 1].push(...converted);
    }
  }

  return lines;
}
