import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import type { BNBlock, BNInlineContent, BNStyledText, BNLink } from "../converter/types";
import { bnBlocksToBlockNote } from "../lib/bn-to-blocknote";
import type { SyncState } from "../lib/parse-source";
import { clnSchema } from "../schema/cln-schema";

interface VisualEditorProps {
  onDocumentChange: (blocks: BNBlock[]) => void;
  editorRef?: React.MutableRefObject<BlockNoteEditor<any, any, any> | null>;
  darkMode?: boolean;
  documentToLoad?: BNBlock[] | null;
  /** BlockNote-format blocks for direct loading (no conversion needed). */
  blockNoteBlocksToLoad?: any[] | null;
  onDocumentLoaded?: () => void;
  syncState?: SyncState;
}

/**
 * Map a BlockNote default block type to a CLN block type.
 */
const BLOCK_TYPE_MAP: Record<string, string> = {
  heading: "clnHeading",
  paragraph: "clnParagraph",
  quote: "clnBlockquote",
  bulletListItem: "clnUnorderedList",
  numberedListItem: "clnOrderedList",
  codeBlock: "clnCodeBlock",
};

/**
 * Map a BlockNote default style name to a CLN style name.
 */
const STYLE_MAP: Record<string, string> = {
  bold: "clnStrong",
  italic: "clnEmphasis",
  code: "clnCode",
};

/**
 * Convert BlockNote's inline content array to our BNInlineContent format,
 * mapping style names from BlockNote defaults to CLN names.
 */
function convertInlineContent(items: unknown[]): BNInlineContent[] {
  return items.map((item: any) => {
    if (item.type === "link") {
      const link: BNLink = {
        type: "link",
        href: item.href,
        content: (item.content || []).map((c: any) => convertStyledText(c)),
      };
      return link;
    }
    if (item.type === "clnRef") {
      // BlockNote custom inline content (atomic) → BNRef structured variant
      return { type: "ref", target: (item.props?.target ?? "") as string };
    }
    if (item.type === "clnNote") {
      // BlockNote custom inline content (content: "styled") → BNNote structured variant.
      // Recurse into item.content to unpack the nested inline tree (which may include
      // more clnRef, bold/italic/code, links, etc.).
      const content = Array.isArray(item.content) ? convertInlineContent(item.content) : [];
      return { type: "note", content };
    }
    return convertStyledText(item);
  });
}

function convertStyledText(item: any): BNStyledText {
  const styles: Record<string, boolean | string> = {};
  if (item.styles) {
    for (const [key, value] of Object.entries(item.styles)) {
      const mappedKey = STYLE_MAP[key] || key;
      styles[mappedKey] = value as boolean | string;
    }
  }
  return {
    type: "text",
    text: item.text || "",
    styles,
  };
}

/** Directive block types registered as custom BlockNote block specs. */
const DIRECTIVE_BLOCK_TYPES = new Set([
  "clnTable",
  "clnMath",
  "clnFigure",
  "clnCallout",
  "clnSource",
]);

/**
 * Convert a single BlockNote block (with its children) to our BNBlock format.
 */
function convertBlock(block: any): BNBlock {
  const type = BLOCK_TYPE_MAP[block.type] || block.type;

  // Directive blocks: forward all props as-is (they're custom BlockNote types).
  if (DIRECTIVE_BLOCK_TYPES.has(block.type)) {
    const props: Record<string, string | number | boolean> = {};
    if (block.props) {
      for (const [key, value] of Object.entries(block.props)) {
        if (value !== undefined && value !== null) {
          props[key] = value as string | number | boolean;
        }
      }
    }
    const children: BNBlock[] = Array.isArray(block.children)
      ? block.children.map(convertBlock)
      : [];
    return { type, props, content: [], children };
  }

  const props: Record<string, string | number | boolean> = {};

  // Map block-specific props
  if (block.type === "heading" && block.props?.level) {
    props.level = block.props.level;
  }
  if (block.type === "codeBlock") {
    props.language = block.props?.language || "";
    props.code = "";
    // For code blocks, the content is stored as text content
    if (Array.isArray(block.content)) {
      props.code = block.content.map((c: any) => c.text || "").join("");
    }
  }
  if (block.type === "numberedListItem" && block.props?.startNumber) {
    props.startNumber = block.props.startNumber;
  }

  // Forward anchorId for any block whose BlockNote prop carries it.
  // After Task 4, the custom block specs (clnHeading, clnParagraph,
  // clnBlockquote, clnBulletListItem, clnNumberedListItem) all declare
  // anchorId in their propSchema, so BlockNote will store it as a block prop.
  if (typeof block.props?.anchorId === "string" && block.props.anchorId.length > 0) {
    props.anchorId = block.props.anchorId;
  }

  // Convert inline content (for non-code blocks)
  let content: BNInlineContent[] = [];
  if (block.type !== "codeBlock" && Array.isArray(block.content)) {
    content = convertInlineContent(block.content);
  }

  // Recursively convert children
  const children: BNBlock[] = Array.isArray(block.children)
    ? block.children.map(convertBlock)
    : [];

  return { type, props, content, children };
}

