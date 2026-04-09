# ClearNotation v0.1 Syntax Decisions

This note freezes the remaining syntax choices that the v0.1 grammar depends on. It keeps the handoff baseline intact: readable-hybrid authoring, no inline HTML, inline-only notes, explicit directive blocks, trusted typed extensions in `clearnotation.toml`, and fail-closed behavior.

## Frozen v0.1 choices

- Canonical document extension: `.cln`
- Primary normative output target: HTML
- Secondary target status: PDF is supported, but only semantically conforming against the normalized AST; page layout is non-normative in v0.1
- Inline emphasis forms stay as `+{...}` and `*{...}`
- Directives remain explicit `::name[...]` forms, with bodies opened by `{` and closed by a line whose left-trimmed content is exactly `}`
- `::meta{...}` is reserved core preamble syntax, not an extension-defined directive

The grammar intentionally chooses a slightly smaller feature set for v0.1 to keep the syntax fully specified and predictably parsable.

## Why keep `+{}` and `*{}`

They still fit the design better than Markdown-style delimiter runs:

- `+{}` and `*{}` have one opener each, so there is no `*`/`**` ambiguity family
- the `{` makes accidental matches much rarer in technical prose
- they remain short enough for docs-first writing
- the forms are distinct from HTML-derived names without introducing heavy directive syntax

To reduce accidental parsing in code-like prose, `+{`, `*{`, `^{`, and inline `::name[...]` are recognized only at valid inline boundaries. In prose terms: they must either start the inline sequence or follow a non-alphanumeric character.

## Parser model

The parser is parameterized by the trusted directive registry from `clearnotation.toml`. Parsing does not execute extensions or renderer logic. The registry only contributes static facts needed before parsing:

- directive `name`
- `placement = "block" | "inline"`
- `body_mode = "none" | "parsed" | "raw"`

`::meta{...}` is the one reserved exception. It is part of the core document grammar and is parsed before general directive lookup.

Everything else stays outside parse:

- attribute schema validation
- include policy checks
- reference resolution
- ID generation and collision handling
- transform/render behavior

This keeps the pipeline aligned with the handoff while still making directive parsing deterministic.

## Inline rules

The inline model is intentionally acyclic.

- Paragraphs, headings, blockquotes, list items, and parsed table cells accept text, code spans, strong, emphasis, links, notes, and inline directives.
- Strong and emphasis bodies accept only plain text, escapes, and code spans.
- Link labels accept plain text, escapes, code spans, strong, and emphasis.
- Notes accept plain text, escapes, code spans, strong, emphasis, links, and inline directives.
- Notes may not nest inside notes.
- Links may not nest inside links.

When a context does not permit a construct, its opener is not treated as ordinary text. Authors must escape it. For example, a literal `[` inside strong text is written as `\[` and a literal `^{` inside a note is written as `\^{`.

This preserves useful authoring patterns like `[+{API} reference -> /api]` and `^{See [the guide -> /guide]}` without enabling open-ended recursive inline combinations.

Link targets are deliberately simpler than link labels.

- A link target is a non-empty opaque string after the separator ` -> `
- Unescaped ASCII spaces or tabs are not allowed in link targets
- `\]` escapes a literal closing bracket in the target
- `\\` escapes a literal backslash in the target
- Internal document references should prefer `::ref[target="..."]` rather than overloading link-target syntax

## Escaping

Escapes are recognized only in parsed text and in quoted strings. Raw directive bodies and fenced code bodies do not interpret general escapes.

Parsed-text escapes are:

- `\\`
- `\{`
- `\}`
- `\[`
- `\]`
- ``\` ``
- `\+`
- `\*`
- `\^`
- `\:`
- `\>`
- `\-`
- `\#`

Quoted strings use a smaller escape set:

- `\\`
- `\"`
- `\n`
- `\r`
- `\t`

Any other escape sequence is a parse error.

## `::meta` syntax

`::meta{ ... }` is the only document-level metadata block in v0.1.

- It must be the first nonblank block in the file if present.
- Its body is a restricted TOML-like subset, not general TOML.
- Each nonblank line is exactly `key = value`.
- Keys are lowercase identifiers with optional dotted segments, like `title` or `page.lang`.
- Values may be strings, integers, booleans, or flat arrays of those scalar values.
- Comments, multiline strings, inline tables, dates, and floats are not part of v0.1 `::meta`.
- If `title` is absent, the document title defaults to the first level-1 heading.

Example:

```text
::meta{
title = "ClearNotation"
authors = ["Three Raccoons in a Trenchcoat", "Core Team"]
draft = true
page.lang = "en"
}
```

## Directive attributes

Directive attributes use the same scalar and array literal grammar as `::meta`, but inline:

```text
::callout[kind="warning", compact=false]{
Read this first.
}
```

Rules:

- Attribute names are lowercase identifiers
- Strings must use double quotes
- Booleans are `true` or `false`
- Integers are base-10 only
- Arrays are flat arrays of scalar values
- Nested arrays and object literals are not part of v0.1

This replaces stringly packed values such as `align="left,right"` with typed values like `align=["left", "right"]`.

## Built-in directive signatures

These are the intended built-in v0.1 signatures. `meta` is core syntax; the remaining entries belong to the compiler's core trusted registry and may be extended, but not redefined, by project config:

- `meta`: reserved core preamble block with dedicated grammar
- `toc`: block, none
- `ref`: inline, none
- `anchor`: block, none
- `include`: block, none
- `callout`: block, parsed
- `figure`: block, parsed
- `math`: block, raw
- `table`: block, raw
- `source`: block, raw

