import React from "react";
import "./app.css";
import SplitPane from "./components/SplitPane";

export default function App() {
  return (
    <div className="app-shell">
      <header className="toolbar">
        <span>ClearNotation</span>
      </header>

      <main className="main-content">
        <SplitPane
          left={
            <div className="visual-editor">Visual editor placeholder</div>
          }
          right={
            <div className="source-pane">
              <pre>Source pane placeholder</pre>
            </div>
          }
        />
      </main>

      <footer className="status-bar">
        <span>Untitled</span>
        <span>ClearNotation v0.1</span>
      </footer>
    </div>
  );
}
