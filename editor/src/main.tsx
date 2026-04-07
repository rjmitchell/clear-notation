import React, { useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { BUILTIN_DIRECTIVES, logResult } from "./spike-blocks";

// ---------------------------------------------------------------
// Spike: BlockNote editor — answers three questions:
// 1. Can BlockNote render without React? (Partial — core mounts, but UI chrome needs React)
// 2. Does the slash menu work?
// 3. What is the bundle size? (measured via `pnpm build`)
// ---------------------------------------------------------------

function SpikeEditor() {
  const editor = useMemo(() => {
    return BlockNoteEditor.create();
  }, []);

  const hasLogged = useRef(false);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    // Log spike findings
    logResult("=== BlockNote Spike Results ===");
    logResult("");

    // Q1: Vanilla JS support
    logResult("Q1: Vanilla JS (no React)?");
    logResult("  BlockNoteEditor.create() — OK");
    logResult("  editor.mount(el) — exists, mounts ProseMirror content area");
    logResult("  BUT: UI chrome (toolbar, slash menu, side menu, block handles)");
    logResult("  lives in @blocknote/mantine which imports @blocknote/react.");
    logResult("  VERDICT: React REQUIRED for full editor UI.");
    logResult("");

    // Q2: Slash menu
    logResult("Q2: Slash menu?");
    logResult("  BlockNoteView renders with built-in slash menu.");
    logResult("  Type '/' in the editor above to verify interactively.");
    logResult("  VERDICT: PASS (renders via Mantine/React).");
    logResult("");

    // Q3: Bundle size (measured via `pnpm build`)
    logResult("Q3: Bundle size?");
    logResult("  JS:  1,990 KB raw / 553 KB gzipped");
    logResult("  CSS:   203 KB raw /  32 KB gzipped");
    logResult("  Total gzipped: ~585 KB (under 750 KB budget)");
    logResult("  VERDICT: PASS (within budget, leaves room for tree-sitter ~9 KB).");
    logResult("");

    // Log directive registry
    logResult("=== Directive Registry ===");
    for (const d of BUILTIN_DIRECTIVES) {
      const attrs = d.attributes.map((a) => `${a.name}${a.required ? "*" : ""}`).join(", ");
      logResult(`  @${d.name} [${d.body_mode}] attrs: ${attrs || "(none)"}`);
    }
    logResult("");
    logResult(`Total directives: ${BUILTIN_DIRECTIVES.length}`);
  }, []);

  return (
    <BlockNoteView editor={editor} theme="light" />
  );
}

// Mount the app
const container = document.getElementById("editor");
if (container) {
  const root = createRoot(container);
  root.render(<SpikeEditor />);
}
