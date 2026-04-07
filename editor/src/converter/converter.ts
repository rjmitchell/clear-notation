/**
 * Document converter: walks a full CST document and produces BNBlock[].
 *
 * This is the top-level entry point for CST → BlockNote conversion.
 * It delegates each block-level child to convertBlock and flattens
 * the results (since convertBlock can return multiple blocks for lists).
 */

import type { CSTNode } from "../parser/types";
import type { BNBlock, ConvertOptions } from "./types";
import { convertBlock } from "./block-converter";

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

  for (const child of cst.children) {
    // Skip BOM and unnamed/anonymous nodes
    if (SKIP_TYPES.has(child.type) || !child.isNamed) {
      continue;
    }

    const result = await convertBlock(child, options);
    blocks.push(...result);
  }

  return blocks;
}
