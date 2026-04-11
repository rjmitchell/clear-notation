/**
 * Inline serializer: converts BlockNote inline content back to
 * ClearNotation inline syntax.
 *
 * BlockNote stores inline content as a flat array of styled text spans
 * and links. ClearNotation uses nested delimiters (+{...}, *{...}, etc.).
 * This module reconstructs the nesting from the flat representation.
 */

import type { BNInlineContent, BNStyledText, BNLink } from "../converter/types";
import { escapeInline } from "./escaping";

/**
 * Mark priority order (outermost first).
 * Higher-priority marks wrap lower-priority ones.
 */
const MARK_PRIORITY: string[] = [
  "clnNote",
  "clnStrong",
  "clnEmphasis",
  "clnCode",
  "clnRef",
];

/** Opening/closing delimiters for each mark type. */
const MARK_DELIMITERS: Record<string, [string, string]> = {
  clnStrong: ["+{", "}"],
  clnEmphasis: ["*{", "}"],
  clnCode: ["`", "`"],
  clnNote: ["^{", "}"],
};

/**
 * Serialize an array of BlockNote inline content items to ClearNotation
 * inline syntax.
 */
export function serializeInline(content: BNInlineContent[]): string {
  if (content.length === 0) return "";
  return serializeItems(content);
}

/**
 * Recursively serialize a list of inline items, handling mark nesting.
 */
function serializeItems(items: BNInlineContent[]): string {
  const result: string[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    if (item.type === "link") {
      result.push(serializeLink(item));
      i++;
      continue;
    }

    // BNNote and BNRef handling is wired up in later Phase A tasks.
    // The converter does not emit these variants yet, so this branch
    // is unreachable at runtime today — it exists only to narrow the
    // union so the remaining code can treat `item` as BNStyledText.
    if (item.type === "note" || item.type === "ref") {
      i++;
      continue;
    }

    // Text item — check for clnRef style (special: emits a directive)
    if (typeof item.styles.clnRef === "string" && item.styles.clnRef) {
      result.push(`::ref[target="${item.styles.clnRef}"]`);
      i++;
      continue;
    }

    // Find the highest-priority active mark on this text item
    const activeMark = findHighestPriorityMark(item);

    if (!activeMark) {
      // Plain text — escape and emit
      result.push(escapeInline(item.text));
      i++;
      continue;
    }

    // Group consecutive items that share this mark
    const group: BNStyledText[] = [item];
    let j = i + 1;
    while (j < items.length) {
      const next = items[j];
      if (next.type !== "text") break;
      if (!hasActiveMark(next, activeMark)) break;
      group.push(next);
      j++;
    }

    // Emit opening delimiter, recurse with mark removed, emit closing delimiter
    const [open, close] = MARK_DELIMITERS[activeMark];
    const stripped = group.map((item) => stripMark(item, activeMark));
    result.push(open + serializeItems(stripped) + close);

    i = j;
  }

  return result.join("");
}

/**
 * Find the highest-priority mark that is active on a styled text item.
 * Returns undefined if no marks are active.
 */
function findHighestPriorityMark(item: BNStyledText): string | undefined {
  for (const mark of MARK_PRIORITY) {
    if (hasActiveMark(item, mark)) {
      return mark;
    }
  }
  return undefined;
}

/**
 * Check if a styled text item has a particular mark active.
 */
function hasActiveMark(item: BNStyledText, mark: string): boolean {
  const value = item.styles[mark];
  return value === true || (typeof value === "string" && value !== "");
}

/**
 * Create a copy of a styled text item with a specific mark removed.
 */
function stripMark(item: BNStyledText, mark: string): BNStyledText {
  const newStyles = { ...item.styles };
  delete newStyles[mark];
  return { ...item, styles: newStyles };
}

/**
 * Serialize a link item: [label -> href]
 */
function serializeLink(link: BNLink): string {
  const label = serializeItems(link.content);
  return `[${label} -> ${link.href}]`;
}
