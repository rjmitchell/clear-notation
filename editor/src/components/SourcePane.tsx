import React, { useEffect, useRef, useState } from "react";
import { EditorView, keymap, lineNumbers, gutter, GutterMarker } from "@codemirror/view";
import { EditorState, Annotation, Transaction, StateField, StateEffect, RangeSet } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { SyncState } from "../lib/parse-source";

/**
 * Annotation used to mark transactions that originate from external sync
 * (visual → source). The update listener skips these so we don't loop.
 */
const syncAnnotation = Annotation.define<boolean>();

/**
 * State effect + field for the error gutter marker. Dispatched by the
 * error-gutter useEffect below when syncState transitions to/from broken.
 */
const setErrorMarker = StateEffect.define<boolean>();

const errorMarkerField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setErrorMarker)) return e.value;
    }
    return value;
  },
});

class ErrorGutterMarker extends GutterMarker {
  toDOM() {
    const div = document.createElement("div");
    div.className = "cn-source-error-gutter";
    div.title = "Source has a syntax error";
    return div;
  }
}

const errorGutterExtension = [
  errorMarkerField,
  gutter({
    class: "cn-source-error-gutter-wrap",
    markers(view) {
      const hasError = view.state.field(errorMarkerField);
      if (!hasError) return RangeSet.empty;
      // Place marker on line 1 (we cannot reliably know the error line
      // because tree-sitter discards missing tokens — see spec §4).
      return RangeSet.of(new ErrorGutterMarker().range(0));
    },
  }),
];

interface SourcePaneProps {
  source: string;
  onSourceChange: (text: string) => void;
  syncing?: boolean;
  syncState?: SyncState;
}

/**
 * Editable source pane backed by CodeMirror 6.
 *
 * - Local keystrokes go through CodeMirror's own undo stack.
 * - External source updates (from visual→source sync) are dispatched
 *   with syncAnnotation so the update listener ignores them, and with
 *   addToHistory=false so they don't pollute the undo stack.
 * - When syncState is "broken", a red gutter marker appears on line 1
 *   and an aria-live region announces the error.
 */
export default function SourcePane({
  source,
  onSourceChange,
  syncing,
  syncState = "valid",
}: SourcePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSourceChangeRef = useRef(onSourceChange);
  const [liveMessage, setLiveMessage] = useState("");

  // Keep the callback ref current without recreating the editor
  useEffect(() => {
    onSourceChangeRef.current = onSourceChange;
  }, [onSourceChange]);

  // Create CodeMirror once
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          errorGutterExtension,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            // Skip updates that came from external sync
            for (const tr of update.transactions) {
              if (tr.annotation(syncAnnotation)) return;
            }
            onSourceChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external source prop into CodeMirror
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc === source) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
      annotations: [
        syncAnnotation.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }, [source]);

  // Toggle error gutter marker in response to syncState changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setErrorMarker.of(syncState === "broken"),
    });
  }, [syncState]);

  // Drive the aria-live region — announce broken + valid transitions, silent on recovered
  useEffect(() => {
    if (syncState === "broken") {
      setLiveMessage("Source has a syntax error. Visual editor is read-only.");
    } else if (syncState === "valid") {
      setLiveMessage("Visual editor is active.");
    }
    // "recovered" is intentionally silent — no announcement
  }, [syncState]);

  return (
    <div className="source-pane">
      <div
        aria-live="polite"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveMessage}
      </div>
      <div ref={containerRef} className="source-pane-editor" />
    </div>
  );
}
