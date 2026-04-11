import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import "./app.css";
import SplitPane from "./components/SplitPane";
import VisualEditor from "./components/VisualEditor";
import SourcePane from "./components/SourcePane";
import Toolbar from "./components/Toolbar";
import WelcomeOverlay from "./components/WelcomeOverlay";
import CheatSheet from "./components/CheatSheet";
import StatusBar from "./components/StatusBar";
import { useSync } from "./hooks/useSync";
import { useFileOps } from "./hooks/useFileOps";
import { useDarkMode } from "./hooks/useDarkMode";
import { useMarkdownPaste } from "./hooks/useMarkdownPaste";

import prdTemplate from "./templates/prd.cln?raw";
import designDocTemplate from "./templates/design-doc.cln?raw";
import meetingNotesTemplate from "./templates/meeting-notes.cln?raw";

const TEMPLATES: Record<string, string> = {
  prd: prdTemplate,
  "design-doc": designDocTemplate,
  "meeting-notes": meetingNotesTemplate,
};

export default function App() {
  const {
    source,
    setSource,
    syncing,
    syncState,
    onVisualChange,
    onSourceChange,
    documentToLoad,
    clearDocumentToLoad,
    blockNoteBlocksToLoad,
  } = useSync();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const { darkMode, toggleDarkMode } = useDarkMode();
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const fileOps = useFileOps({
    getCurrentSource: () => source,
  });

  // Wire markdown paste on the main editor container
  useMarkdownPaste(mainRef);

  const handleChange = useCallback(
    (blocks: Parameters<typeof onVisualChange>[0]) => {
      onVisualChange(blocks);
      fileOps.markDirty();
      // Once the user starts editing, dismiss welcome
      if (showWelcome) setShowWelcome(false);
    },
    [onVisualChange, fileOps, showWelcome]
  );

  const handleNew = useCallback(() => {
    fileOps.newFile();
    setSource("");
    setShowWelcome(false);
  }, [fileOps, setSource]);

  const handleNewFromTemplate = useCallback(
    (templateId: string) => {
      const text = TEMPLATES[templateId];
      if (text) {
        fileOps.newFile();
        setSource(text);
        setShowWelcome(false);
      }
    },
    [fileOps, setSource]
  );

  const handleOpen = useCallback(async () => {
    const text = await fileOps.openFile();
    if (text !== null) {
      setSource(text);
      setShowWelcome(false);
    }
  }, [fileOps, setSource]);

  const handleRestore = useCallback(() => {
    const saved = fileOps.loadAutosave();
    if (saved) {
      setSource(saved);
      setShowWelcome(false);
    }
  }, [fileOps, setSource]);

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
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleExportHtml, handleToggleCode]);

  const wordCount = useMemo(() => {
    return source.split(/\s+/).filter((w) => w).length;
  }, [source]);

  // Check if autosave exists for restore button
  const hasAutosave = useMemo(() => {
    try {
      return localStorage.getItem("cn-autosave") !== null;
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-editor" className="skip-link">
        Skip to editor
      </a>

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

      <main className="main-content" ref={mainRef}>
        {showWelcome && !source ? (
          <WelcomeOverlay
            onNew={handleNew}
            onOpen={handleOpen}
            onRestore={hasAutosave ? handleRestore : null}
            onTemplate={handleNewFromTemplate}
          />
        ) : (
          <SplitPane
            left={
              <div id="main-editor">
                <VisualEditor
                  onDocumentChange={handleChange}
                  editorRef={editorRef}
                  darkMode={darkMode}
                  documentToLoad={documentToLoad}
                  blockNoteBlocksToLoad={blockNoteBlocksToLoad}
                  onDocumentLoaded={clearDocumentToLoad}
                  syncState={syncState}
                />
              </div>
            }
            right={
              <SourcePane
                source={source}
                onSourceChange={onSourceChange}
                syncing={syncing}
                syncState={syncState}
              />
            }
          />
        )}
      </main>

      <CheatSheet
        open={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />

      <StatusBar
        fileName={fileOps.fileName}
        isDirty={fileOps.isDirty}
        syncing={syncing}
        wordCount={wordCount}
      />
    </div>
  );
}
