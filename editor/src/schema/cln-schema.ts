/**
 * clnSchema — the custom BlockNoteSchema used by VisualEditor.
 *
 * Composes:
 * - BlockNote's default block specs for non-addressable types
 *   (codeBlock, image, audio, video, file, table, toggleListItem, etc.).
 * - Five custom addressable block specs with anchorId prop
 *   (heading, paragraph, quote, bulletListItem, numberedListItem).
 * - BlockNote's default inline content specs (text, link).
 * - Two new custom inline content specs: clnNote and clnRef.
 *
 * Phase A scope. Phase B will extend with slash menu items + side-menu UI.
 */

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";

import { ClnNoteSpec } from "./inline-nodes/ClnNoteNode";
import { ClnRefSpec } from "./inline-nodes/ClnRefNode";
import { clnHeadingSpec } from "./block-specs/clnHeading";
import { clnParagraphSpec } from "./block-specs/clnParagraph";
import { clnBlockquoteSpec } from "./block-specs/clnBlockquote";
import { clnBulletListItemSpec } from "./block-specs/clnBulletListItem";
import { clnNumberedListItemSpec } from "./block-specs/clnNumberedListItem";

export const clnSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    heading: clnHeadingSpec,
    paragraph: clnParagraphSpec,
    quote: clnBlockquoteSpec,
    bulletListItem: clnBulletListItemSpec,
    numberedListItem: clnNumberedListItemSpec,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    clnNote: ClnNoteSpec,
    clnRef: ClnRefSpec,
  },
});
