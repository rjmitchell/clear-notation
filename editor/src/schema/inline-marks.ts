/**
 * ClearNotation inline mark specifications for TipTap (via BlockNote).
 *
 * ClearNotation inline constructs:
 *   +{strong}      -> <strong>
 *   *{emphasis}    -> <em>
 *   `code`         -> <code>
 *   ^{note}        -> <sup> (footnote marker)
 *   [label -> url] -> <a href="url">
 *   ::ref[target]  -> <a href="#target"> (cross-reference)
 *
 * Nesting rules (whitelist approach):
 *   - strong/emphasis ONLY allow code_span inside them
 *   - code allows NO nesting (atomic)
 *   - note allows strong, emphasis, code, link, ref
 *   - link label allows strong, emphasis, code
 *   - ref allows NO nesting (atomic)
 */

/** Syntax description for a ClearNotation inline construct. */
export interface CLNInlineSyntax {
  /** Opening delimiter. */
  open: string;
  /** Closing delimiter. */
  close: string;
  /** Separator between parts (only for link: " -> "). */
  separator?: string;
}

/** Specification for a ClearNotation inline mark. */
export interface CLNInlineMark {
  /** TipTap mark name. */
  name: string;
  /** ClearNotation syntax delimiters. */
  clnSyntax: CLNInlineSyntax;
  /** HTML tag to render as. */
  tag: string;
  /** Attribute names this mark carries (e.g., "href" for links). */
  attrs: string[];
  /** Whether this mark's content is parsed (false = atomic like code). */
  contentParsed: boolean;
}

export const CLN_INLINE_MARKS: Record<string, CLNInlineMark> = {
  clnStrong: {
    name: "clnStrong",
    clnSyntax: { open: "+{", close: "}" },
    tag: "strong",
    attrs: [],
    contentParsed: true,
  },
  clnEmphasis: {
    name: "clnEmphasis",
    clnSyntax: { open: "*{", close: "}" },
    tag: "em",
    attrs: [],
    contentParsed: true,
  },
  clnCode: {
    name: "clnCode",
    clnSyntax: { open: "`", close: "`" },
    tag: "code",
    attrs: [],
    contentParsed: false,
  },
  clnNote: {
    name: "clnNote",
    clnSyntax: { open: "^{", close: "}" },
    tag: "sup",
    attrs: [],
    contentParsed: true,
  },
  clnLink: {
    name: "clnLink",
    clnSyntax: { open: "[", close: "]", separator: " -> " },
    tag: "a",
    attrs: ["href"],
    contentParsed: true,
  },
  clnRef: {
    name: "clnRef",
    clnSyntax: { open: "::ref[", close: "]" },
    tag: "a",
    attrs: ["target"],
    contentParsed: false,
  },
};

/**
 * Whitelist of which marks can appear inside which other marks.
 *
 * This is the ClearNotation nesting rule: strong/emphasis ONLY allow
 * code_span inside them. Notes are more permissive. Code and ref are atomic.
 */
export const INLINE_NESTING_WHITELIST: Record<string, string[]> = {
  clnStrong: ["clnCode"],
  clnEmphasis: ["clnCode"],
  clnCode: [],
  clnNote: ["clnStrong", "clnEmphasis", "clnCode", "clnLink", "clnRef"],
  clnLink: ["clnStrong", "clnEmphasis", "clnCode"],
  clnRef: [],
};

/**
 * Check if a child mark is allowed inside a parent mark.
 */
export function isNestingAllowed(
  parentMark: string,
  childMark: string
): boolean {
  const allowed = INLINE_NESTING_WHITELIST[parentMark];
  if (!allowed) return false;
  return allowed.includes(childMark);
}
