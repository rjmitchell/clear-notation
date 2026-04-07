import React, { useCallback, useState } from "react";
import "./app.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import Toolbar from "./components/Toolbar";
import { useSync } from "./hooks/useSync";
import { useFileOps } from "./hooks/useFileOps";

export default function App() {
  const { source, syncing, onDocumentChange } = useSync();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const fileOps = useFileOps({
    getCurrentSource: () => source,
  });

  const handleChange = useCallback(
    (blocks: Parameters<typeof onDocumentChange>[0]) => {
      onDocumentChange(blocks);
      fileOps.markDirty();
    },
    [onDocumentChange, fileOps]
  );

  const handleNew = useCallback(() => {
    fileOps.newFile();
  }, [fileOps]);

  const handleNewFromTemplate = useCallback((_template: string) => {
    // Template loading will be wired in Task 7
  }, []);

  const handleOpen = useCallback(async () => {
    const text = await fileOps.openFile();
    if (text !== null) {
      // Loading text into editor will be wired when round-trip parsing is ready
      console.log("Opened file, length:", text.length);
    }
  }, [fileOps]);

  const handleSave = useCallback(() => {
    fileOps.saveFile(source);
  }, [fileOps, source]);

  const handleExportHtml = useCallback(() => {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${fileOps.fileName || "Document"}</title></head>
<body><pre>${source}</pre></body>
</html>`;
    fileOps.exportHtml(html);
  }, [fileOps, source]);

  const noop = useCallback(() => {}, []);

  const statusLabel = fileOps.fileName
    ? `${fileOps.fileName}${fileOps.isDirty ? " *" : ""}`
    : `Untitled${fileOps.isDirty ? " *" : ""}`;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <Toolbar
          onNew={handleNew}
          onNewFromTemplate={handleNewFromTemplate}
          onOpen={handleOpen}
          onSave={handleSave}
          onExportHtml={handleExportHtml}
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
        <span>{statusLabel}</span>
        <span>ClearNotation v0.1</span>
      </footer>
    </div>
  );
}
