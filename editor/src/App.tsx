import React from "react";
import "./app.css";

export default function App() {
  return (
    <div className="app-shell">
      <header className="toolbar">
        <span>ClearNotation</span>
      </header>

      <main className="main-content">
        <div style={{ flex: 1, padding: 24 }}>Visual editor placeholder</div>
        <div
          className="source-pane"
          style={{ flex: "0 0 40%", borderLeft: "1px solid var(--cn-border)" }}
        >
          <pre>Source pane placeholder</pre>
        </div>
      </main>

      <footer className="status-bar">
        <span>Untitled</span>
        <span>ClearNotation v0.1</span>
      </footer>
    </div>
  );
}
