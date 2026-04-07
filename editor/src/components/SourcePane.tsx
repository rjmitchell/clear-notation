import React, { useEffect, useRef, useState } from "react";

interface SourcePaneProps {
  source: string;
  syncing?: boolean;
}

/**
 * Read-only source pane that displays ClearNotation source text.
 * Highlights lines that changed compared to the previous render,
 * removing the highlight after 600ms.
 */
export default function SourcePane({ source, syncing }: SourcePaneProps) {
  const prevLinesRef = useRef<string[]>([]);
  const [changedIndices, setChangedIndices] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = source.split("\n");

  useEffect(() => {
    const prevLines = prevLinesRef.current;
    const changed = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== prevLines[i]) {
        changed.add(i);
      }
    }
    // Lines that were removed (prevLines longer) don't need highlighting

    prevLinesRef.current = lines;

    if (changed.size > 0) {
      setChangedIndices(changed);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setChangedIndices(new Set());
        timerRef.current = null;
      }, 600);
    }
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="source-pane">
      <pre>
        {lines.map((line, i) => (
          <span
            key={i}
            className={`line${changedIndices.has(i) ? " line-changed" : ""}`}
          >
            {line}
            {i < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </pre>
    </div>
  );
}
