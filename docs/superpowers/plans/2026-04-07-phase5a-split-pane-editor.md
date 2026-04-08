# Phase 5a: One-Directional Split-Pane Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ClearNotation browser editor product — a Notion-style visual editor (left pane) with always-visible ClearNotation source (right pane), one-directional sync (visual→source), and all supporting features: toolbar, file operations, templates, dark mode, cheat sheet, keyboard shortcuts, Markdown paste conversion, and HTML export.

**Architecture:** React single-page app using BlockNote (Mantine) for the visual editor, a read-only `<pre>` for the source pane (CodeMirror deferred to Phase 5b). The app shell is a CSS Grid layout: toolbar (48px) → split pane (flex) → status bar (24px). The split pane uses a draggable divider. On every BlockNote document change, the serializer converts the BlockNote document model to ClearNotation source text (debounced 300ms) and updates the source pane. HTML export uses the Phase 4.5 normalizer+renderer pipeline.

**Tech Stack:** React 19, BlockNote 0.47 (Mantine), Vite 8, TypeScript, CSS custom properties (from DESIGN.md), Lucide icons, File System Access API

**Design system:** All visual decisions come from `DESIGN.md`. Read it before implementing any component. Key: Geist Sans for UI chrome, system fonts for content, Geist Mono for source pane, CSS variables for colors/spacing, Lucide icons 16px/1.5px stroke.

---

## File Structure

```
editor/
├── index.html                    # Full-page app (replaces spike)
├── src/
│   ├── main.tsx                  # React mount point
│   ├── App.tsx                   # Root layout: toolbar + split pane + status bar
│   ├── app.css                   # CSS variables, fonts, global styles, dark mode
│   ├── components/
│   │   ├── SplitPane.tsx         # Draggable two-pane layout
│   │   ├── VisualEditor.tsx      # BlockNote editor wrapper
│   │   ├── SourcePane.tsx        # Read-only CLN source display
│   │   ├── Toolbar.tsx           # Top toolbar: file menu, formatting, export, theme, cheat sheet
│   │   ├── StatusBar.tsx         # Bottom bar: file name, word count, sync indicator
│   │   ├── CheatSheet.tsx        # Slide-in syntax reference panel
│   │   ├── WelcomeOverlay.tsx    # Empty-state guidance overlay
│   │   └── TemplateMenu.tsx      # "New from template" dropdown
│   ├── hooks/
│   │   ├── useSync.ts            # Visual→source sync with 300ms debounce
│   │   ├── useFileOps.ts         # File System Access API + download + localStorage
│   │   ├── useDarkMode.ts        # Theme toggle + prefers-color-scheme
│   │   └── useMarkdownPaste.ts   # Paste interception + MD→CLN conversion
│   ├── lib/
│   │   └── markdown-convert.ts   # Markdown → ClearNotation syntax conversion
│   ├── templates/
│   │   ├── prd.cln               # PRD template
│   │   ├── design-doc.cln        # Design doc template
│   │   └── meeting-notes.cln     # Meeting notes template
│   ├── converter/                # (existing, Phase 3)
│   ├── serializer/               # (existing, Phase 4)
│   ├── parser/                   # (existing, Phase 1)
│   └── schema/                   # (existing, Phase 2)
```

---

## Task 1: CSS foundation + App shell

**Files:**
- Rewrite: `editor/index.html`
- Rewrite: `editor/src/main.tsx`
- Create: `editor/src/App.tsx`
- Create: `editor/src/app.css`

**Context:** Replace the spike page with the production app shell. Implement all CSS custom properties from DESIGN.md, load Geist fonts, set up the CSS Grid layout (toolbar → split pane → status bar), and add dark mode media query.

- [ ] **Step 1: Rewrite index.html**

Replace `editor/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClearNotation Editor</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.min.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create app.css with design system**

Create `editor/src/app.css` with all CSS custom properties from DESIGN.md:

```css
/* === Design System (from DESIGN.md) === */

:root {
  /* Colors — Light */
  --cn-bg: #ffffff;
  --cn-fg: #1a1a1a;
  --cn-accent: #2563eb;
  --cn-accent-hover: #1d4ed8;
  --cn-surface: #f9fafb;
  --cn-border: #e5e7eb;
  --cn-muted: #6b7280;
  --cn-code-bg: #f3f4f6;

  /* Semantic */
  --cn-success: #22c55e;
  --cn-warning: #f59e0b;
  --cn-error: #ef4444;
  --cn-info: #3b82f6;

  /* Spacing */
  --cn-toolbar-height: 48px;
  --cn-statusbar-height: 24px;

  /* Radius */
  --cn-radius-sm: 4px;
  --cn-radius-md: 8px;
  --cn-radius-lg: 12px;

  /* Typography */
  --cn-font-ui: "Geist Sans", system-ui, -apple-system, sans-serif;
  --cn-font-content: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  --cn-font-mono: "Geist Mono", ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --cn-bg: #111827;
    --cn-fg: #f3f4f6;
    --cn-accent: #60a5fa;
    --cn-accent-hover: #3b82f6;
    --cn-surface: #1f2937;
    --cn-border: #374151;
    --cn-muted: #9ca3af;
    --cn-code-bg: #1f2937;
  }
}

[data-theme="dark"] {
  --cn-bg: #111827;
  --cn-fg: #f3f4f6;
  --cn-accent: #60a5fa;
  --cn-accent-hover: #3b82f6;
  --cn-surface: #1f2937;
  --cn-border: #374151;
  --cn-muted: #9ca3af;
  --cn-code-bg: #1f2937;
}

/* === Global === */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--cn-font-ui);
  font-size: 14px;
  color: var(--cn-fg);
  background: var(--cn-bg);
  -webkit-font-smoothing: antialiased;
}

/* === App Layout === */

