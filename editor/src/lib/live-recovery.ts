/**
 * Live-parse recovery module.
 *
 * Pre-processes source text before handing it to tree-sitter on the
 * editor's live-edit path (NOT on file load, NOT on save). The user's
 * actual source buffer is never mutated by this module — the normalized
 * string returned here is only used for the parse attempt, never written
 * back to the editor.
 *
 * Currently implements exactly one rule (append-newline). Additional
 * rules are deferred — see docs/superpowers/specs/2026-04-11-bidirectional-trust-design.md §6.
 */

export type AppliedRule = "append-newline";

/** Human-readable descriptions. Single source of truth for UI consumers. */
export const APPLIED_RULE_MESSAGES: Record<AppliedRule, string> = {
  "append-newline": "appended trailing newline",
};

export interface NormalizeResult {
  /** Source with recovery rules applied. Hand this to tree-sitter. */
  normalized: string;
  /** Rules that fired, in the order they were applied. */
  appliedRules: AppliedRule[];
}

/**
 * Append a trailing newline if missing. Pure, idempotent.
 *
 * This alone fixes the screenshot reproduction (typing `+{bold}` without
 * pressing Enter): tree-sitter's paragraph_line production requires a
 * _line_ending, so unterminated last lines fail parsing. Appending a
 * synthetic \n on the parse-side copy makes the grammar happy without
 * touching the user's buffer.
 */
export function normalizeForLiveParse(source: string): NormalizeResult {
  if (source.endsWith("\n")) {
    return { normalized: source, appliedRules: [] };
  }
  return { normalized: source + "\n", appliedRules: ["append-newline"] };
}
