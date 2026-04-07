/**
 * ClearNotation editor schema.
 *
 * This module combines:
 *   - Core block specs (headings, paragraphs, lists, code, meta)
 *   - Directive block specs (from the registry)
 *   - Inline mark specs (strong, emphasis, code, note, link, ref)
 *   - Slash menu items
 *
 * It is the single source of truth for the editor's block and inline model.
 */

export {
  CORE_BLOCK_SPECS,
  clnHeadingBlockSpec,
  clnParagraphBlockSpec,
  clnCodeBlockSpec,
  clnUnorderedListBlockSpec,
  clnOrderedListBlockSpec,
  clnBlockquoteBlockSpec,
  clnThematicBreakBlockSpec,
  clnMetaBlockSpec,
  type CLNBlockSpec,
  type CLNPropDef,
} from "./core-blocks";

export {
  DIRECTIVE_BLOCK_SPECS,
  buildDirectiveBlockSpec,
  buildAllDirectiveBlockSpecs,
  type CLNDirectiveBlockSpec,
} from "./directive-blocks";

export {
  CLN_INLINE_MARKS,
  INLINE_NESTING_WHITELIST,
  isNestingAllowed,
  type CLNInlineMark,
  type CLNInlineSyntax,
} from "./inline-marks";

export {
  SLASH_MENU_ITEMS,
  buildSlashMenuItems,
  type SlashMenuItem,
} from "./slash-menu";

export {
  loadRegistry,
  getBlockDirectives,
  getInlineDirectives,
  getParsedModeDirectives,
  getRawModeDirectives,
  getNoneModeDirectives,
  type Registry,
  type RegistryDirective,
  type RegistryAttribute,
} from "./registry-types";

// -- Unified lookups ----------------------------------------------------

import { CORE_BLOCK_SPECS, type CLNBlockSpec } from "./core-blocks";
import {
  DIRECTIVE_BLOCK_SPECS,
  type CLNDirectiveBlockSpec,
} from "./directive-blocks";

/** All block specs (core + directive), keyed by block type name. */
export const ALL_BLOCK_SPECS: Record<
  string,
  CLNBlockSpec | CLNDirectiveBlockSpec
> = {
  ...CORE_BLOCK_SPECS,
  ...DIRECTIVE_BLOCK_SPECS,
};

/** Look up a block spec by its type name (e.g., "clnHeading"). */
export function getBlockSpecByType(
  type: string
): CLNBlockSpec | CLNDirectiveBlockSpec | undefined {
  return ALL_BLOCK_SPECS[type];
}

/** Look up a directive block spec by its directive name (e.g., "callout"). */
export function getDirectiveSpecByName(
  directiveName: string
): CLNDirectiveBlockSpec | undefined {
  return Object.values(DIRECTIVE_BLOCK_SPECS).find(
    (spec) => spec.directiveName === directiveName
  );
}