`::ref[target="..."]` is therefore explicitly part of the inline grammar in v0.1, while `::anchor[id="..."]` remains a block directive that attaches to the next addressable block.

The v0.1 set of addressable blocks is frozen in [clearnotation-v0.1-ast-conformance.md](/Users/ryan/projects/clear-notation/clearnotation-v0.1-ast-conformance.md).

The built-in attribute schemas and defaults are frozen in [clearnotation-v0.1-config.md](/Users/ryan/projects/clear-notation/clearnotation-v0.1-config.md).

## Directive block closing

For parsed and raw directive bodies, a line whose left-trimmed content is exactly `}` closes the body.

- This is a syntactic rule, not a semantic hint
- In parsed bodies, a literal standalone `}` line must be rewritten, for example as `\}`
- In raw bodies, a literal standalone `}` line is not directly representable in v0.1 and must be rewritten or split

This constraint is deliberate. It keeps directive blocks indentation-insensitive and easy to detect with a single-line closer.

## Comments

Comments use the `//` prefix. ClearNotation supports both block-level and inline comments.

### Block comments

Block comments are lines whose left-trimmed content starts with `//`.

```text
// This is a comment.
//This is also valid (no space required).
//

# Heading after a comment
```

Rules:

- A comment is a line whose left-trimmed content starts with `//`
- Comments are recognized between blocks and inside parsed directive bodies (`::callout`, `::figure`)
- Comments are NOT recognized inside raw directive bodies (`::math`, `::table`, `::source`), fenced code blocks, or `::meta{}` blocks
- Comments are preserved in the parsed tree but stripped during normalization; they do not appear in rendered output
- The formatter (`cln fmt`) preserves block comments in their original position

### Inline comments

Inline comments appear at the end of any inline-bearing line (heading, paragraph, list item, blockquote). They start with `//` preceded by at least one space or tab.

```text
# Introduction // section heading comment
Some paragraph text. // author note
- List item // todo: expand this
> Quoted text // attribution note
```

Rules:

- An inline comment starts with `//` preceded by at least one space or tab character
- The `//` must not be inside a code span (backticks)
- `//` without a preceding space or tab is ordinary text (e.g., `http://example.com`)
- Inline comments are stripped during parsing and do not appear in the parsed tree or normalized AST
- The formatter does NOT preserve inline comments (they are author-convenience, not structural)

The syntax was chosen for familiarity (C, JavaScript, Go, Rust) and because `//` does not collide with any existing CLN block opener. URLs containing `//` only appear inside inline text, links, or attribute values — never as bare block-level lines.

## Lists and blockquotes

To keep the grammar closed in v0.1:

- unordered lists are flat sequences of `- item`
- ordered lists are flat sequences of `1. item`, `2. item`, and so on, with the authored numbers preserved
- blockquotes are flat sequences of `> quoted line`
- nested lists, nested blockquotes, and multi-paragraph list items are deferred

This is intentionally conservative. It avoids indentation-sensitive subgrammars in the first normative release.

## Table syntax

Tables are a built-in raw-body directive.

Example:

```text
::table[header=true, align=["left", "right"]]{
Name | Value
Parser | Deterministic
Notes | Inline only
}
```

Rules:

- Each body line is one row
- Cells are separated by `|`
- Leading and trailing whitespace around each cell is trimmed
- A literal pipe inside a cell is written as `\|`
- A literal backslash inside a cell is written as `\\`
- If `header=true`, the first row is the header row
- `align` entries, when present, must be `left`, `center`, or `right`
- `align` must contain one entry per column when present
- Every row must have the same cell count after splitting and unescaping

The table body is split first, then each cell is parsed with the core inline grammar. This keeps table syntax readable without making pipe tables part of the top-level language surface.

## Slug algorithm

Heading IDs are generated from the heading's plain-text content after stripping note bodies and inline markup wrappers.

Algorithm:

1. Extract plain text from the heading inline AST.
2. Normalize with Unicode NFKD.
3. Lowercase.
4. Replace each run of non-ASCII alphanumeric characters with a single `-`.
5. Trim leading and trailing `-`.
6. If the result is empty, validation fails unless an explicit `::anchor[id="..."]` supplies the ID.
7. If the slug already exists in the document, append `-2`, `-3`, and so on by source order.

This makes slugs deterministic while keeping repeated headings legal.

## Include rules

`::include[src="..."]` resolves paths under validation, not during raw text parse.

Rules:

- `src` must be a quoted string
- only POSIX-style `/` separators are valid in source
- absolute paths are forbidden
- URI schemes such as `http:` and `file:` are forbidden
- the path is resolved relative to the containing document
- after normalization and symlink resolution, the target must remain inside the project root
- `clearnotation.toml` may narrow the allowed include roots further, but not widen them beyond the project root

Includes fail closed:

- missing targets fail
- directory targets fail
- escaping the allowed root fails
- disabled include capability fails

## Validation boundary notes

The grammar alone does not decide these; validation does:

- unknown attributes
- missing required attributes
- wrong attribute types
- `::anchor` with no following addressable block
- duplicate IDs after `::anchor` overrides
- unresolved `::ref`
- invalid include targets
- extension trust and capability checks

## What stays intentionally out of v0.1

- inline HTML
- YAML frontmatter
- reference-style links or footnotes
- autolinks
- nested list subgrammars
- arbitrary inline directive bodies
- raw renderer markup from extensions

That gives ClearNotation a fully specified first syntax rather than a broad but underspecified one.
