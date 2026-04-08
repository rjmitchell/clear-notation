# Phase 5b: Bidirectional Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only source pane with an editable CodeMirror editor and implement bidirectional sync — edits in either pane update the other, with generation counters to prevent loops, 300ms debounce, error recovery, and per-pane undo stacks.

**Architecture:** The sync protocol uses generation counters: each pane has a generation number that increments when the user edits in that pane. When a sync update arrives at a pane, it's tagged with the source generation — if the pane already saw that generation, it skips the update (preventing loops). Visual→source sync serializes BNBlocks to CLN text. Source→visual sync parses CLN text through tree-sitter (Web Worker), converts the CST to BNBlocks, then maps to BlockNote's document format and replaces the editor content. Sync updates in both directions are applied without adding to the receiving pane's undo history. When the source has parse errors, the visual pane holds its last valid state and the source pane shows an error indicator.

**Tech Stack:** CodeMirror 6, @codemirror/state, @codemirror/view, @codemirror/commands, existing tree-sitter WASM parser (Phase 1), existing converter (Phase 3), existing serializer (Phase 4)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `editor/src/components/SourcePane.tsx` | Rewrite | CodeMirror editor replacing read-only `<pre>` |
| `editor/src/hooks/useSync.ts` | Rewrite | Bidirectional sync with generation counters, debounce, error recovery |
| `editor/src/lib/bn-to-blocknote.ts` | Create | Reverse mapping: BNBlock[] → BlockNote Block[] format |
| `editor/src/lib/bn-to-blocknote.test.ts` | Create | Tests for reverse mapping |
| `editor/src/components/VisualEditor.tsx` | Modify | Accept `replaceDocument` callback, expose replaceBlocks function |
| `editor/src/App.tsx` | Modify | Wire bidirectional sync, initialize parser |
| `editor/src/app.css` | Modify | Add CodeMirror theme overrides |

---

## Task 1: Install CodeMirror + create editable source pane

**Files:**
- Modify: `editor/package.json`
- Rewrite: `editor/src/components/SourcePane.tsx`
- Modify: `editor/src/app.css`

- [ ] **Step 1: Install CodeMirror packages**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm add codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/search
```

- [ ] **Step 2: Add CodeMirror theme CSS to app.css**

Append to `editor/src/app.css`:

```css
/* === CodeMirror overrides === */

.source-pane .cm-editor {
  height: 100%;
  font-family: var(--cn-font-mono);
  font-size: 13px;
  background: var(--cn-code-bg);
}

.source-pane .cm-editor .cm-content {
  padding: 16px;
  line-height: 1.6;
  caret-color: var(--cn-accent);
}

.source-pane .cm-editor .cm-gutters {
  background: var(--cn-code-bg);
  border-right: 1px solid var(--cn-border);
  color: var(--cn-muted);
  font-size: 12px;
}

.source-pane .cm-editor .cm-activeLine {
  background: transparent;
}

.source-pane .cm-editor .cm-selectionBackground {
  background: color-mix(in srgb, var(--cn-accent) 20%, transparent) !important;
}

.source-pane .cm-editor.cm-focused {
  outline: none;
}

.source-pane .cm-editor .cm-line.cm-sync-highlight {
  background: color-mix(in srgb, var(--cn-accent) 10%, transparent);
  transition: background 300ms ease-out;
}

.source-pane .source-error-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: color-mix(in srgb, var(--cn-warning) 15%, var(--cn-code-bg));
  border-bottom: 1px solid var(--cn-border);
  font-size: 12px;
  color: var(--cn-warning);
}
```

- [ ] **Step 3: Rewrite SourcePane with CodeMirror**

Replace `editor/src/components/SourcePane.tsx`:

```tsx
import React, { useEffect, useRef, useCallback } from "react";
import { EditorState, Annotation, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo } from "@codemirror/commands";

/** Annotation to tag sync updates (should not add to undo history). */
const syncAnnotation = Annotation.define<boolean>();

interface SourcePaneProps {
  source: string;
  onSourceChange: (text: string) => void;
  syncing?: boolean;
  parseError?: boolean;
}

