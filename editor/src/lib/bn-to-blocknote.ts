/**
 * Reverse mapping: BNBlock[] (CLN converter output) → BlockNote default blocks.
 *
 * This is the inverse of the forward mapping in VisualEditor.tsx which
 * converts BlockNote default types → CLN types. Here we go the other
 * direction so that parsed CLN source can be loaded into BlockNote.
 */

import type {
  BNBlock,
  BNInlineContent,
  BNStyledText,
  BNLink,
  BNNote,
  BNRef,
} from "../converter/types";

/* ─── Block type mapping (CLN → BlockNote) ─── */
const BLOCK_TYPE_REVERSE: Record<string, string> = {
  clnHeading: "heading",
  clnParagraph: "paragraph",
  clnBlockquote: "quote",
  clnUnorderedList: "bulletListItem",
  clnOrderedList: "numberedListItem",
  clnCodeBlock: "codeBlock",
};

/* ─── Style mapping (CLN → BlockNote) ─── */
const STYLE_REVERSE: Record<string, string> = {
  clnStrong: "bold",
  clnEmphasis: "italic",
  clnCode: "code",
};

/**
 * Convert a single CLN styled text span to BlockNote format.
 */
function convertStyledText(item: BNStyledText): Record<string, any> {
  const styles: Record<string, boolean | string> = {};
  for (const [key, value] of Object.entries(item.styles)) {
    // Note: clnNote and clnRef are no longer styles — they're structured
    // inline content variants handled in convertInlineContent. See Task 6.
    const mapped = STYLE_REVERSE[key] || key;
    styles[mapped] = value;
  }
  return {
    type: "text",
    text: item.text,
    styles,
  };
}

/**
 * Convert CLN inline content array to BlockNote inline content format.
 */
function convertInlineContent(items: BNInlineContent[]): any[] {
  return items.map((item) => {
    if (item.type === "link") {
      const link = item as BNLink;
      return {
        type: "link",
        href: link.href,
        content: link.content.map(convertStyledText),
      };
    }
    if (item.type === "ref") {
      // Emit as BlockNote custom inline content node (clnRef pill).
      const ref = item as BNRef;
      return {
        type: "clnRef",
        props: { target: ref.target },
      };
    }
    if (item.type === "note") {
      // Emit as BlockNote custom inline content node with nested styled content.
      const note = item as BNNote;
      return {
        type: "clnNote",
        props: {},
        content: convertInlineContent(note.content),
      };
    }
    return convertStyledText(item as BNStyledText);
  });
}

/**
 * Convert a single BNBlock (CLN format) to a BlockNote default block.
 */
function convertBlock(block: BNBlock): any {
  const type = BLOCK_TYPE_REVERSE[block.type] || "paragraph";

  const props: Record<string, any> = {};

  // Map block-specific props back
  if (type === "heading" && block.props.level != null) {
    props.level = block.props.level;
  }
  if (type === "codeBlock") {
    props.language = block.props.language || "";
  }
  if (type === "numberedListItem" && block.props.startNumber != null) {
    props.startNumber = block.props.startNumber;
  }

  // Forward anchorId for any addressable block type.
  // Empty string means no anchor — skip it to avoid polluting props.
  if (typeof block.props.anchorId === "string" && block.props.anchorId.length > 0) {
    props.anchorId = block.props.anchorId;
  }

  // Convert content
  let content: any[];
  if (type === "codeBlock") {
    // Code blocks store their text in props.code; BlockNote expects
    // inline content with a single text span
    const code = String(block.props.code || "");
    content = code ? [{ type: "text", text: code, styles: {} }] : [];
  } else {
    content = convertInlineContent(block.content);
  }

  // Recursively convert children
  const children = block.children.map(convertBlock);

  return { type, props, content, children };
}

/**
 * Convert an array of BNBlocks (CLN converter output) to BlockNote
 * default block format suitable for `editor.replaceBlocks()`.
 */
export function bnBlocksToBlockNote(blocks: BNBlock[]): any[] {
  return blocks.map(convertBlock);
}
