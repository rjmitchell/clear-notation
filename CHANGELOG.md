# Changelog

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
