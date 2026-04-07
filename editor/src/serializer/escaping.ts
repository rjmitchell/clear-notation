/**
 * Escaping utilities for ClearNotation serialization.
 *
 * Three escaping domains:
 *   1. Inline content — characters with syntactic meaning in inline text
 *   2. Attribute strings — inside quoted attribute values
 *   3. Table cells — inside table cell content
 */

// ═══════════════════════════════════════════════════════════════════
// Inline content escaping
// ═══════════════════════════════════════════════════════════════════

/**
 * Escape characters with syntactic meaning in ClearNotation inline content.
 *
 * Two-char sequences (+{, *{, ^{, ::) are escaped by prefixing the first
 * char with a backslash. Single special chars ({, }, [, ], \, `) are
 * each prefixed with a backslash.
 *
 * Uses character-by-character scanning so two-char sequences are matched
 * before their constituent single chars.
 */
export function escapeInline(text: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for two-char sequences first
    if (i + 1 < text.length) {
      const twoChar = text[i] + text[i + 1];
      if (twoChar === "+{" || twoChar === "*{" || twoChar === "^{" || twoChar === "::") {
        result.push("\\", twoChar);
        i += 2;
        continue;
      }
    }

    const ch = text[i];
    if (ch === "\\" || ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "`") {
      result.push("\\", ch);
    } else {
      result.push(ch);
    }
    i++;
  }

  return result.join("");
}

/**
 * Unescape inline content: inverse of escapeInline.
 * Removes the leading backslash from escape sequences.
 */
export function unescapeInline(text: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      // Check for escaped two-char sequences: \+{ \*{ \^{ \::
      if (i + 2 < text.length) {
        const threeChar = text[i + 1] + text[i + 2];
        if (threeChar === "+{" || threeChar === "*{" || threeChar === "^{" || threeChar === "::") {
          result.push(threeChar);
          i += 3;
          continue;
        }
      }
      // Single-char escape sequences
      const next = text[i + 1];
      if (next === "\\" || next === "{" || next === "}" || next === "[" || next === "]" || next === "`") {
        result.push(next);
        i += 2;
        continue;
      }
    }
    result.push(text[i]);
    i++;
  }

  return result.join("");
}

// ═══════════════════════════════════════════════════════════════════
// Attribute string escaping
// ═══════════════════════════════════════════════════════════════════

/**
 * Escape characters inside a quoted attribute value.
 * Handles: \ → \\, " → \", newline → \n, tab → \t
 */
export function escapeAttribute(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

// ═══════════════════════════════════════════════════════════════════
// Table cell escaping
// ═══════════════════════════════════════════════════════════════════

/**
 * Escape characters inside a table cell.
 * Handles: \ → \\, | → \|
 */
export function escapeTableCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}
