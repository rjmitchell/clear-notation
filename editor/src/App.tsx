import React, { useCallback } from "react";
import "./app.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import { useSync } from "./hooks/useSync";

export default function App() {
  const { source, syncing, onDocumentChange } = useSync();

  const handleChange = useCallback(
    (blocks: Parameters<typeof onDocumentChange>[0]) => {
      onDocumentChange(blocks);
    },
    [onDocumentChange]
  );

  return (
    <div className="app-shell">
      <header className="toolbar">
        <span>ClearNotation</span>
      </header>

      <main className="main-content">
        <SplitPane
          left={<VisualEditor onDocumentChange={handleChange} />}
          right={<SourcePane source={source} syncing={syncing} />}
        />
      </main>

      <footer className="status-bar">
        <span>Untitled</span>
        <span>ClearNotation v0.1</span>
      </footer>
    </div>
  );
}
