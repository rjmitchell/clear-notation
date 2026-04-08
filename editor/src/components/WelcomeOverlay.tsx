import React from "react";
import { FileText, FolderOpen, RotateCcw } from "lucide-react";

interface WelcomeOverlayProps {
  onNew: () => void;
  onOpen: () => void;
  onRestore: (() => void) | null;
  onTemplate: (id: string) => void;
}

const TEMPLATES = [
  { id: "prd", label: "PRD", description: "Product Requirements Document" },
  { id: "design-doc", label: "Design Doc", description: "Architecture & design decisions" },
  { id: "meeting-notes", label: "Meeting Notes", description: "Attendees, agenda, action items" },
];

export default function WelcomeOverlay({
  onNew,
  onOpen,
  onRestore,
  onTemplate,
}: WelcomeOverlayProps) {
  return (
    <div className="welcome-overlay">
      <div className="welcome-content">
        <h1 className="welcome-title">ClearNotation Editor</h1>
        <p className="welcome-description">
          A visual editor for ClearNotation technical documentation
        </p>

        <div className="welcome-actions">
          <button className="btn-primary" onClick={onNew}>
            <FileText size={18} />
            New Document
          </button>
          <button className="btn-secondary" onClick={onOpen}>
            <FolderOpen size={18} />
            Open File
          </button>
          {onRestore && (
            <button className="btn-secondary" onClick={onRestore}>
              <RotateCcw size={18} />
              Restore last session
            </button>
          )}
        </div>

        <div className="welcome-templates">
          <h2 className="welcome-templates-heading">Start from a template</h2>
          <div className="welcome-template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="welcome-template-card"
                onClick={() => onTemplate(t.id)}
              >
                <span className="welcome-template-label">{t.label}</span>
                <span className="welcome-template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
