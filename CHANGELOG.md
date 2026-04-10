# Changelog

## [1.0.1] - 2026-04-10

### Security
- Block `javascript:` and `data:` URI schemes in rendered link `href` and figure `src` attributes. Both Python and JS renderers now use an allowlist (`http`, `https`, `mailto`, `tel`) and fall back to `#` for any other scheme. Closes CSO audit findings #10 and #11.
- Block protocol-relative URLs (`//evil.com`) in link `href` and figure `src`. Without this guard, browsers would load the URL under the page's own scheme, enabling open-redirect and tracker-pixel attacks from valid CLN documents.
- Block percent-encoded dangerous schemes (`javascript%3a...`, `JAVASCRIPT%3A...`). Browsers decode percent-encoding before routing URLs, so the literal-colon check was bypassable. Both renderers now percent-decode before scheme extraction and handle malformed sequences safely.

### Added
- Tree-sitter grammar v1.0 parity: external scanner with indent stack, nested list support (both unordered and ordered), multi-paragraph list items via `LIST_CONTINUATION` token. Grammar now matches the frozen v1.0 spec that the Python parser already implemented.
- Editor `clnComment` block type for `// comment` lines.
- Editor converter: nested list children populated from `list_item_body` CST nodes (nested lists become children, multi-paragraph continuations become child paragraphs).
- Editor serializer: depth-aware indentation for nested lists and content-column alignment for multi-paragraph continuations (including double-digit ordered markers).
- Tree-sitter corpus: 9 new list test cases (flat, nested, multi-paragraph unordered + ordered, list-followed-by-heading regression tests).

### Fixed
- Editor comment converter stripped only the `//` prefix, leaving a trailing newline in `props.text`. Now strips trailing whitespace as well, restoring round-trip fidelity.
- Tree-sitter scanner now bails out during parser error recovery (when all external symbols are simultaneously valid), preventing corrupt indent-stack state from persisting across incremental parses.

### Changed
- `convertUnorderedList`/`convertOrderedList` share a `convertListItemBody` helper (eliminates ~30 lines of duplication).
- Scanner uses `TREE_SITTER_SERIALIZATION_BUFFER_SIZE` instead of a magic `1024`. Removed unused `<string.h>` include and redundant deserialize guard branches.

## [1.0.0] - 2026-04-08

### Added
- Inline comments: `// comment` at end of any line (after whitespace). Stripped during parsing, not preserved in AST.
- Include inlining: `::include` now recursively resolves and inlines target content during normalization. Circular detection and depth cap (10 levels). Target meta is discarded. Heading slugs deduplicated across the merged document. Note numbering continues across includes.
- Nested lists: indentation-based sub-items (2-space for unordered, marker-width for ordered). Mixed nesting (ordered in unordered and vice versa) supported.
- Multi-paragraph list items: blank line + indented continuation text creates additional paragraphs within a list item.
- `ListItem` and `NListItem` model types with `content` and `blocks` fields.
- 70 conformance fixtures (up from 55 in v0.9.2).
- Tree-sitter edge case regression tests (4 new corpus tests).

### Changed
- `UnorderedList.items` is now `list[ListItem]` (was `list[list[InlineNode]]`).
- `OrderedItem` gains a `blocks` field for nested content.
- Include errors show full include chain in diagnostics.
- Tabs in list nesting position produce a parse error (fail-closed).
- All `normalize()` call sites now pass `source_path` and `config` for include resolution.

### Spec
- `clearnotation-v1.0.ebnf`: normative grammar (supersedes v0.1).
- `clearnotation-v1.0-syntax.md`: all syntax decisions frozen.
- `clearnotation-v1.0-ast-conformance.md`: complete AST model with nested lists and include inlining.

### NOT in v1.0
- Nested blockquotes
- Definition lists
- JS/Python rendering parity (JS is best-effort)
- Tree-sitter grammar expansion for new features (editor stays on v0.1 grammar, bug fixes only)

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
