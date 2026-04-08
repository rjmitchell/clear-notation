import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import type { BNBlock, BNInlineContent, BNStyledText, BNLink } from "../converter/types";
import { bnBlocksToBlockNote } from "../lib/bn-to-blocknote";

interface VisualEditorProps {
  onDocumentChange: (blocks: BNBlock[]) => void;
  editorRef?: React.MutableRefObject<BlockNoteEditor | null>;
  darkMode?: boolean;
  documentToLoad?: BNBlock[] | null;
  /** BlockNote-format blocks for direct loading (no conversion needed). */
  blockNoteBlocksToLoad?: any[] | null;
  onDocumentLoaded?: () => void;
}

/**
 * Map a BlockNote default block type to a CLN block type.
 */
const BLOCK_TYPE_MAP: Record<string, string> = {
  heading: "clnHeading",
  paragraph: "clnParagraph",
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

/**
 * Convert a single BlockNote block (with its children) to our BNBlock format.
 */
function convertBlock(block: any): BNBlock {
  const type = BLOCK_TYPE_MAP[block.type] || block.type;

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
}: VisualEditorProps) {
  const editor = useMemo(() => {
    return BlockNoteEditor.create();
  }, []);

  // Guard: skip the next onChange after we programmatically replace blocks
  const suppressNextChange = useRef(false);

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
    if (!blockNoteBlocksToLoad || !onDocumentLoaded) return;

    if (blockNoteBlocksToLoad.length > 0) {
      suppressNextChange.current = true;
      editor.replaceBlocks(editor.document, blockNoteBlocksToLoad);
    }
    onDocumentLoaded();
  }, [blockNoteBlocksToLoad, onDocumentLoaded, editor]);

  const handleChange = useCallback(() => {
    if (suppressNextChange.current) {
      suppressNextChange.current = false;
      return;
    }
    const doc = editor.document;
    const converted = convertDocument(doc as any[]);
    onDocumentChange(converted);
  }, [editor, onDocumentChange]);

  return (
    <div className="visual-editor">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={darkMode ? "dark" : "light"}
        formattingToolbar={false}
      />
    </div>
  );
}