.app-shell {
  display: grid;
  grid-template-rows: var(--cn-toolbar-height) 1fr var(--cn-statusbar-height);
  height: 100vh;
  width: 100vw;
}

/* === Toolbar === */

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  background: var(--cn-surface);
  border-bottom: 1px solid var(--cn-border);
  font-family: var(--cn-font-ui);
  font-size: 14px;
  height: var(--cn-toolbar-height);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-separator {
  width: 1px;
  height: 24px;
  background: var(--cn-border);
  margin: 0 8px;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 12px;
  background: transparent;
  border: none;
  border-radius: var(--cn-radius-sm);
  color: var(--cn-muted);
  cursor: pointer;
  font-family: var(--cn-font-ui);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  transition: background 100ms ease-out, color 100ms ease-out;
}

.toolbar-btn:hover {
  background: var(--cn-bg);
  color: var(--cn-fg);
}

.toolbar-btn:focus-visible {
  outline: 2px solid var(--cn-accent);
  outline-offset: -2px;
}

.toolbar-btn.active {
  color: var(--cn-accent);
}

/* === Split Pane === */

.split-pane {
  display: flex;
  overflow: hidden;
}

.split-pane__left {
  overflow-y: auto;
  min-width: 200px;
}

.split-pane__divider {
  width: 1px;
  background: var(--cn-border);
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
  z-index: 1;
}

.split-pane__divider::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
  /* 6px invisible hit area */
}

.split-pane__divider:hover {
  background: var(--cn-accent);
}

.split-pane__right {
  overflow-y: auto;
  min-width: 200px;
}

/* === Source Pane === */

.source-pane {
  height: 100%;
  padding: 16px;
  background: var(--cn-code-bg);
  overflow-y: auto;
}

.source-pane pre {
  font-family: var(--cn-font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--cn-fg);
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  tab-size: 2;
}

.source-pane .line-changed {
  background: color-mix(in srgb, var(--cn-accent) 10%, transparent);
  transition: background 300ms ease-out;
}

/* === Visual Editor === */

.visual-editor {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
}

.visual-editor .bn-editor {
  font-family: var(--cn-font-content);
  font-size: 16px;
}

/* === Status Bar === */

.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  background: var(--cn-surface);
  border-top: 1px solid var(--cn-border);
  font-family: var(--cn-font-ui);
  font-size: 12px;
  color: var(--cn-muted);
  height: var(--cn-statusbar-height);
}

.status-bar__spacer {
  flex: 1;
}

/* === Cheat Sheet === */

.cheat-sheet {
  position: fixed;
  top: var(--cn-toolbar-height);
  right: 0;
  bottom: var(--cn-statusbar-height);
  width: 320px;
  background: var(--cn-bg);
  border-left: 1px solid var(--cn-border);
  padding: 24px;
  overflow-y: auto;
  z-index: 10;
  transform: translateX(100%);
  transition: transform 150ms ease-out;
}

.cheat-sheet.open {
  transform: translateX(0);
}

.cheat-sheet h3 {
  font-family: var(--cn-font-ui);
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
}

.cheat-sheet table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cheat-sheet td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--cn-border);
  vertical-align: top;
}

.cheat-sheet code {
  font-family: var(--cn-font-mono);
  font-size: 12px;
  background: var(--cn-code-bg);
  padding: 1px 4px;
  border-radius: 3px;
}

/* === Welcome Overlay === */

.welcome-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
  text-align: center;
  color: var(--cn-muted);
  height: 100%;
}

.welcome-overlay h2 {
  font-family: var(--cn-font-ui);
  font-weight: 600;
  font-size: 20px;
  color: var(--cn-fg);
}

.welcome-overlay p {
  max-width: 400px;
  line-height: 1.5;
}

.welcome-overlay .welcome-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.welcome-overlay .btn-primary {
  padding: 8px 16px;
  background: var(--cn-accent);
  color: white;
  border: none;
  border-radius: var(--cn-radius-sm);
  font-family: var(--cn-font-ui);
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

.welcome-overlay .btn-primary:hover {
  background: var(--cn-accent-hover);
}

.welcome-overlay .btn-secondary {
  padding: 8px 16px;
  background: var(--cn-bg);
  color: var(--cn-fg);
  border: 1px solid var(--cn-border);
  border-radius: var(--cn-radius-sm);
  font-family: var(--cn-font-ui);
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

/* === Template Menu === */

.template-menu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 220px;
  background: var(--cn-bg);
  border: 1px solid var(--cn-border);
  border-radius: var(--cn-radius-md);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 20;
  padding: 4px;
}

.template-menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--cn-radius-sm);
  font-family: var(--cn-font-ui);
  font-size: 14px;
  color: var(--cn-fg);
  cursor: pointer;
}

.template-menu-item:hover {
  background: var(--cn-surface);
}

.template-menu-item small {
  display: block;
  color: var(--cn-muted);
  font-size: 12px;
  margin-top: 2px;
}

/* === Responsive === */

@media (max-width: 1023px) {
  .split-pane {
    flex-direction: column;
  }
  .split-pane__divider {
    display: none;
  }
}

@media (max-width: 767px) {
  .toolbar-btn span {
    display: none;
  }
}
```

- [ ] **Step 3: Create App.tsx shell**

Create `editor/src/App.tsx`:

```tsx
import React, { useState, useCallback } from "react";
import "./app.css";
import "@blocknote/mantine/style.css";

