import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "cn-split-position";
const DEFAULT_SPLIT = 60;
const MIN_PANE_PX = 200;

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
}

export default function SplitPane({ left, right }: SplitPaneProps) {
  const [splitPercent, setSplitPercent] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed) && parsed > 0 && parsed < 100) return parsed;
      }
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_SPLIT;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Persist split position
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(splitPercent));
    } catch {
      // ignore
    }
  }, [splitPercent]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const totalWidth = rect.width;

      // Clamp to min pane width
      const clampedX = Math.max(MIN_PANE_PX, Math.min(x, totalWidth - MIN_PANE_PX));
      const percent = (clampedX / totalWidth) * 100;
      setSplitPercent(percent);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane__left" style={{ width: `${splitPercent}%` }}>
        {left}
      </div>
      <div
        className="split-pane__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        tabIndex={0}
        onMouseDown={onMouseDown}
      />
      <div
        className="split-pane__right"
        style={{ width: `${100 - splitPercent}%` }}
      >
        {right}
      </div>
    </div>
  );
}
