/**
 * Document serializer: converts a complete BlockNote document (array of
 * blocks) back to ClearNotation source text.
 *
 * Rules:
 *   - Blocks are separated by blank lines (\n\n)
 *   - EXCEPTION: consecutive list items of the same type use single newlines
 *   - Trailing newline at end of non-empty documents
 *   - Empty blocks array → ""
 */

import type { BNBlock } from "../converter/types";
import { serializeBlock } from "./block-serializer";

/** List block types that should be joined with single newlines. */
const LIST_TYPES = new Set(["clnUnorderedList", "clnOrderedList"]);

/**
 * Serialize a full BlockNote document to ClearNotation source text.
 */
export function serializeDocument(blocks: BNBlock[]): string {
  if (blocks.length === 0) return "";

  const parts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const serialized = serializeBlock(blocks[i]);
    parts.push(serialized);

    // Add separator between blocks (not after the last one)
    if (i < blocks.length - 1) {
      const current = blocks[i];
      const next = blocks[i + 1];

      // Consecutive list items of the same type: single newline
      if (
        LIST_TYPES.has(current.type) &&
        current.type === next.type
      ) {
        parts.push("\n");
      } else {
        parts.push("\n\n");
      }
    }
  }

  return parts.join("") + "\n";
}