export default function SourcePane({
  source,
  onSourceChange,
  syncing,
  parseError,
}: SourcePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onSourceChange);
  onChangeRef.current = onSourceChange;
  const suppressNextUpdate = useRef(false);

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          // Check if this change came from a sync update
          for (const tr of update.transactions) {
            if (tr.annotation(syncAnnotation)) {
              return; // Don't notify parent about sync-driven changes
            }
          }
          onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only create once

  // Update CodeMirror when source changes externally (sync from visual editor)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc === source) return; // No change needed

    // Apply as a sync transaction (won't add to undo history)
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: source },
      annotations: [
        syncAnnotation.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }, [source]);

  return (
    <div className="source-pane">
      {parseError && (
        <div className="source-error-bar">
          <span>⚠</span>
          <span>Syntax error — visual editor shows last valid state</span>
        </div>
      )}
      <div ref={containerRef} style={{ height: parseError ? "calc(100% - 28px)" : "100%" }} />
    </div>
  );
}
```

- [ ] **Step 4: Temporarily wire into App.tsx**

Update App.tsx to pass `onSourceChange` to SourcePane (stub handler that logs):

In App.tsx, change the SourcePane usage from:
```tsx
<SourcePane source={source} syncing={syncing} />
```
to:
```tsx
<SourcePane
  source={source}
  onSourceChange={(text) => console.log("Source changed:", text.length, "chars")}
  syncing={syncing}
/>
```

- [ ] **Step 5: Verify CodeMirror renders**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Open browser → source pane now has CodeMirror with line numbers, editable text, undo/redo. Visual editor changes still update the source pane. Editing in source pane logs to console.

- [ ] **Step 6: Run tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
```

Expected: 301 tests pass (SourcePane tests may need adjustment if any existed).

- [ ] **Step 7: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/ && git commit -m "feat(editor): replace read-only source pane with CodeMirror editor"
```

---

## Task 2: BNBlock → BlockNote reverse mapping

**Files:**
- Create: `editor/src/lib/bn-to-blocknote.ts`
- Create: `editor/src/lib/bn-to-blocknote.test.ts`

**Context:** The VisualEditor converts BlockNote → BNBlock (visual→internal). For bidirectional sync we need the reverse: BNBlock → BlockNote format, so we can inject parsed CLN content into the visual editor.

BlockNote's internal block format:
```typescript
{ id: string, type: string, props: Record<string, any>, content: InlineContent[], children: Block[] }
```

Our BNBlock format:
```typescript
{ type: string, props: Record<string, any>, content: BNInlineContent[], children: BNBlock[] }
```

The mapping reverses the type and style name translations from VisualEditor.tsx.

- [ ] **Step 1: Write tests**

Create `editor/src/lib/bn-to-blocknote.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { bnBlocksToBlockNote } from "./bn-to-blocknote";
import type { BNBlock } from "../converter/types";

