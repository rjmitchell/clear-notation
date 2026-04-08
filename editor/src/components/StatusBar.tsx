import React from "react";

interface StatusBarProps {
  fileName: string | null;
  isDirty: boolean;
  syncing: boolean;
  wordCount: number;
}

export default function StatusBar({
  fileName,
  isDirty,
  syncing,
  wordCount,
}: StatusBarProps) {
  return (
    <footer className="status-bar" role="status">
      <span className="status-bar-left">
        {fileName || "Untitled"}
        {isDirty && <span className="status-dirty" aria-label="Unsaved changes"> *</span>}
      </span>
      <span className="status-bar-spacer" />
      {syncing && <span className="status-syncing">Syncing...</span>}
      <span className="status-wordcount">{wordCount} words</span>
      <span className="status-version">ClearNotation v0.1</span>
    </footer>
  );
}
