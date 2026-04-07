/**
 * Utility functions for the ClearNotation JS normalizer/renderer.
 * These match the behavior of the Python reference implementation.
 */

/**
 * Generate a URL-friendly slug from text.
 *
 * Algorithm: NFKD normalize → lowercase → keep ASCII alphanumeric →
 * collapse non-alnum runs to a single dash → strip leading/trailing dashes.
 *
 * Matches Python `normalizer.py` `_slugify`.
 */
export function slugify(text: string): string {
  const normalized = text.normalize("NFKD").toLowerCase();
  const chars: string[] = [];
  let lastDash = false;
  for (const ch of normalized) {
    const code = ch.charCodeAt(0);
    // ASCII alphanumeric: 0-9 (48-57), a-z (97-122)
    if (code < 128 && ((code >= 48 && code <= 57) || (code >= 97 && code <= 122))) {
      chars.push(ch);
      lastDash = false;
    } else if (!lastDash) {
      chars.push("-");
      lastDash = true;
    }
  }
  // Strip leading/trailing dashes
  let start = 0;
  let end = chars.length;
  while (start < end && chars[start] === "-") start++;
  while (end > start && chars[end - 1] === "-") end--;
  return chars.slice(start, end).join("");
}

/**
 * Split a pipe-delimited table row into cell strings.
 *
 * Handles `\|` (escaped pipe) and `\\` (escaped backslash).
 * Unknown escape sequences are preserved as-is (backslash kept).
 *
 * Matches Python `utils.split_table_row`.
 */
export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  const current: string[] = [];
  let index = 0;
  while (index < line.length) {
    const ch = line[index];
    if (ch === "\\") {
      index++;
      if (index < line.length && (line[index] === "|" || line[index] === "\\")) {
        current.push(line[index]);
        index++;
        continue;
      }
      // Unknown escape: preserve the backslash
      current.push("\\");
      continue;
    }
    if (ch === "|") {
      cells.push(current.join("").trim());
      current.length = 0;
      index++;
      continue;
    }
    current.push(ch);
    index++;
  }
  cells.push(current.join("").trim());
  return cells;
}

/**
 * Escape text for safe inclusion in HTML.
 *
 * Escapes `& < > " '` — matches Python `html.escape(text, quote=True)`.
 */
export function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