export default function App() {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Toolbar placeholder */}
      <div className="toolbar">
        <span style={{ fontWeight: 600 }}>ClearNotation</span>
        <div className="toolbar-spacer" />
      </div>

      {/* Split pane placeholder */}
      <div className="split-pane">
        <div className="split-pane__left visual-editor" style={{ flex: "0 0 60%" }}>
          <p style={{ color: "var(--cn-muted)", padding: 24 }}>Visual editor will go here</p>
        </div>
        <div className="split-pane__divider" />
        <div className="split-pane__right">
          <div className="source-pane">
            <pre>{source || "# Start typing in the visual editor..."}</pre>
          </div>
        </div>
      </div>

      {/* Status bar placeholder */}
      <div className="status-bar">
        <span>{fileName ?? "Untitled"}</span>
        {isDirty && <span>•</span>}
        <div className="status-bar__spacer" />
        <span>ClearNotation v0.1</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update main.tsx**

Replace `editor/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 5: Verify the app shell renders**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Open http://localhost:5173 — should see: toolbar at top, two-pane layout (placeholder left, source pane right), status bar at bottom. Dark mode should work if OS is set to dark.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/index.html editor/src/main.tsx editor/src/App.tsx editor/src/app.css && git commit -m "feat(editor): app shell with CSS design system, split-pane layout, dark mode"
```

---

## Task 2: Split pane with draggable divider

**Files:**
- Create: `editor/src/components/SplitPane.tsx`
- Modify: `editor/src/App.tsx`

**Context:** The split pane is the signature UI element. Visual editor left (default 60%), source pane right (40%). The divider is draggable. Position saved to localStorage. On screens < 1024px, show tabs instead.

- [ ] **Step 1: Create SplitPane component**

Create `editor/src/components/SplitPane.tsx`:

```tsx
import React, { useState, useCallback, useRef, useEffect } from "react";

const STORAGE_KEY = "cn-split-position";
const DEFAULT_SPLIT = 60; // percent
const MIN_PANE_WIDTH = 200; // px

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export default function SplitPane({ left, right }: SplitPaneProps) {
  const [splitPercent, setSplitPercent] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseFloat(saved) : DEFAULT_SPLIT;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      const clamped = Math.max(
        (MIN_PANE_WIDTH / rect.width) * 100,
        Math.min(100 - (MIN_PANE_WIDTH / rect.width) * 100, percent)
      );
      setSplitPercent(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane__left" style={{ flex: `0 0 ${splitPercent}%` }}>
        {left}
      </div>
      <div
        className="split-pane__divider"
        onMouseDown={onMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        tabIndex={0}
      />
      <div className="split-pane__right" style={{ flex: 1 }}>
        {right}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire SplitPane into App.tsx**

Update `editor/src/App.tsx` to import and use `SplitPane`:

```tsx
import React, { useState } from "react";
import "./app.css";
import "@blocknote/mantine/style.css";
import SplitPane from "./components/SplitPane";

