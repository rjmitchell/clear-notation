import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  ChevronDown,
  Code,
  FileText,
  HelpCircle,
  Italic,
  Link,
  Moon,
  Sun,
} from "lucide-react";

export interface ToolbarProps {
  onNew: () => void;
  onNewFromTemplate: (template: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onExportHtml: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleCode: () => void;
  onInsertLink: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  cheatSheetOpen: boolean;
  onToggleCheatSheet: () => void;
}

const TEMPLATES = [
  { id: "prd", label: "PRD" },
  { id: "design-doc", label: "Design Doc" },
  { id: "meeting-notes", label: "Meeting Notes" },
];

export default function Toolbar({
  onNew,
  onNewFromTemplate,
  onOpen,
  onSave,
  onExportHtml,
  onToggleBold,
  onToggleItalic,
  onToggleCode,
  onInsertLink,
  darkMode,
  onToggleDarkMode,
  cheatSheetOpen,
  onToggleCheatSheet,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMenuItem = useCallback(
    (action: () => void) => {
      return () => {
        setMenuOpen(false);
        action();
      };
    },
    []
  );

  return (
    <>
      {/* File menu */}
      <div className="toolbar-dropdown" ref={dropdownRef}>
        <button
          className="toolbar-btn"
          onClick={toggleMenu}
          aria-label="File menu"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <FileText size={16} />
          File
          <ChevronDown size={14} />
        </button>

        {menuOpen && (
          <div className="template-menu" role="menu">
            <button
              className="template-menu-item"
              role="menuitem"
              onClick={handleMenuItem(onNew)}
            >
              New
            </button>

            <div className="template-submenu-label">New from template</div>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-menu-item"
                role="menuitem"
                onClick={handleMenuItem(() => onNewFromTemplate(t.id))}
                style={{ paddingLeft: 24 }}
              >
                {t.label}
              </button>
            ))}

            <div className="template-menu-separator" />

            <button
              className="template-menu-item"
              role="menuitem"
              onClick={handleMenuItem(onOpen)}
            >
              Open...
            </button>
            <button
              className="template-menu-item"
              role="menuitem"
              onClick={handleMenuItem(onSave)}
            >
              Save
            </button>
            <button
              className="template-menu-item"
              role="menuitem"
              onClick={handleMenuItem(onExportHtml)}
            >
              Export HTML
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      {/* Formatting buttons */}
      <button
        className="toolbar-btn"
        onClick={onToggleBold}
        title="Bold (Cmd+B)"
        aria-label="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        className="toolbar-btn"
        onClick={onToggleItalic}
        title="Italic (Cmd+I)"
        aria-label="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        className="toolbar-btn"
        onClick={onToggleCode}
        title="Code (Cmd+E)"
        aria-label="Code"
      >
        <Code size={16} />
      </button>
      <button
        className="toolbar-btn"
        onClick={onInsertLink}
        title="Link"
        aria-label="Link"
      >
        <Link size={16} />
      </button>

      {/* Spacer */}
      <div className="toolbar-spacer" />

      {/* Dark mode toggle */}
      <button
        className="toolbar-btn"
        onClick={onToggleDarkMode}
        title="Toggle dark mode"
        aria-label="Toggle dark mode"
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Cheat sheet toggle */}
      <button
        className={`toolbar-btn${cheatSheetOpen ? " active" : ""}`}
        onClick={onToggleCheatSheet}
        title="Cheat sheet"
        aria-label="Cheat sheet"
        aria-pressed={cheatSheetOpen}
      >
        <HelpCircle size={16} />
      </button>
    </>
  );
}
