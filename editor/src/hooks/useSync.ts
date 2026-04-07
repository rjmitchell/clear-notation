import { useCallback, useRef, useState } from "react";
import type { BNBlock } from "../converter/types";
import { serializeDocument } from "../serializer";

/**
 * Hook that manages live sync between the visual editor and the source pane.
 *
 * Returns the current CLN source string, a syncing flag, and a callback
 * for the editor's onChange. The serialization is debounced at 300ms.
 */
export function useSync() {
  const [source, setSource] = useState("");
  const [syncing, setSyncing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDocumentChange = useCallback((blocks: BNBlock[]) => {
    setSyncing(true);

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const result = serializeDocument(blocks);
      setSource(result);
      setSyncing(false);
      timerRef.current = null;
    }, 300);
  }, []);

  return { source, syncing, onDocumentChange };
}
