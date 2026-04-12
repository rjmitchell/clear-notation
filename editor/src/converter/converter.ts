/**
 * Document converter: walks a full CST document and produces BNBlock[].
 *
 * This is the top-level entry point for CST → BlockNote conversion.
 * It delegates each block-level child to convertBlock and flattens
 * the results (since convertBlock can return multiple blocks for lists).
 *
 * Anchor fold (spec §3.7): a `::anchor[id="x"]` directive does not produce
 * its own block. Instead, it's buffered as a pending anchor id and attached
 * to the next addressable block's anchorId prop.
 */

import type { CSTNode } from "../parser/types";
import type { BNBlock, ConvertOptions } from "./types";
import { convertBlock, isAddressable } from "./block-converter";
import { getDirectiveName, getAttributeMap } from "../parser/cst-utils";

/** Node types to skip when walking document children. */
const SKIP_TYPES = new Set(["bom"]);

/**
 * Convert a full document CST to an array of BNBlocks.
 */
export async function convertDocument(
  cst: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock[]> {
  const blocks: BNBlock[] = [];
  let pendingAnchor: string | null = null;

  for (const child of cst.children) {
    // Skip BOM and unnamed/anonymous nodes
    if (SKIP_TYPES.has(child.type) || !child.isNamed) {
      continue;
    }

    // Self-closing anchor directives set pendingAnchor and don't emit a block.
    if (
      child.type === "block_directive_self_closing" &&
      getDirectiveName(child) === "anchor"
    ) {
      const attrs = getAttributeMap(child);
      const id = attrs.id;
      const newId = typeof id === "string" && id.length > 0 ? id : null;

      if (newId === null) {
        console.warn(
          "[convertDocument] Anchor directive with no valid id, skipping"
        );
        continue;
      }

      if (pendingAnchor !== null) {
        // Two consecutive anchors with no addressable block between them.
        // Tree-sitter does NOT report this as hasError (syntactically valid),
        // so Design 1's syncState broken does not surface it. First wins.
        console.warn(
          "[convertDocument] Dropping duplicate anchor before addressable block:",
          newId
        );
        continue;
      }

      pendingAnchor = newId;
      continue;
    }

    // Regular block conversion.
    const result = await convertBlock(child, options);

    // Fold: if we have a pending anchor and the first block in the result
    // is addressable, attach the anchor id to it.
    if (
      pendingAnchor !== null &&
      result.length > 0 &&
      isAddressable(result[0])
    ) {
      result[0].props = { ...result[0].props, anchorId: pendingAnchor };
      pendingAnchor = null;
    }
    // Note: if the first block is not addressable (comment, thematic break),
    // pendingAnchor persists and the next addressable block absorbs it.

    blocks.push(...result);
  }

  if (pendingAnchor !== null) {
    console.warn(
      "[convertDocument] Dropping dangling anchor at end of document:",
      pendingAnchor
    );
  }

  return blocks;
}