describe("bnBlocksToBlockNote", () => {
  it("converts a paragraph", () => {
    const blocks: BNBlock[] = [{
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "hello", styles: {} }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].content).toEqual([{ type: "text", text: "hello", styles: {} }]);
  });

  it("converts a heading with level", () => {
    const blocks: BNBlock[] = [{
      type: "clnHeading",
      props: { level: 2 },
      content: [{ type: "text", text: "Title", styles: {} }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].type).toBe("heading");
    expect(result[0].props.level).toBe(2);
  });

  it("maps clnStrong to bold style", () => {
    const blocks: BNBlock[] = [{
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "bold", styles: { clnStrong: true } }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].content[0].styles).toEqual({ bold: true });
  });

  it("maps clnEmphasis to italic style", () => {
    const blocks: BNBlock[] = [{
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "em", styles: { clnEmphasis: true } }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].content[0].styles).toEqual({ italic: true });
  });

  it("maps clnCode to code style", () => {
    const blocks: BNBlock[] = [{
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "x", styles: { clnCode: true } }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].content[0].styles).toEqual({ code: true });
  });

  it("converts links", () => {
    const blocks: BNBlock[] = [{
      type: "clnParagraph",
      props: {},
      content: [{
        type: "link",
        href: "/docs",
        content: [{ type: "text", text: "docs", styles: {} }],
      }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].content[0]).toEqual({
      type: "link",
      href: "/docs",
      content: [{ type: "text", text: "docs", styles: {} }],
    });
  });

  it("converts unordered list", () => {
    const blocks: BNBlock[] = [{
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "item", styles: {} }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].type).toBe("bulletListItem");
  });

  it("converts ordered list", () => {
    const blocks: BNBlock[] = [{
      type: "clnOrderedList",
      props: { startNumber: 1 },
      content: [{ type: "text", text: "item", styles: {} }],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].type).toBe("numberedListItem");
  });

  it("converts code block", () => {
    const blocks: BNBlock[] = [{
      type: "clnCodeBlock",
      props: { language: "python", code: "print(1)" },
      content: [],
      children: [],
    }];
    const result = bnBlocksToBlockNote(blocks);
    expect(result[0].type).toBe("codeBlock");
    expect(result[0].props.language).toBe("python");
    expect(result[0].content).toEqual([{ type: "text", text: "print(1)", styles: {} }]);
  });

  it("handles multiple blocks", () => {
    const blocks: BNBlock[] = [
      { type: "clnHeading", props: { level: 1 }, content: [{ type: "text", text: "Title", styles: {} }], children: [] },
      { type: "clnParagraph", props: {}, content: [{ type: "text", text: "Body.", styles: {} }], children: [] },
    ];
    const result = bnBlocksToBlockNote(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("heading");
    expect(result[1].type).toBe("paragraph");
  });

  it("skips unknown block types gracefully", () => {
    const blocks: BNBlock[] = [{
      type: "clnCallout",
      props: { kind: "info" },
      content: [],
      children: [{ type: "clnParagraph", props: {}, content: [{ type: "text", text: "body", styles: {} }], children: [] }],
    }];
    const result = bnBlocksToBlockNote(blocks);
    // Unknown types fall back to paragraph
    expect(result[0].type).toBe("paragraph");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/lib/bn-to-blocknote.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reverse mapping**

Create `editor/src/lib/bn-to-blocknote.ts`:

```typescript
import type { BNBlock, BNInlineContent, BNStyledText, BNLink } from "../converter/types";

/** Reverse type map: CLN block type → BlockNote block type. */
const REVERSE_TYPE_MAP: Record<string, string> = {
  clnHeading: "heading",
  clnParagraph: "paragraph",
  clnUnorderedList: "bulletListItem",
  clnOrderedList: "numberedListItem",
  clnCodeBlock: "codeBlock",
  clnThematicBreak: "paragraph", // BlockNote doesn't have a thematic break
};

/** Reverse style map: CLN style → BlockNote style. */
const REVERSE_STYLE_MAP: Record<string, string> = {
  clnStrong: "bold",
  clnEmphasis: "italic",
  clnCode: "code",
};

/**
 * Convert BNBlock[] (our internal format) to BlockNote's document format.
 * This is the reverse of VisualEditor's convertDocument function.
 */
export function bnBlocksToBlockNote(blocks: BNBlock[]): any[] {
  return blocks.map(bnBlockToBlockNote);
}

function bnBlockToBlockNote(block: BNBlock): any {
  const type = REVERSE_TYPE_MAP[block.type] || "paragraph";
  const props: Record<string, any> = {};

  if (type === "heading" && block.props.level) {
    props.level = block.props.level;
  }

  if (type === "codeBlock") {
    if (block.props.language) props.language = block.props.language;
    // Code blocks store code as text content in BlockNote
    return {
      type,
      props,
      content: [{ type: "text", text: (block.props.code as string) || "", styles: {} }],
      children: [],
    };
  }

  const content = block.content.map(convertInlineToBlockNote);
  const children = block.children.map(bnBlockToBlockNote);

  return { type, props, content, children };
}

function convertInlineToBlockNote(item: BNInlineContent): any {
  if (item.type === "link") {
    return {
      type: "link",
      href: item.href,
      content: item.content.map(convertStyledTextToBlockNote),
    };
  }
  return convertStyledTextToBlockNote(item as BNStyledText);
}

function convertStyledTextToBlockNote(item: BNStyledText): any {
  const styles: Record<string, boolean | string> = {};
  for (const [key, value] of Object.entries(item.styles)) {
    const mapped = REVERSE_STYLE_MAP[key];
    if (mapped) {
      styles[mapped] = value;
    }
    // Drop unmapped CLN styles (clnNote, clnRef) — they don't have BlockNote equivalents
  }
  return { type: "text", text: item.text, styles };
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/lib/bn-to-blocknote.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/lib/bn-to-blocknote.ts editor/src/lib/bn-to-blocknote.test.ts && git commit -m "feat(editor): BNBlock to BlockNote reverse mapping for bidirectional sync"
```

---

## Task 3: Bidirectional sync hook

**Files:**
- Rewrite: `editor/src/hooks/useSync.ts`
- Modify: `editor/src/components/VisualEditor.tsx`

**Context:** Replace the one-directional useSync with a bidirectional version using generation counters. The hook manages:
1. `source` state (CLN text displayed in CodeMirror)
2. `generation` counter that increments on each edit
3. `lastSyncedGeneration` that tracks which generation was last synced
4. Visual→source: serialize BNBlocks → CLN text (debounced 300ms)
5. Source→visual: parse CLN text → convert → BNBlocks (debounced 300ms)
6. Error state when parsing fails

The VisualEditor needs to accept a `documentToLoad` prop — when it changes, the editor replaces its content.

- [ ] **Step 1: Rewrite useSync**

Replace `editor/src/hooks/useSync.ts`:

```typescript
import { useCallback, useRef, useState } from "react";
import type { BNBlock } from "../converter/types";
import { serializeDocument } from "../serializer";

/**
 * Bidirectional sync hook.
 *
 * Manages two-way sync between the visual editor (BNBlocks) and the
 * source pane (CLN text) with generation counters to prevent loops.
 */
export function useSync() {
  const [source, setSourceState] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [parseError, setParseError] = useState(false);
  const [documentToLoad, setDocumentToLoad] = useState<BNBlock[] | null>(null);

  // Generation counters — prevent sync loops
  const visualGenRef = useRef(0);
  const sourceGenRef = useRef(0);
  const activeGenRef = useRef<"visual" | "source" | null>(null);

  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Called when the visual editor changes.
   * Serializes to CLN text and updates the source pane.
   */
  const onVisualChange = useCallback((blocks: BNBlock[]) => {
    visualGenRef.current++;
    activeGenRef.current = "visual";

    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    setSyncing(true);

    visualTimerRef.current = setTimeout(() => {
      const text = serializeDocument(blocks);
      sourceGenRef.current = visualGenRef.current; // Mark source as synced
      setSourceState(text);
      setSyncing(false);
      visualTimerRef.current = null;
    }, 300);
  }, []);

  /**
   * Called when the source pane text changes (user typing in CodeMirror).
   * Parses CLN text and updates the visual editor.
   */
  const onSourceChange = useCallback((text: string) => {
    // Don't re-parse if this change came from visual→source sync
    if (activeGenRef.current === "visual") {
      activeGenRef.current = null;
      return;
    }

    sourceGenRef.current++;
    activeGenRef.current = "source";
    setSourceState(text);

    if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current);
    setSyncing(true);

    sourceTimerRef.current = setTimeout(async () => {
      try {
        // Dynamic import to avoid circular dependencies and keep parser lazy
        const { parseSourceToBlocks } = await import("../lib/parse-source");
        const blocks = await parseSourceToBlocks(text);
        if (blocks) {
          visualGenRef.current = sourceGenRef.current; // Mark visual as synced
          setDocumentToLoad(blocks);
          setParseError(false);
        }
      } catch {
        setParseError(true);
      }
      setSyncing(false);
      sourceTimerRef.current = null;
    }, 300);
  }, []);

  /**
   * Set source directly (for file open, template load, restore).
   * Does NOT trigger source→visual sync — the caller is responsible
   * for also loading the document into the visual editor if needed.
   */
  const setSourceDirectly = useCallback((text: string) => {
    sourceGenRef.current++;
    visualGenRef.current = sourceGenRef.current;
    setSourceState(text);
    setParseError(false);
  }, []);

  /**
   * Called by VisualEditor after it has loaded the documentToLoad.
   * Clears the pending document.
   */
  const clearDocumentToLoad = useCallback(() => {
    setDocumentToLoad(null);
  }, []);

  return {
    source,
    setSource: setSourceDirectly,
    syncing,
    parseError,
    onVisualChange,
    onSourceChange,
    documentToLoad,
    clearDocumentToLoad,
  };
}
```

- [ ] **Step 2: Create parse-source helper**

Create `editor/src/lib/parse-source.ts`:

```typescript
import type { BNBlock } from "../converter/types";
import { ClearNotationParser } from "../parser";
import { convertDocument } from "../converter";

let parser: ClearNotationParser | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Parse ClearNotation source text to BNBlock[].
 * Lazily initializes the tree-sitter WASM parser on first call.
 */
export async function parseSourceToBlocks(source: string): Promise<BNBlock[] | null> {
  if (!parser) {
    parser = new ClearNotationParser();
    initPromise = parser.init("/tree-sitter-clearnotation.wasm");
  }
  await initPromise;

  const { tree } = await parser.parse(source);
  if (tree.hasError) return null; // Parse error — don't update visual
  const blocks = await convertDocument(tree);
  return blocks;
}
```

- [ ] **Step 3: Update VisualEditor to accept documentToLoad**

Modify `editor/src/components/VisualEditor.tsx` to add a `documentToLoad` prop. When `documentToLoad` changes (non-null), replace the editor's content using `bnBlocksToBlockNote`:

Add to the VisualEditor props:
```typescript
interface VisualEditorProps {
  onDocumentChange: (blocks: BNBlock[]) => void;
  editorRef?: React.MutableRefObject<BlockNoteEditor | null>;
  darkMode?: boolean;
  documentToLoad?: BNBlock[] | null;
  onDocumentLoaded?: () => void;
}
```

Add a useEffect that watches `documentToLoad`:
```typescript
useEffect(() => {
  if (!documentToLoad || !editor) return;
  const blockNoteBlocks = bnBlocksToBlockNote(documentToLoad);
  editor.replaceBlocks(editor.document, blockNoteBlocks);
  onDocumentLoaded?.();
}, [documentToLoad]);
```

Import `bnBlocksToBlockNote` from `../lib/bn-to-blocknote`.

- [ ] **Step 4: Wire bidirectional sync in App.tsx**

Update App.tsx to use the new useSync API:

```typescript
const {
  source, setSource, syncing, parseError,
  onVisualChange, onSourceChange,
  documentToLoad, clearDocumentToLoad,
} = useSync();
```

Update SourcePane to pass `onSourceChange` and `parseError`:
```tsx
<SourcePane
  source={source}
  onSourceChange={onSourceChange}
  syncing={syncing}
  parseError={parseError}
/>
```

Update VisualEditor to pass `documentToLoad` and `clearDocumentToLoad`:
```tsx
<VisualEditor
  onDocumentChange={handleChange}
  editorRef={editorRef}
  darkMode={darkMode}
  documentToLoad={documentToLoad}
  onDocumentLoaded={clearDocumentToLoad}
/>
```

Change `handleChange` to call `onVisualChange` instead of `onDocumentChange`.

- [ ] **Step 5: Test bidirectional sync**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm dev
```

Test:
1. Type in visual editor → source pane updates (as before)
2. Type in source pane (e.g., add `# New Heading`) → after 300ms, visual editor shows the heading
3. Type invalid syntax in source → error bar appears, visual editor keeps last valid state
4. Undo in source pane → reverts source edits only
5. Undo in visual editor → reverts visual edits only

- [ ] **Step 6: Run all tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
```

Expected: all tests pass (301+ with new bn-to-blocknote tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/hooks/useSync.ts editor/src/lib/parse-source.ts editor/src/components/VisualEditor.tsx editor/src/App.tsx && git commit -m "feat(editor): bidirectional sync with generation counters and error recovery"
```

---

## Appendix: Sync Protocol Summary

```
                    Visual Editor (BlockNote)
                         │
                  onChange triggers
                         │
                         ▼
              onVisualChange(blocks)
                         │
                  visualGen++ 
                  activeGen = "visual"
                  debounce 300ms
                         │
                         ▼
              serializeDocument(blocks)
                         │
                  sourceGen = visualGen
                         │
                         ▼
              setSource(text) ──────────► CodeMirror (SourcePane)
                                                │
                                         onChange triggers
                                                │
                                                ▼
                                      onSourceChange(text)
                                                │
                                      check activeGen == "visual"?
                                          yes → skip (our own update)
                                          no  → sourceGen++
                                                activeGen = "source"
                                                debounce 300ms
                                                │
                                                ▼
                                      parseSourceToBlocks(text)
                                                │
                                          parse error?
                                          yes → setParseError(true), stop
                                          no  → visualGen = sourceGen
                                                │
                                                ▼
                                      setDocumentToLoad(blocks)
                                                │
                                                ▼
                           VisualEditor.replaceBlocks(blocks)
```

**Per-pane undo:**
- CodeMirror: native undo stack. Sync updates annotated with `Transaction.addToHistory.of(false)`.
- BlockNote: native undo stack. `replaceBlocks` updates are separate from user edits.
- Cross-pane undo not supported in v1.
