# Changelog

## [1.0.2] - 2026-04-11

Editor-only release. No spec, grammar, Python reference, or CLI changes.

### Added
- **Editor bidirectional trust** (Design 1). Typing `+{bold}` without a trailing newline now renders as bold in the visual pane instead of freezing behind a yellow "Syntax error" banner. A new `editor/src/lib/live-recovery.ts` module appends a synthetic trailing newline on the parse-side copy only (the user's source buffer is untouched). `parseSourceToBlocks` returns a `ParseResult` discriminated union with three states (`valid | recovered | broken`). `useSync` exposes `syncState` and adds an async race guard via a generation counter so rapid typing never loses keystrokes to a stale parse committing over a newer one.
- **Editor broken-state UX.** When a parse is genuinely unrecoverable (unclosed fence, malformed attribute list), the visual pane dims to 60% opacity and becomes read-only (`editable={false}`), a CodeMirror gutter marker appears on line 1 of the source pane, and a visually-hidden `aria-live="polite"` region announces the state change (only on transitions, not on initial mount). The old yellow top banner is deleted. Toolbar format shortcuts (Cmd+B, Cmd+I, Cmd+E, Cmd+K) early-return on broken state to prevent bypassing `editable={false}` via programmatic `editor.toggleStyles()` calls.
- **Editor round-trip correctness for three cross-reference constructs** (Design 2 Phase A):
  - **Footnotes** (`^{...}`) are preserved through open → edit → save → reload instead of being silently stripped at `bn-to-blocknote.ts`. Footnotes use BlockNote's native `content: "styled"` custom inline content so nested cross-references, bold, italic, code, and links inside footnotes round-trip correctly.
  - **Cross-references** (`::ref[target="..."]`) now render as visually distinct pills (`#intro` with a subtle accent background) instead of being silently dropped. Atomic BlockNote custom inline content node with a `target` string prop.
  - **Anchors** (`::anchor[id="..."]`) fold into the next addressable block's `anchorId` prop during conversion (matching the Python normalizer's `pending_anchor` semantic) and unfold to `::anchor[id="..."]\n` prefixing the target block on serialization. Multiple anchors before one block, anchors before thematic breaks, and anchors at EOF are handled per spec §3.7.
- **Custom `clnSchema`** (`editor/src/schema/cln-schema.ts`) is now passed to `BlockNoteEditor.create()`. Adds five rebuilt addressable block specs (heading, paragraph, quote, bulletListItem, numberedListItem) with `anchorId` as a first-class prop, plus two custom inline content specs (`clnNote`, `clnRef`). Other BlockNote defaults (codeBlock, image, file, etc.) are kept as-is.
- **54 new editor tests** (370 → 424 passing). Includes 7 byte-identical round-trip integration tests that verify the full `parseSourceToBlocks → serializeDocument` pipeline for each construct plus a mixed-all-three case, and 3 IRON RULE regression tests reproducing the exact screenshot bug that Design 1 exists to fix.
- **Test infrastructure**: `@testing-library/react` + `@testing-library/react-hooks` as devDependencies, `vitest.config.ts` now discovers `.test.tsx` files with a `src/test-setup.ts` hook (includes a JSDOM `window.matchMedia` shim for Mantine-backed component tests).

