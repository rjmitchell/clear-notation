import React, { useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  ALL_BLOCK_SPECS,
  CLN_INLINE_MARKS,
  SLASH_MENU_ITEMS,
  DIRECTIVE_BLOCK_SPECS,
} from "./schema";

function EditorApp() {
  const editor = useMemo(() => {
    return BlockNoteEditor.create();
  }, []);

  const hasLogged = useRef(false);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    // Log schema summary to console
    console.log("=== ClearNotation Editor Schema ===");
    console.log(`Block specs: ${Object.keys(ALL_BLOCK_SPECS).length}`);
    console.log(`Inline marks: ${Object.keys(CLN_INLINE_MARKS).length}`);
    console.log(`Slash menu items: ${SLASH_MENU_ITEMS.length}`);
    console.log("");

    console.log("Block types:");
    for (const [type, spec] of Object.entries(ALL_BLOCK_SPECS)) {
      const props = Object.keys(spec.propSchema).join(", ") || "(none)";
      console.log(`  ${type} [content=${spec.content}] props: ${props}`);
    }

    console.log("\nDirective blocks:");
    for (const [, spec] of Object.entries(DIRECTIVE_BLOCK_SPECS)) {
      console.log(
        `  ::${spec.directiveName} -> ${spec.type} [${spec.bodyMode}]`
      );
    }

    console.log("\nInline marks:");
    for (const [name, mark] of Object.entries(CLN_INLINE_MARKS)) {
      console.log(
        `  ${name}: ${mark.clnSyntax.open}...${mark.clnSyntax.close} -> <${mark.tag}>`
      );
    }

    console.log("\nSlash menu:");
    for (const item of SLASH_MENU_ITEMS) {
      console.log(`  [${item.group}] ${item.label} -> ${item.blockType}`);
    }
  }, []);

  return <BlockNoteView editor={editor} theme="light" />;
}

const container = document.getElementById("editor");
if (container) {
  const root = createRoot(container);
  root.render(<EditorApp />);
}
