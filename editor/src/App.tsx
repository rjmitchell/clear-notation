import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import "./app.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import Toolbar from "./components/Toolbar";
import { useSync } from "./hooks/useSync";
import { useFileOps } from "./hooks/useFileOps";
import { useDarkMode } from "./hooks/useDarkMode";

export default function App() {
  const { source, syncing, onDocumentChange } = useSync();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useDarkMode();
  const editorRef = useRef<BlockNoteEditor | null>(null);

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

  // Formatting handlers that use the BlockNote editor API
  const handleToggleBold = useCallback(() => {
    editorRef.current?.toggleStyles({ bold: true });
  }, []);

  const handleToggleItalic = useCallback(() => {
    editorRef.current?.toggleStyles({ italic: true });
  }, []);

  const handleToggleCode = useCallback(() => {
    editorRef.current?.toggleStyles({ code: true });
  }, []);

  const handleInsertLink = useCallback(() => {
    // Link insertion requires a URL dialog; stub for now
    const url = prompt("Enter URL:");
    if (url && editorRef.current) {
      editorRef.current.createLink(url);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        handleExportHtml();
      } else if (e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "e" && !e.shiftKey) {
        e.preventDefault();
        handleToggleCode();
      }
      // Cmd+B and Cmd+I are handled natively by BlockNote,
      // but the toolbar buttons also call toggleStyles for consistency
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleExportHtml, handleToggleCode]);

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
          onToggleBold={handleToggleBold}
          onToggleItalic={handleToggleItalic}
          onToggleCode={handleToggleCode}
          onInsertLink={handleInsertLink}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          cheatSheetOpen={cheatSheetOpen}
          onToggleCheatSheet={() => setCheatSheetOpen((o) => !o)}
        />
      </header>

      <main className="main-content">
        <SplitPane
          left={
            <VisualEditor
              onDocumentChange={handleChange}
              editorRef={editorRef}
              darkMode={darkMode}
            />
          }
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