/**
 * Convert the full BlockNote document to our BNBlock[] format.
 */
function convertDocument(blocks: any[]): BNBlock[] {
  return blocks.map(convertBlock);
}

export default function VisualEditor({
  onDocumentChange,
  editorRef,
  darkMode,
  documentToLoad,
  blockNoteBlocksToLoad,
  onDocumentLoaded,
  syncState = "valid",
}: VisualEditorProps) {
  const editor = useMemo(() => {
    return BlockNoteEditor.create({ schema: clnSchema });
  }, []);

  // Guard: skip the next onChange after we programmatically replace blocks
  const suppressNextChange = useRef(false);

  // Track syncState in a ref so handleChange always sees the current value
  // without needing to be re-created on every syncState change (which would
  // re-attach BlockNoteView's onChange listener unnecessarily).
  // Assignment during render is intentional: a useEffect runs AFTER render,
  // so it would be a tick late when BlockNote fires onChange synchronously
  // as a side effect of the editable prop flipping true→false.
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;

  // Expose editor instance to parent via ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Load blocks from source→visual sync (BNBlock[] needs conversion)
  useEffect(() => {
    if (!documentToLoad || !onDocumentLoaded) return;

    const bnBlocks = bnBlocksToBlockNote(documentToLoad);
    if (bnBlocks.length > 0) {
      suppressNextChange.current = true;
      editor.replaceBlocks(editor.document, bnBlocks);
    }
    onDocumentLoaded();
  }, [documentToLoad, onDocumentLoaded, editor]);

  // Load blocks from simple CLN loader (already in BlockNote format, no conversion)
  useEffect(() => {
    if (blockNoteBlocksToLoad === null || blockNoteBlocksToLoad === undefined || !onDocumentLoaded) return;

    suppressNextChange.current = true;
    if (blockNoteBlocksToLoad.length > 0) {
      editor.replaceBlocks(editor.document, blockNoteBlocksToLoad);
    } else {
      // Empty array: clear the editor by replacing all blocks with a single empty paragraph
      editor.replaceBlocks(editor.document, [{ type: "paragraph", content: [] }]);
    }
    onDocumentLoaded();
  }, [blockNoteBlocksToLoad, onDocumentLoaded, editor]);

  const handleChange = useCallback(() => {
    if (suppressNextChange.current) {
      suppressNextChange.current = false;
      return;
    }
    // In broken sync state, the visual pane is a stale mirror and cannot
    // be trusted as a source of truth. BlockNote fires onChange when the
    // `editable` prop flips (e.g. on the valid→broken transition), and we
    // must not propagate that spurious event back to the source — doing so
    // would overwrite the user's broken source buffer with whatever stale
    // content the visual pane happens to be showing.
    if (syncStateRef.current === "broken") return;
    const doc = editor.document;
    const converted = convertDocument(doc as any[]);
    onDocumentChange(converted);
  }, [editor, onDocumentChange]);

  const isBroken = syncState === "broken";
  const className = isBroken ? "visual-editor visual-editor--stale" : "visual-editor";

  return (
    <div className={className}>
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={darkMode ? "dark" : "light"}
        formattingToolbar={false}
        editable={!isBroken}
      />
    </div>
  );
}
