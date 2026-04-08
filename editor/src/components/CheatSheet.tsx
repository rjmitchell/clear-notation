import React, { useRef, useEffect } from "react";
import { X } from "lucide-react";

interface CheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function CheatSheet({ open, onClose }: CheatSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus close button when opened
  useEffect(() => {
    if (open && closeRef.current) {
      closeRef.current.focus();
    }
  }, [open]);

  return (
    <aside
      className={`cheat-sheet${open ? " open" : ""}`}
      aria-label="ClearNotation syntax reference"
      aria-hidden={!open}
    >
      <div className="cheat-sheet-header">
        <h2 className="cheat-sheet-title">Syntax Reference</h2>
        <button
          ref={closeRef}
          className="toolbar-btn"
          onClick={onClose}
          aria-label="Close cheat sheet"
        >
          <X size={16} />
        </button>
      </div>

      <div className="cheat-sheet-body">
        <section>
          <h3>Inline Formatting</h3>
          <table>
            <tbody>
              <tr><td><code>+&#123;bold&#125;</code></td><td>Strong / bold</td></tr>
              <tr><td><code>*&#123;italic&#125;</code></td><td>Emphasis / italic</td></tr>
              <tr><td><code>`code`</code></td><td>Inline code</td></tr>
              <tr><td><code>[label -&gt; url]</code></td><td>Hyperlink</td></tr>
              <tr><td><code>^&#123;note text&#125;</code></td><td>Inline note</td></tr>
              <tr><td><code>::ref&#123;id&#125;</code></td><td>Cross-reference</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>Blocks</h3>
          <table>
            <tbody>
              <tr><td><code># Heading</code></td><td>Heading (1-6 levels)</td></tr>
              <tr><td><code>- item</code></td><td>Unordered list</td></tr>
              <tr><td><code>1. item</code></td><td>Ordered list</td></tr>
              <tr><td><code>&gt; quote</code></td><td>Block quote</td></tr>
              <tr><td><code>---</code></td><td>Horizontal rule</td></tr>
              <tr><td><code>```lang</code></td><td>Code fence (language required)</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>Directives</h3>
          <table>
            <tbody>
              <tr><td><code>::callout</code></td><td>Callout / admonition</td></tr>
              <tr><td><code>::table</code></td><td>Table block</td></tr>
              <tr><td><code>::math</code></td><td>Math block</td></tr>
              <tr><td><code>::toc</code></td><td>Table of contents</td></tr>
              <tr><td><code>::anchor</code></td><td>Named anchor</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>Keyboard Shortcuts</h3>
          <table>
            <tbody>
              <tr><td><kbd>Cmd+B</kbd></td><td>Bold</td></tr>
              <tr><td><kbd>Cmd+I</kbd></td><td>Italic</td></tr>
              <tr><td><kbd>Cmd+E</kbd></td><td>Inline code</td></tr>
              <tr><td><kbd>Cmd+S</kbd></td><td>Save</td></tr>
              <tr><td><kbd>Cmd+Shift+S</kbd></td><td>Export HTML</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </aside>
  );
}