export default function App() {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  return (
    <div className="app-shell">
      <div className="toolbar">
        <span style={{ fontWeight: 600 }}>ClearNotation</span>
        <div className="toolbar-spacer" />
      </div>

      <SplitPane
        left={
          <div className="visual-editor">
            <p style={{ color: "var(--cn-muted)", padding: 24 }}>Visual editor will go here</p>
          </div>
        }
        right={
          <div className="source-pane">
            <pre>{source || "# Start typing in the visual editor..."}</pre>
          </div>
        }
      />

      <div className="status-bar">
        <span>{fileName ?? "Untitled"}</span>
        {isDirty && <span>•</span>}
        <div className="status-bar__spacer" />
        <span>ClearNotation v0.1</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify draggable divider works**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Open browser → drag the divider → panes resize. Refresh → position persists.

- [ ] **Step 4: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/components/SplitPane.tsx editor/src/App.tsx && git commit -m "feat(editor): draggable split pane with localStorage persistence"
```

---

## Task 3: BlockNote editor + source pane + live sync

**Files:**
- Create: `editor/src/components/VisualEditor.tsx`
- Create: `editor/src/components/SourcePane.tsx`
- Create: `editor/src/hooks/useSync.ts`
- Modify: `editor/src/App.tsx`

**Context:** This is the core product loop. The visual editor uses BlockNote with the ClearNotation schema (from Phase 2). On every document change, the serializer (Phase 4) converts BlockNote blocks to CLN text and updates the source pane. The sync is debounced at 300ms.

Note: BlockNote's custom schema is complex to wire up. For v1, use BlockNote's default schema — it provides headings, paragraphs, lists, code blocks, and formatting out of the box. The ClearNotation custom blocks (callout, math, table, meta, etc.) will be wired up in a follow-up task. This lets us ship the core loop first.

- [ ] **Step 1: Create the useSync hook**

Create `editor/src/hooks/useSync.ts`:

```typescript
import { useRef, useCallback, useEffect, useState } from "react";
import type { Block } from "@blocknote/core";
import { serializeDocument } from "../serializer";
import type { BNBlock } from "../converter/types";

/**
 * Hook that syncs BlockNote document changes to ClearNotation source text.
 * Debounces at 300ms to avoid excessive serialization.
 */
export function useSync() {
  const [source, setSource] = useState("");
  const [syncing, setSyncing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDocumentChange = useCallback((blocks: BNBlock[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSyncing(true);

    timerRef.current = setTimeout(() => {
      const text = serializeDocument(blocks);
      setSource(text);
      setSyncing(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { source, syncing, onDocumentChange };
}
```

- [ ] **Step 2: Create VisualEditor component**

Create `editor/src/components/VisualEditor.tsx`:

```tsx
import React, { useMemo, useEffect } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import type { BNBlock } from "../converter/types";

interface VisualEditorProps {
  onDocumentChange: (blocks: BNBlock[]) => void;
  editorRef?: React.MutableRefObject<BlockNoteEditor | null>;
}

export default function VisualEditor({ onDocumentChange, editorRef }: VisualEditorProps) {
  const editor = useMemo(() => {
    return BlockNoteEditor.create();
  }, []);

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  return (
    <div className="visual-editor">
      <BlockNoteView
        editor={editor}
        onChange={() => {
          // Convert BlockNote's internal blocks to our BNBlock format
          // For now, serialize what BlockNote gives us as simplified blocks
          const doc = editor.document;
          const blocks: BNBlock[] = doc.map((block: any) => ({
            type: blockTypeMap(block.type),
            props: block.props || {},
            content: convertContent(block.content),
            children: [],
          }));
          onDocumentChange(blocks);
        }}
      />
    </div>
  );
}

/** Map BlockNote's default block types to our CLN types. */
function blockTypeMap(type: string): string {
  switch (type) {
    case "heading": return "clnHeading";
    case "paragraph": return "clnParagraph";
    case "bulletListItem": return "clnUnorderedList";
    case "numberedListItem": return "clnOrderedList";
    case "codeBlock": return "clnCodeBlock";
    default: return "clnParagraph";
  }
}

/** Convert BlockNote inline content to our BNInlineContent format. */
function convertContent(content: any): any[] {
  if (!content || !Array.isArray(content)) return [];
  return content.map((item: any) => {
    if (item.type === "text") {
      const styles: Record<string, boolean | string> = {};
      if (item.styles?.bold) styles.clnStrong = true;
      if (item.styles?.italic) styles.clnEmphasis = true;
      if (item.styles?.code) styles.clnCode = true;
      return { type: "text", text: item.text || "", styles };
    }
    if (item.type === "link") {
      return {
        type: "link",
        href: item.href || "",
        content: (item.content || []).map((c: any) => ({
          type: "text",
          text: c.text || "",
          styles: {},
        })),
      };
    }
    return { type: "text", text: "", styles: {} };
  });
}
```

- [ ] **Step 3: Create SourcePane component**

Create `editor/src/components/SourcePane.tsx`:

```tsx
import React, { useRef, useEffect, useState } from "react";

interface SourcePaneProps {
  source: string;
  syncing?: boolean;
}

export default function SourcePane({ source, syncing }: SourcePaneProps) {
  const [prevLines, setPrevLines] = useState<string[]>([]);
  const [changedLines, setChangedLines] = useState<Set<number>>(new Set());
  const lines = source.split("\n");

  useEffect(() => {
    // Diff current vs previous lines to find changes
    const changed = new Set<number>();
    const maxLen = Math.max(lines.length, prevLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (lines[i] !== prevLines[i]) {
        changed.add(i);
      }
    }
    setChangedLines(changed);
    setPrevLines(lines);

    // Clear highlights after animation
    const timer = setTimeout(() => setChangedLines(new Set()), 600);
    return () => clearTimeout(timer);
  }, [source]);

  return (
    <div className="source-pane">
      <pre>
        {lines.map((line, i) => (
          <div key={i} className={changedLines.has(i) ? "line-changed" : ""}>
            {line || "\u200B"}{/* zero-width space for empty lines */}
          </div>
        ))}
      </pre>
    </div>
  );
}
```

- [ ] **Step 4: Wire everything together in App.tsx**

Update `editor/src/App.tsx`:

```tsx
import React, { useState, useRef } from "react";
import "./app.css";
import "@blocknote/mantine/style.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import { useSync } from "./hooks/useSync";

export default function App() {
  const { source, syncing, onDocumentChange } = useSync();
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (blocks: any[]) => {
    onDocumentChange(blocks);
    setIsDirty(true);
  };

  return (
    <div className="app-shell">
      <div className="toolbar">
        <span style={{ fontWeight: 600 }}>ClearNotation</span>
        <div className="toolbar-spacer" />
      </div>

      <SplitPane
        left={<VisualEditor onDocumentChange={handleChange} />}
        right={<SourcePane source={source} syncing={syncing} />}
      />

      <div className="status-bar">
        <span>{fileName ?? "Untitled"}</span>
        {isDirty && <span> •</span>}
        <div className="status-bar__spacer" />
        {syncing && <span>Syncing...</span>}
        <span>ClearNotation v0.1</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Test the core loop**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Open browser → type in the visual editor → after 300ms, ClearNotation source appears in the right pane. Add a heading, bold text, list → see CLN syntax update live. Changed lines highlight briefly.

- [ ] **Step 6: Run existing tests to verify no regressions**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
```

Expected: 295 tests still pass (new components don't have tests yet — they're visual).

- [ ] **Step 7: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/components/VisualEditor.tsx editor/src/components/SourcePane.tsx editor/src/hooks/useSync.ts editor/src/App.tsx && git commit -m "feat(editor): visual editor with live CLN source sync"
```

---

## Task 4: Toolbar with formatting and file menu

**Files:**
- Create: `editor/src/components/Toolbar.tsx`
- Modify: `editor/src/App.tsx`

**Context:** The toolbar provides: file menu (New, Open, Save, Export HTML), formatting buttons (Bold, Italic, Code, Link), and utility buttons (dark mode toggle, cheat sheet). Uses Lucide icons. Follows DESIGN.md button patterns (ghost style, 4px 12px padding, hover→surface bg).

- [ ] **Step 1: Install Lucide icons**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm add lucide-react
```

- [ ] **Step 2: Create Toolbar component**

Create `editor/src/components/Toolbar.tsx`:

```tsx
import React, { useState, useRef } from "react";
import {
  FilePlus, FolderOpen, Save, Download,
  Bold, Italic, Code, Link,
  Sun, Moon, HelpCircle, ChevronDown,
} from "lucide-react";

interface ToolbarProps {
  onNew: () => void;
  onNewFromTemplate: (template: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onExportHtml: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleCode: () => void;
  onInsertLink: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  cheatSheetOpen: boolean;
  onToggleCheatSheet: () => void;
  fileName: string | null;
}

export default function Toolbar({
  onNew, onNewFromTemplate, onOpen, onSave, onExportHtml,
  onToggleBold, onToggleItalic, onToggleCode, onInsertLink,
  darkMode, onToggleDarkMode,
  cheatSheetOpen, onToggleCheatSheet,
  fileName,
}: ToolbarProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="toolbar">
      {/* File menu */}
      <div className="toolbar-group" style={{ position: "relative" }} ref={fileMenuRef}>
        <button className="toolbar-btn" onClick={() => setFileMenuOpen(!fileMenuOpen)}>
          <span>File</span>
          <ChevronDown size={14} />
        </button>
        {fileMenuOpen && (
          <div className="template-menu" onClick={() => setFileMenuOpen(false)}>
            <button className="template-menu-item" onClick={onNew}>
              <FilePlus size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
              New
            </button>
            <button
              className="template-menu-item"
              onClick={(e) => { e.stopPropagation(); setTemplateMenuOpen(!templateMenuOpen); }}
            >
              New from template...
            </button>
            {templateMenuOpen && (
              <div style={{ paddingLeft: 16 }}>
                <button className="template-menu-item" onClick={() => { onNewFromTemplate("prd"); setTemplateMenuOpen(false); }}>
                  PRD
                  <small>Product requirements document</small>
                </button>
                <button className="template-menu-item" onClick={() => { onNewFromTemplate("design-doc"); setTemplateMenuOpen(false); }}>
                  Design Doc
                  <small>Technical design document</small>
                </button>
                <button className="template-menu-item" onClick={() => { onNewFromTemplate("meeting-notes"); setTemplateMenuOpen(false); }}>
                  Meeting Notes
                  <small>Structured meeting notes</small>
                </button>
              </div>
            )}
            <button className="template-menu-item" onClick={onOpen}>
              <FolderOpen size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
              Open...
            </button>
            <button className="template-menu-item" onClick={onSave}>
              <Save size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
              Save
            </button>
            <button className="template-menu-item" onClick={onExportHtml}>
              <Download size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
              Export HTML
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-separator" />

      {/* Formatting */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onToggleBold} title="Bold (⌘B)" aria-label="Bold">
          <Bold size={16} />
        </button>
        <button className="toolbar-btn" onClick={onToggleItalic} title="Italic (⌘I)" aria-label="Italic">
          <Italic size={16} />
        </button>
        <button className="toolbar-btn" onClick={onToggleCode} title="Code (⌘E)" aria-label="Code">
          <Code size={16} />
        </button>
        <button className="toolbar-btn" onClick={onInsertLink} title="Link (⌘K)" aria-label="Insert link">
          <Link size={16} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      {/* Right side */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onToggleDarkMode} title="Toggle theme" aria-label="Toggle dark mode">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className={`toolbar-btn ${cheatSheetOpen ? "active" : ""}`}
          onClick={onToggleCheatSheet}
          title="Syntax cheat sheet"
          aria-label="Toggle cheat sheet"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire Toolbar into App.tsx**

Update `editor/src/App.tsx` to use the Toolbar component, passing all handler stubs. Full implementation of handlers comes in later tasks — for now they can be console.log stubs or no-ops.

- [ ] **Step 4: Verify toolbar renders and menus work**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

File menu opens/closes, formatting buttons visible, dark mode toggle visible.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/components/Toolbar.tsx editor/src/App.tsx editor/package.json editor/pnpm-lock.yaml && git commit -m "feat(editor): toolbar with file menu, formatting buttons, and utility toggles"
```

---

## Task 5: File operations (open, save, autosave, export)

**Files:**
- Create: `editor/src/hooks/useFileOps.ts`
- Modify: `editor/src/App.tsx`

**Context:** File operations use the File System Access API (with fallback to download for browsers that don't support it). localStorage autosave persists the document every 5 seconds. HTML export uses the Phase 4.5 normalizer+renderer.

- [ ] **Step 1: Create useFileOps hook**

Create `editor/src/hooks/useFileOps.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from "react";

const AUTOSAVE_KEY = "cn-autosave";
const AUTOSAVE_INTERVAL = 5000;

interface FileOpsState {
  fileName: string | null;
  isDirty: boolean;
  lastSaved: Date | null;
}

export function useFileOps(getCurrentSource: () => string) {
  const [state, setState] = useState<FileOpsState>({
    fileName: null,
    isDirty: false,
    lastSaved: null,
  });
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const sourceRef = useRef(getCurrentSource);
  sourceRef.current = getCurrentSource;

  // Autosave to localStorage
  useEffect(() => {
    const timer = setInterval(() => {
      const src = sourceRef.current();
      if (src) {
        try {
          localStorage.setItem(AUTOSAVE_KEY, src);
        } catch {
          // Quota exceeded — silently fail
        }
      }
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const loadAutosave = useCallback((): string | null => {
    return localStorage.getItem(AUTOSAVE_KEY);
  }, []);

  const markDirty = useCallback(() => {
    setState((s) => ({ ...s, isDirty: true }));
  }, []);

  const openFile = useCallback(async (): Promise<string | null> => {
    // Try File System Access API
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: "ClearNotation", accept: { "text/plain": [".cln"] } }],
        });
        fileHandleRef.current = handle;
        const file = await handle.getFile();
        const text = await file.text();
        setState({ fileName: file.name, isDirty: false, lastSaved: new Date() });
        return text;
      } catch {
        return null; // User cancelled
      }
    }

    // Fallback: file input
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".cln";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const text = await file.text();
        setState({ fileName: file.name, isDirty: false, lastSaved: new Date() });
        resolve(text);
      };
      input.click();
    });
  }, []);

  const saveFile = useCallback(async () => {
    const source = sourceRef.current();

    // Try saving to existing handle
    if (fileHandleRef.current) {
      try {
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(source);
        await writable.close();
        setState((s) => ({ ...s, isDirty: false, lastSaved: new Date() }));
        return;
      } catch {
        // Handle may be stale, fall through
      }
    }

    // Try File System Access API save-as
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: state.fileName || "document.cln",
          types: [{ description: "ClearNotation", accept: { "text/plain": [".cln"] } }],
        });
        fileHandleRef.current = handle;
        const writable = await handle.createWritable();
        await writable.write(source);
        await writable.close();
        const file = await handle.getFile();
        setState({ fileName: file.name, isDirty: false, lastSaved: new Date() });
        return;
      } catch {
        return; // User cancelled
      }
    }

    // Fallback: download
    downloadFile(source, state.fileName || "document.cln");
    setState((s) => ({ ...s, isDirty: false, lastSaved: new Date() }));
  }, [state.fileName]);

  const exportHtml = useCallback(async (html: string) => {
    const name = (state.fileName || "document").replace(/\.cln$/, "") + ".html";

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "HTML", accept: { "text/html": [".html"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(html);
        await writable.close();
        return;
      } catch {
        return;
      }
    }

    downloadFile(html, name);
  }, [state.fileName]);

  const newFile = useCallback(() => {
    fileHandleRef.current = null;
    setState({ fileName: null, isDirty: false, lastSaved: null });
    localStorage.removeItem(AUTOSAVE_KEY);
  }, []);

  return {
    ...state,
    markDirty,
    openFile,
    saveFile,
    exportHtml,
    newFile,
    loadAutosave,
  };
}

function downloadFile(content: string, name: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Wire file ops into App.tsx**

Update App.tsx to use `useFileOps`, connecting `onNew`, `onOpen`, `onSave`, and `onExportHtml` toolbar handlers. The `openFile` handler should parse the opened CLN text and load it into the editor. `exportHtml` should normalize the current BNBlocks and render to HTML.

- [ ] **Step 3: Verify file operations**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Test: File > New (clears editor), File > Save (saves .cln), File > Open (loads .cln), File > Export HTML (downloads .html). Verify localStorage autosave persists across page refreshes.

- [ ] **Step 4: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/hooks/useFileOps.ts editor/src/App.tsx && git commit -m "feat(editor): file operations with File System Access API, localStorage autosave, HTML export"
```

---

## Task 6: Dark mode + keyboard shortcuts

**Files:**
- Create: `editor/src/hooks/useDarkMode.ts`
- Modify: `editor/src/App.tsx`

- [ ] **Step 1: Create useDarkMode hook**

Create `editor/src/hooks/useDarkMode.ts`:

```typescript
import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "cn-theme";

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem(STORAGE_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggle = useCallback(() => setDarkMode((d) => !d), []);

  return { darkMode, toggleDarkMode: toggle };
}
```

- [ ] **Step 2: Add keyboard shortcuts to App.tsx**

Add a `useEffect` in App.tsx that listens for keyboard shortcuts:
- `Cmd+B` → toggle bold (call editor's formatting API)
- `Cmd+I` → toggle italic
- `Cmd+E` → toggle code
- `Cmd+K` → insert link
- `Cmd+S` → save file (prevent default browser save dialog)
- `Cmd+Shift+S` → export HTML

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        if (e.shiftKey) { handleExportHtml(); } else { handleSave(); }
        break;
      case "b":
        e.preventDefault();
        editorRef.current?.toggleStyles({ bold: true });
        break;
      case "i":
        e.preventDefault();
        editorRef.current?.toggleStyles({ italic: true });
        break;
      case "e":
        e.preventDefault();
        editorRef.current?.toggleStyles({ code: true });
        break;
      case "k":
        e.preventDefault();
        // BlockNote handles link insertion via its own UI
        break;
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

- [ ] **Step 3: Verify**

Dark mode toggle works. Keyboard shortcuts work. Theme persists across refresh.

- [ ] **Step 4: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/hooks/useDarkMode.ts editor/src/App.tsx && git commit -m "feat(editor): dark mode toggle and keyboard shortcuts"
```

---

## Task 7: Templates + welcome state

**Files:**
- Create: `editor/src/templates/prd.cln`
- Create: `editor/src/templates/design-doc.cln`
- Create: `editor/src/templates/meeting-notes.cln`
- Create: `editor/src/components/WelcomeOverlay.tsx`
- Modify: `editor/src/App.tsx`

- [ ] **Step 1: Create template files**

Create `editor/src/templates/prd.cln`:
```
::meta{
title = "Product Requirements Document"
status = "draft"
}

# Product Requirements Document

## Problem Statement

Describe the problem this product/feature solves.

## Goals

- Goal 1
- Goal 2

## Non-Goals

- Non-goal 1

## User Stories

::callout[kind="info", title="User Story"]{
As a [user type], I want [action] so that [benefit].
}

## Requirements

### Functional Requirements

1. Requirement 1
2. Requirement 2

### Non-Functional Requirements

1. Performance: response time < 200ms
2. Accessibility: WCAG 2.1 AA

## Open Questions

- Question 1
```

Create `editor/src/templates/design-doc.cln`:
```
::meta{
title = "Design Document"
status = "draft"
}

# Design Document

## Context

Background and motivation for this design.

## Goals

- Goal 1
- Goal 2

## Design

### Architecture

Describe the high-level architecture.

```text
Component diagram here
```

### Data Model

Describe key data structures.

### API

Describe the interface.

## Alternatives Considered

### Alternative 1

Why it was rejected.

## Risks

::callout[kind="warning", title="Risk"]{
Describe a key risk and mitigation strategy.
}
```

Create `editor/src/templates/meeting-notes.cln`:
```
::meta{
title = "Meeting Notes"
date = "2026-01-01"
}

# Meeting Notes

## Attendees

- Name 1
- Name 2

## Agenda

1. Topic 1
2. Topic 2

## Discussion

### Topic 1

Notes from discussion.

### Topic 2

Notes from discussion.

## Action Items

- [ ] Action item 1 — +{Owner}
- [ ] Action item 2 — +{Owner}

## Next Steps

Next meeting date and topics.
```

- [ ] **Step 2: Create WelcomeOverlay component**

Create `editor/src/components/WelcomeOverlay.tsx`:

```tsx
import React from "react";

interface WelcomeOverlayProps {
  onNew: () => void;
  onOpen: () => void;
  onTemplate: (name: string) => void;
  hasAutosave: boolean;
  onRestoreAutosave: () => void;
}

export default function WelcomeOverlay({
  onNew, onOpen, onTemplate, hasAutosave, onRestoreAutosave,
}: WelcomeOverlayProps) {
  return (
    <div className="welcome-overlay">
      <h2>ClearNotation Editor</h2>
      <p>
        A visual editor for ClearNotation technical documentation.
        Write in a Notion-style editor, see the source syntax update live.
      </p>
      <div className="welcome-actions">
        <button className="btn-primary" onClick={onNew}>New Document</button>
        <button className="btn-secondary" onClick={onOpen}>Open File</button>
      </div>
      {hasAutosave && (
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={onRestoreAutosave}>
          Restore last session
        </button>
      )}
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, marginBottom: 8 }}>Or start from a template:</p>
        <div className="welcome-actions">
          <button className="btn-secondary" onClick={() => onTemplate("prd")}>PRD</button>
          <button className="btn-secondary" onClick={() => onTemplate("design-doc")}>Design Doc</button>
          <button className="btn-secondary" onClick={() => onTemplate("meeting-notes")}>Meeting Notes</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire templates and welcome state into App.tsx**

Import templates as raw strings using Vite's `?raw` suffix. Show WelcomeOverlay when no document is loaded. When a template is selected, load it into the editor via the parser→converter pipeline.

- [ ] **Step 4: Verify**

Welcome screen appears on first load. Templates load correctly. New Document starts with a blank editor.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/templates/ editor/src/components/WelcomeOverlay.tsx editor/src/App.tsx && git commit -m "feat(editor): templates (PRD, design doc, meeting notes) and welcome state"
```

---

## Task 8: Cheat sheet panel + status bar + Markdown paste

**Files:**
- Create: `editor/src/components/CheatSheet.tsx`
- Create: `editor/src/components/StatusBar.tsx`
- Create: `editor/src/hooks/useMarkdownPaste.ts`
- Create: `editor/src/lib/markdown-convert.ts`
- Modify: `editor/src/App.tsx`

- [ ] **Step 1: Create CheatSheet component**

Create `editor/src/components/CheatSheet.tsx`:

```tsx
import React from "react";
import { X } from "lucide-react";

interface CheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function CheatSheet({ open, onClose }: CheatSheetProps) {
  return (
    <div className={`cheat-sheet ${open ? "open" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3>ClearNotation Syntax</h3>
        <button className="toolbar-btn" onClick={onClose} aria-label="Close cheat sheet">
          <X size={16} />
        </button>
      </div>

      <h3>Inline Formatting</h3>
      <table>
        <tbody>
          <tr><td><code>+&#123;bold&#125;</code></td><td>Strong text</td></tr>
          <tr><td><code>*&#123;italic&#125;</code></td><td>Emphasis</td></tr>
          <tr><td><code>`code`</code></td><td>Code span</td></tr>
          <tr><td><code>[label -&gt; url]</code></td><td>Link</td></tr>
          <tr><td><code>^&#123;note&#125;</code></td><td>Inline note</td></tr>
          <tr><td><code>::ref[target="id"]</code></td><td>Cross-reference</td></tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>Blocks</h3>
      <table>
        <tbody>
          <tr><td><code># Heading</code></td><td>Heading (1-6 levels)</td></tr>
          <tr><td><code>- item</code></td><td>Unordered list</td></tr>
          <tr><td><code>1. item</code></td><td>Ordered list</td></tr>
          <tr><td><code>&gt; quote</code></td><td>Blockquote</td></tr>
          <tr><td><code>---</code></td><td>Thematic break</td></tr>
          <tr><td><code>```lang</code></td><td>Code block (close with ```)</td></tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>Directives</h3>
      <table>
        <tbody>
          <tr><td><code>::callout[kind="info"]&#123;...&#125;</code></td><td>Callout block</td></tr>
          <tr><td><code>::table[header=true]&#123;...&#125;</code></td><td>Table</td></tr>
          <tr><td><code>::math&#123;...&#125;</code></td><td>Math block</td></tr>
          <tr><td><code>::toc</code></td><td>Table of contents</td></tr>
          <tr><td><code>::anchor[id="x"]</code></td><td>Anchor point</td></tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 16 }}>Keyboard Shortcuts</h3>
      <table>
        <tbody>
          <tr><td><code>⌘B</code></td><td>Bold</td></tr>
          <tr><td><code>⌘I</code></td><td>Italic</td></tr>
          <tr><td><code>⌘E</code></td><td>Code</td></tr>
          <tr><td><code>⌘K</code></td><td>Link</td></tr>
          <tr><td><code>⌘S</code></td><td>Save</td></tr>
          <tr><td><code>/</code></td><td>Slash menu</td></tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create StatusBar component**

Create `editor/src/components/StatusBar.tsx`:

```tsx
import React from "react";

interface StatusBarProps {
  fileName: string | null;
  isDirty: boolean;
  syncing: boolean;
  wordCount: number;
}

export default function StatusBar({ fileName, isDirty, syncing, wordCount }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span>{fileName ?? "Untitled"}{isDirty ? " •" : ""}</span>
      <div className="status-bar__spacer" />
      {syncing && <span>Syncing...</span>}
      <span>{wordCount} words</span>
      <span>ClearNotation v0.1</span>
    </div>
  );
}
```

- [ ] **Step 3: Create markdown-convert.ts**

Create `editor/src/lib/markdown-convert.ts`:

```typescript
/**
 * Best-effort Markdown → ClearNotation conversion for paste events.
 * Handles common formatting: **bold**, *italic*, [text](url), # headings.
 * Passes through anything ambiguous or already-valid ClearNotation.
 */
export function convertMarkdownToCln(md: string): string {
  let result = md;

  // Bold: **text** or __text__ → +{text}
  result = result.replace(/\*\*(.+?)\*\*/g, "+{$1}");
  result = result.replace(/__(.+?)__/g, "+{$1}");

  // Italic: *text* or _text_ → *{text}
  // Be careful not to match already-converted +{...}
  result = result.replace(/(?<!\+)\*([^*\n]+?)\*/g, "*{$1}");
  result = result.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, "*{$1}");

  // Links: [text](url) → [text -> url]
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1 -> $2]");

  // Inline code is the same in both: `code`

  // Headings are the same in both: # Heading

  return result;
}
```

- [ ] **Step 4: Create useMarkdownPaste hook**

Create `editor/src/hooks/useMarkdownPaste.ts`:

```typescript
import { useEffect } from "react";
import { convertMarkdownToCln } from "../lib/markdown-convert";

/**
 * Intercepts paste events and converts Markdown to ClearNotation syntax.
 * Only converts plain text pastes — rich text (HTML) is handled by BlockNote.
 */
export function useMarkdownPaste(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData("text/html");
      // If HTML is present, let BlockNote handle it (it does rich paste)
      if (html) return;

      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;

      // Check if the text looks like Markdown (has formatting)
      const hasMarkdown = /\*\*|__|\[.*\]\(.*\)|^#{1,6}\s/m.test(text);
      if (!hasMarkdown) return;

      // Convert and re-insert
      e.preventDefault();
      const converted = convertMarkdownToCln(text);
      document.execCommand("insertText", false, converted);
    };

    el.addEventListener("paste", handler);
    return () => el.removeEventListener("paste", handler);
  }, [containerRef]);
}
```

- [ ] **Step 5: Wire all components into App.tsx**

Integrate CheatSheet, StatusBar, and useMarkdownPaste into App.tsx. Add word count calculation (count words in source text). Wire cheat sheet toggle.

- [ ] **Step 6: Verify everything works**

Cheat sheet slides in/out. Status bar shows file name, word count, and sync indicator. Pasting Markdown text converts to ClearNotation syntax.

- [ ] **Step 7: Run all tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/components/CheatSheet.tsx editor/src/components/StatusBar.tsx editor/src/hooks/useMarkdownPaste.ts editor/src/lib/markdown-convert.ts editor/src/App.tsx && git commit -m "feat(editor): cheat sheet, status bar, and Markdown paste conversion"
```

---

## Task 9: Accessibility + final polish

**Files:**
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/app.css`
- Modify: `editor/src/components/SplitPane.tsx`
- Modify: `editor/src/components/Toolbar.tsx`

**Context:** WCAG 2.1 AA compliance: focus-visible outlines, ARIA labels, keyboard navigation for all interactive elements, skip links, and sufficient color contrast. Most of this is already in place from component implementations — this task is for auditing and fixing gaps.

- [ ] **Step 1: Add skip link**

At the top of App.tsx's output, add a skip link:
```tsx
<a href="#main-editor" className="skip-link">Skip to editor</a>
```

Add to app.css:
```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--cn-accent);
  color: white;
  padding: 8px 16px;
  z-index: 100;
  transition: top 150ms ease;
}

.skip-link:focus {
  top: 0;
}
```

Add `id="main-editor"` to the visual editor container.

- [ ] **Step 2: Verify focus management**

- Tab through all toolbar buttons → each gets visible focus ring
- Tab to split pane divider → it's focusable
- Tab to editor → focus enters BlockNote
- Escape from cheat sheet → returns focus to trigger button

- [ ] **Step 3: Verify color contrast**

All text/background combinations must meet WCAG AA (4.5:1 ratio):
- `--cn-fg` on `--cn-bg`: #1a1a1a on #ffffff = 17.4:1 ✓
- `--cn-muted` on `--cn-bg`: #6b7280 on #ffffff = 5.0:1 ✓
- `--cn-accent` on white: #2563eb on #ffffff = 4.6:1 ✓ (just passes)
- Dark mode: #f3f4f6 on #111827 = 15.9:1 ✓

- [ ] **Step 4: Run all tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
cd /Users/ryan/projects/clear-notation/clearnotation-js && pnpm test
cd /Users/ryan/projects/clear-notation && python3 -m unittest discover -s tests -v
```

All tests pass.

- [ ] **Step 5: Final commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/ && git commit -m "feat(editor): WCAG 2.1 AA accessibility, skip link, focus management"
```

---

## Appendix: Component Wiring Summary

```
App.tsx
├── useDarkMode()         → darkMode, toggleDarkMode
├── useSync()             → source, syncing, onDocumentChange
├── useFileOps(getSource) → fileName, isDirty, openFile, saveFile, exportHtml, newFile
├── useMarkdownPaste(ref) → auto-converts on paste
│
├── <Toolbar>             → file menu, formatting, theme, cheat sheet
├── <SplitPane>
│   ├── <VisualEditor>    → BlockNote + onChange → onDocumentChange
│   └── <SourcePane>      → displays serialized CLN source
├── <StatusBar>           → file name, word count, sync status
├── <CheatSheet>          → slide-in syntax reference
└── <WelcomeOverlay>      → shown when no document loaded
```
