import React, { useCallback, useState } from "react";
import "./app.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import Toolbar from "./components/Toolbar";
import { useSync } from "./hooks/useSync";

export default function App() {
  const { source, syncing, onDocumentChange } = useSync();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const handleChange = useCallback(
    (blocks: Parameters<typeof onDocumentChange>[0]) => {
      onDocumentChange(blocks);
    },
    [onDocumentChange]
  );

  const noop = useCallback(() => {}, []);

  return (
    <div className="app-shell">
      <header className="toolbar">
        <Toolbar
          onNew={noop}
          onNewFromTemplate={noop}
          onOpen={noop}
          onSave={noop}
          onExportHtml={noop}
          onToggleBold={noop}
          onToggleItalic={noop}
          onToggleCode={noop}
          onInsertLink={noop}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          cheatSheetOpen={cheatSheetOpen}
          onToggleCheatSheet={() => setCheatSheetOpen((o) => !o)}
        />
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
