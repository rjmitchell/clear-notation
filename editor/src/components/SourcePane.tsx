import React, { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState, Annotation, Transaction } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

/**
 * Annotation used to mark transactions that originate from external sync
 * (visual → source). The update listener skips these so we don't loop.
 */
const syncAnnotation = Annotation.define<boolean>();

interface SourcePaneProps {
  source: string;
  onSourceChange: (text: string) => void;
  syncing?: boolean;
  parseError?: boolean;
}

/**
 * Editable source pane backed by CodeMirror 6.
 *
 * - Local keystrokes go through CodeMirror's own undo stack.
 * - External source updates (from visual→source sync) are dispatched
 *   with syncAnnotation so the update listener ignores them, and with
 *   addToHistory=false so they don't pollute the undo stack.
 */
export default function SourcePane({
  source,
  onSourceChange,
  syncing,
  parseError,
}: SourcePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSourceChangeRef = useRef(onSourceChange);

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

  return (
    <div className="source-pane">
      {parseError && (
        <div className="source-error-bar" role="alert">
          <span aria-hidden="true">&#9888;</span>{" "}
          Syntax error — visual editor shows last valid state
        </div>
      )}
      <div ref={containerRef} className="source-pane-editor" />
    </div>
  );
}
