import { useCallback, useRef, useState } from "react";
import type { BNBlock } from "../converter/types";
import { serializeDocument } from "../serializer";
import { parseSourceToBlocks } from "../lib/parse-source";

/**
 * Bidirectional sync hook.
 *
 * Manages the source text and coordinates sync between the visual
 * editor and the CodeMirror source pane. Uses generation counters
 * and an activeGen flag to prevent feedback loops. Both directions
 * are debounced at 300ms.
 *
 * Flow:
 *   Visual change → serialize → update source (CodeMirror syncs via prop)
 *   Source change → parse → convert → documentToLoad (VisualEditor replaces blocks)
 */
export function useSync() {
  const [source, setSourceState] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [parseError, setParseError] = useState(false);
  const [documentToLoad, setDocumentToLoad] = useState<BNBlock[] | null>(null);

  // Generation counters to detect and skip self-triggered updates
  const visualGenRef = useRef(0);
  const sourceGenRef = useRef(0);
  const activeGenRef = useRef<"visual" | "source" | null>(null);

  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Called when the visual editor content changes.
   * Debounces and serializes to CLN source.
   */
  const onVisualChange = useCallback((blocks: BNBlock[]) => {
    visualGenRef.current++;
    activeGenRef.current = "visual";
    setSyncing(true);

    if (visualTimerRef.current !== null) {
      clearTimeout(visualTimerRef.current);
    }

    visualTimerRef.current = setTimeout(() => {
      const result = serializeDocument(blocks);
      setSourceState(result);
      setSyncing(false);
      setParseError(false);
      visualTimerRef.current = null;
    }, 300);
  }, []);

  /**
   * Called when the CodeMirror source pane content changes.
   * Skipped if the change originated from visual→source sync.
   * Debounces and parses to BNBlocks for the visual editor.
   */
  const onSourceChange = useCallback((text: string) => {
    // Skip our own visual→source sync update
    if (activeGenRef.current === "visual") {
      activeGenRef.current = null;
      return;
    }

    sourceGenRef.current++;
    activeGenRef.current = "source";
    setSourceState(text);
    setSyncing(true);

    if (sourceTimerRef.current !== null) {
      clearTimeout(sourceTimerRef.current);
    }

    sourceTimerRef.current = setTimeout(async () => {
      try {
        const blocks = await parseSourceToBlocks(text);
        if (blocks === null) {
          // Parse error: keep visual editor on last valid state
          setParseError(true);
        } else {
          setParseError(false);
          setDocumentToLoad(blocks);
        }
      } catch {
        setParseError(true);
      }
      setSyncing(false);
      sourceTimerRef.current = null;
    }, 300);
  }, []);

  /**
   * Set source directly without triggering sync (for file open / template).
   */
  const setSource = useCallback((text: string) => {
    setSourceState(text);
    activeGenRef.current = null;
  }, []);

  /**
   * Called by VisualEditor after it has loaded the pending blocks.
   */
  const clearDocumentToLoad = useCallback(() => {
    setDocumentToLoad(null);
  }, []);

  return {
    source,
    setSource,
    syncing,
    parseError,
    onVisualChange,
    onSourceChange,
    documentToLoad,
    clearDocumentToLoad,
  };
}
