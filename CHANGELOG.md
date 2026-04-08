# Changelog

## [0.9.2] - 2026-04-08

### Added
- `//` comment syntax: block-level comments recognized between blocks and inside parsed directive bodies. Not recognized in raw bodies, fenced code, or meta blocks. Comments are preserved in the parsed tree and formatter round-trip, stripped during normalization. Includes EBNF grammar update, syntax spec section, and 18 new tests.
- Conformance fixture `v21-comments.cln` with AST snapshot (58 total fixtures).
- Tree-sitter grammar updated with `comment` node, highlight query, and 4 corpus tests. WASM rebuilt.
- Expanded PRD editor template from 36 to 124 lines. Now showcases meta (5 attributes), callouts (info + warning), tables with alignment, anchors + refs, source blocks, figures, math, notes, strong, emphasis, inline code, and links.

### Changed
- Normalizer and validator now explicitly skip `Comment` nodes instead of relying on implicit fall-through.
- `Comment` model added to `BlockNode` union type and handled in parser, formatter.

## [0.9.1] - 2026-04-08

### Added
- `cln convert` command: convert Markdown files to ClearNotation using mistune. Handles headings, paragraphs, bold, italic, links, images, tables, code blocks (with language fallback to `text`), ordered/unordered lists, blockquotes, and thematic breaks. Skipped content (inline HTML, front matter) logged to stderr. Install with `pip install clearnotation[convert]`.
- `cln index` command: index a directory of `.cln` files into a SQLite database (`.cln-index.db`). Extracts document titles, directive names and attributes, reference targets, and cross-references to other `.cln` files. Supports incremental indexing via file mtime tracking. Broken files are skipped with warnings.
- `cln query` command: query the index by directive name (`--directive`), reference target (`--references`), document title (`--title`), or attribute (`--attribute`). AND semantics across filters. `--stats` shows corpus overview with directive histogram and broken cross-references.
- `cln lint` command: validate a `.cln` corpus against a TOML schema specifying required directives and required attributes (supports wildcard `*` for all directives). Exit 1 on violations.
- 116 new tests covering converter (57), indexer (13), query (19), linter (14), CLI integration (11), and end-to-end pipeline (2).

### Changed
- Extracted `_parse_and_normalize()` helper in CLI to DRY up the parse-validate-normalize pipeline used by build, check, ast, and the new commands.
- `mistune>=3.0` added as optional dependency under `[convert]` extra.