### Fixed
- **Pre-existing parser-worker bug.** `editor/src/parser/parser-worker.ts` imported `(await import("web-tree-sitter")).default` but `web-tree-sitter@0.26.x` has only named exports. The live-edit path has been broken at runtime since the initial parser commit. Fixed by switching to `const { Parser, Language } = await import(...)`. Uncovered during Design 1 Task 7 manual smoke testing.
- **Pre-existing WASM fetch path bug.** `parser-worker.ts` and `parse-source.ts` both used hardcoded absolute paths (`/tree-sitter.wasm`, `/tree-sitter-clearnotation.wasm`) that only resolve when Vite `base` is `/`. The editor moved to `base: "/clear-notation/editor/"` in April 2026 but the parser paths were never updated, so WASM fetches returned the SPA's `index.html` with a "magic word" compile error. Both paths now use `import.meta.env.BASE_URL`.
- **Pre-existing BlockNote editable-flip onChange loop.** When `syncState` flipped from `valid` to `broken`, `VisualEditor` set `editable={false}` on `BlockNoteView`, which triggered BlockNote's `onChange` event as a side effect of the prop change (not a real user edit). The event propagated to `useSync.onVisualChange`, which serialized the visual pane's (empty) content and overwrote the user's broken source buffer, resetting `syncState` back to `valid`. Net effect: broken state never appeared in the DOM. Fixed by early-returning from `VisualEditor.handleChange` when `syncStateRef.current === "broken"`, with the ref assigned during render (not in a `useEffect`) so it's current by the time BlockNote fires the spurious onChange.
- **Pre-existing `startNumber` vs `start` drift.** `VisualEditor.tsx`, `bn-to-blocknote.ts`, and the CLN converter/serializer all used `startNumber` as the numbered-list prop name, but BlockNote's default ordered-list block spec uses `start`. The mismatch meant the visual pane always displayed "1." regardless of source. Fixed by rebuilding the numbered-list block spec as a custom `clnNumberedListItem` with `startNumber` in its propSchema.
- `SourcePane` aria-live region no longer announces "Visual editor is active" on initial page load. It now fires only on state transitions (valid ↔ broken), detected via a `prevSyncStateRef` that distinguishes the first render from subsequent ones.
- `useSync.setSource` now resets `syncState` to "valid" on any user-initiated document load (new file, template, open, restore). Previously an empty `setSource("")` preserved a broken state from a prior session, which would have become user-visible once Design 1's read-only broken-state UX landed.

### Changed
- Deleted the `DROPPED_STYLES` set in `editor/src/lib/bn-to-blocknote.ts` that silently stripped `clnNote` and `clnRef` style flags. Both constructs now flow through the conversion path as structured custom inline content nodes.
- Removed the standalone `clnAnchor` block emission path from `block-converter.ts`. `convertDocument` now folds anchors into the next addressable block's `anchorId` prop.
- `inline-converter.ts` emits `{ type: "note", content: [...] }` and `{ type: "ref", target }` structured inline content instead of styled text with `clnNote`/`clnRef` style flags.
- `inline-serializer.ts` handles structured note/ref entries directly. The dead `clnRef`-as-style branch is deleted.
- `block-serializer.ts` emits `::anchor[id="..."]\n` before any block with a non-empty `anchorId` prop.
- `bn-to-blocknote.ts` adds `clnBlockquote → quote` to its CLN → BlockNote type mapping (was previously falling through to "paragraph" default).
- `VisualEditor.tsx` now passes `clnSchema` to `BlockNoteEditor.create()` and unpacks `clnNote`/`clnRef`/`anchorId` from the BlockNote document when converting back to BNBlocks.

### NOT in scope for this release (deferred to Phase B)
- Authoring UI: slash menu items for `/footnote` and `/ref`, a ref picker popover, a side-menu button to set/clear a block's anchor ID.
- Async load-path rework: file-open and autosave-restore still go through the line-based `simple-cln-loader` instead of `parseSourceToBlocks`. The "load/restore trust hole" remains a known bug.
- Broken-ref detection: refs to non-existent anchors compile through to dangling `<a href="#missing">` without a warning.
- Validity checks on authoring (empty slug, duplicate anchor, dangling ref). Will become mandatory when authoring UI ships.
- Custom BlockNote default UI takeover: slash menu and side menu are still BlockNote defaults.
- Scaffolding for future block directives (callout, figure, math, table, source, toc).

### Known follow-ups
- **List item Enter UX regression.** Rebuilding the bullet/numbered list block specs required omitting BlockNote's internal `handleEnter` helper (it depends on `splitBlockTr`, which is not exported from `@blocknote/core`). Pressing Enter on an empty bullet or numbered list item no longer exits the list; it now inserts a newline. Input rules for `- `, `* `, `1. ` and other keymaps still work.
- **Numbered list visual starting number.** BlockNote's `NumberedListIndexingDecorationPlugin` reads `attrs["start"]` while our custom spec uses `startNumber`. The HTML render path computes display indices independently, so the rendered output is correct, but the in-editor visual display shows "1." regardless of source `startNumber`.

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
