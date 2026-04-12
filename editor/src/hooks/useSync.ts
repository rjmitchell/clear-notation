import { useCallback, useRef, useState } from "react";
import type { BNBlock } from "../converter/types";
import { serializeDocument } from "../serializer";
import { parseSourceToBlocks, type SyncState } from "../lib/parse-source";
import { clnTextToBlockNoteBlocks } from "../lib/simple-cln-loader";

export type { SyncState } from "../lib/parse-source";

/**
 * Bidirectional sync hook.
 *
 * State machine:
 *   valid     — raw source parses cleanly
 *   recovered — raw source had errors, normalized version parses cleanly
 *   broken    — even the normalized version fails to parse
 *
 * Flow:
 *   Visual change → serialize → update source (CodeMirror syncs via prop)
 *   Source change → parse → convert → documentToLoad (VisualEditor replaces blocks)
 *
 * Async race guard:
 *   onSourceChange captures sourceGenRef BEFORE awaiting parse. After the
 *   await resolves, it compares the captured generation to the current one;
 *   if they differ, a newer onSourceChange has fired, so the stale result
 *   is discarded. This prevents older parses from silently overwriting
 *   newer source state during rapid typing. Critical because the recovered
 *   path does TWO tree-sitter parses, widening the race window.
 */
export function useSync() {
  const [source, setSourceState] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("valid");
  const [documentToLoad, setDocumentToLoad] = useState<BNBlock[] | null>(null);
  /** BlockNote-format blocks for direct loading (from simple CLN loader, no conversion needed). */
  const [blockNoteBlocksToLoad, setBlockNoteBlocksToLoad] = useState<any[] | null>(null);

  // Generation counters to detect and skip self-triggered updates,
  // plus to discard stale async parse results.
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
      setSyncState("valid");
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

    const myGen = ++sourceGenRef.current;
    activeGenRef.current = "source";
    setSourceState(text);
    setSyncing(true);

    if (sourceTimerRef.current !== null) {
      clearTimeout(sourceTimerRef.current);
    }

    sourceTimerRef.current = setTimeout(async () => {
      try {
        const result = await parseSourceToBlocks(text);
        // Async race guard — a newer onSourceChange has fired during the await
        if (myGen !== sourceGenRef.current) return;

        setSyncState(result.state);
        if (result.state === "valid" || result.state === "recovered") {
          setDocumentToLoad(result.blocks);
        }
        // On broken: keep the last documentToLoad so the visual pane
        // shows the last valid state (existing behavior).
      } catch (err) {
        if (myGen !== sourceGenRef.current) return;
        console.error("[useSync] source→visual parse failed:", err);
        setSyncState("broken");
      }
      setSyncing(false);
      sourceTimerRef.current = null;
    }, 300);
  }, []);

  /**
   * Set source directly and load into visual editor (for file open / template / restore).
   * Uses a lightweight line-based converter (no tree-sitter WASM needed).
   */
  const setSource = useCallback((text: string) => {
    setSourceState(text);
    // Any user-initiated setSource is a fresh starting point — always
    // reset sync state so previously-broken state doesn't leak into a
    // new file, template, or restored snapshot.
    setSyncState("valid");
    activeGenRef.current = null;

    if (!text.trim()) {
      // Empty text: signal VisualEditor to clear its content
      setBlockNoteBlocksToLoad([]);
      return;
    }

    // Convert CLN text to BlockNote blocks via simple line-based parser.
    // This handles headings, paragraphs, lists, code blocks without
    // needing the tree-sitter WASM worker. Directives are skipped.
    const bnBlocks = clnTextToBlockNoteBlocks(text);
    if (bnBlocks.length > 0) {
      setBlockNoteBlocksToLoad(bnBlocks);
    }
  }, []);

  /**
   * Called by VisualEditor after it has loaded the pending blocks.
   */
  const clearDocumentToLoad = useCallback(() => {
    setDocumentToLoad(null);
    setBlockNoteBlocksToLoad(null);
  }, []);

  return {
    source,
    setSource,
    syncing,
    syncState,
    onVisualChange,
    onSourceChange,
    documentToLoad,
    blockNoteBlocksToLoad,
    clearDocumentToLoad,
  };
}
