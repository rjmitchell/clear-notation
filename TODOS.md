# TODOS

## In progress — ready to implement

### Notes, refs, anchors — Phase A (Design 2)
Round-trip correctness for footnotes (`^{...}`), cross-references (`::ref[target="..."]`), and anchors (`::anchor[id="..."]`). Eliminates the `DROPPED_STYLES` silent data loss in `bn-to-blocknote.ts:28` and removes the wrong standalone `clnAnchor` block path in favor of fold-into-next-addressable semantics matching the Python normalizer. Ships with 5 rebuilt addressable block specs (heading, paragraph, blockquote, bulletListItem, numberedListItem) that add `anchorId` as a first-class prop. Also incidentally fixes the pre-existing `startNumber` → `start` drift that Codex caught during the outside-voice review. NO authoring UI, NO async load-path rework, NO scaffolding for future directives — those are all Phase B, gated on Design 1 adoption signal. Spec reviewed through design review, eng review, and two outside voices (Claude subagent + Codex/GPT-5.4) that converged on the Phase A/B split.
- Effort: ~3-4 hours with CC+gstack
- Spec: `docs/superpowers/specs/2026-04-11-notes-refs-anchors-design.md` (commit `68959db`)
- Plan: not yet written — user approved execution, plan to be drafted via `superpowers:writing-plans`
- Kickoff: "Update TODOS.md then implement phase A as-specced"

## Open

### VS Code custom editor provider (v1.1)
Register a custom editor for .cln files in the VS Code extension. Embed the same BlockNote editor in a VS Code webview. Deferred until browser editor validates with real users.
- Effort: L (CC: ~2 hours)
- Depends on: browser editor user feedback

### VS Code extension (LSP) improvements
Full VS Code extension with diagnostics, autocomplete for directive names/attributes, and error underlining. Uses tree-sitter for highlighting and a custom LSP server for semantic analysis.
- Effort: L-XL (human: 2-4 weeks / CC: ~2 hours)
- Depends on: tree-sitter grammar + stable parser/validator API

### Hosted editor Phase 2: Shareable URLs
Add pako compression + base64url encoding of CLN source in the URL hash. Share button that copies the link. Documents over ~2KB compressed show a warning. Custom domain setup.
- Effort: M (CC: ~30 min)
- Priority: P2
- Depends on: Phase 1 adoption metrics (gate: 10+ VS Code installs OR 5+ npm weekly downloads)
- Design doc: `~/.gstack/projects/rjmitchell-clear-notation/ryan-docs/readme-v1-design-20260408-194517.md`
- Implementation plan (Phase 2 not yet written): extend `docs/superpowers/plans/2026-04-08-hosted-editor-phase1.md`

### Editor load/restore trust hole
`setSource()` in `editor/src/hooks/useSync.ts:101` uses `simple-cln-loader` (line-based approximation) instead of tree-sitter. When a user opens a `.cln` file or restores from autosave, the initial visual-pane rendering is lossy — directives are approximated, some constructs are skipped. "Bidirectional trust" only holds once the user types something to trigger the real parser path. Surfaced by Codex outside voice during the 2026-04-11 bidirectional trust review.
- Effort: M (design + implementation)
- Priority: P2
- Design options: (a) route `setSource` through `parseSourceToBlocks` with a WASM-loading state for the cold-start case, (b) teach `simple-cln-loader` to handle more CLN constructs, (c) keep the line-based loader as a fast preview and do a full tree-sitter parse in the background.
- Related: `editor/src/lib/simple-cln-loader.ts`, Design 1 bidirectional trust spec §6 item 3.

### Editor `errorBlock` serializer contract mismatch
Pre-existing bug in the converter's dead-code error-block path. `editor/src/converter/block-converter.ts:468` (`errorBlock()`) sets `parseError: true` on the block but does NOT set `props.rawContent`. `editor/src/serializer/block-serializer.ts:19` only preserves the raw error text when `props.rawContent` exists. So if a parseError block ever round-trips through the visual pipeline, serialization will mangle it. Currently invisible because `parseSourceToBlocks` bails at the top-level `tree.hasError` check before the converter runs — the error path is dead code. Surfaced by Codex outside voice during the 2026-04-11 bidirectional trust review.
- Effort: S (~20 min fix — either set `rawContent` in `errorBlock` or change the serializer check to use `content`)
- Priority: P3 — only matters if someone turns on the dead code path later (e.g., brainstorm's Approach 2)
- Related: `editor/src/converter/block-converter.ts:462-470`, `editor/src/serializer/block-serializer.ts:17-22`

---

## Completed

### Bidirectional trust — Design 1 (Phase 1)
Fixes the source→visual freeze when typing `+{bold}` without a trailing newline. Full TDD implementation via `superpowers:subagent-driven-development` — fresh subagent per task, two-stage review after each, ~34 new tests passing out of the gate. Resolved with Rule 1 (append trailing newline) + async race guard (`sourceGenRef`) + minimal broken-state UX (dim + gutter marker + aria-live) + toolbar shortcut early-return. Manual smoke test in Task 7 caught three additional pre-existing bugs that would have shipped silently: parser-worker's wrong web-tree-sitter named-import (dead code on main-thread), WASM paths missing the Vite `BASE_URL` prefix (404 returning HTML that fails the WebAssembly magic word check), and the Task 4 BlockNote `editable` toggle firing an onChange that overwrote the broken source with the visual pane's empty content. All three fixed. IRON RULE regression tests (`+{bold}` no newline → recovered state with `<strong>bold</strong>` in visual pane) pass both in unit tests and in the real browser.
- **Shipped:** 2026-04-11
- **Commits:** `deaaef6..56ae72e` on main (11 commits)
- **Tests:** 370 passing (336 baseline + 34 new)
- **Spec:** `docs/superpowers/specs/2026-04-11-bidirectional-trust-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-11-bidirectional-trust.md`
- **Known follow-ups:** Editor load/restore trust hole (below) and errorBlock serializer contract mismatch (below) — both are pre-existing bugs surfaced by the Design 1 Codex review, both deferred.

### Editor v1.0 parity + URL security (v1.0.1)
- **Security fix:** URL scheme validation blocks `javascript:`, `data:`, protocol-relative (`//evil.com`), and percent-encoded (`javascript%3a`) schemes in rendered links and figures. Both Python and JS renderers. Closes CSO audit findings #10 and #11.
- **Tree-sitter grammar v1.0:** external scanner with indent stack, nested list support (both unordered and ordered), multi-paragraph items via LIST_CONTINUATION token. Scanner also bails during tree-sitter error recovery to prevent corrupt state.
- **Converter updates:** nested list children populated from list_item_body, shared `convertListItemBody` helper, clnComment block type.
- **Serializer updates:** depth-aware indentation for nested lists and content-column alignment for continuations.
- **Completed:** v1.0.1 (2026-04-10)

### Visual Editor
- **Phase 0:** Feasibility spikes (React + Vite + TypeScript, WASM 9KB, bundle 594KB/750KB)
- **Phase 1:** Tree-sitter WASM parser + Web Worker (38 tests)
- **Phase 2:** BlockNote schema from registry (111 tests)
- **Phase 3-4:** CST-to-BlockNote converter + serializer + escaping matrix (184 tests)
- **Phase 4.5:** JS normalizer + renderer for HTML export (86 tests)
- **Phase 5a:** Split-pane editor product (315 tests)
- **Phase 5b:** Bidirectional editing with CodeMirror (315 tests)
- **Phase 5.5:** CI/CD (GitHub Actions + GitHub Pages deploy)
- **Tree-sitter grammar fixes:** Adjacent blocks, link label spaces (all fixtures pass)

### Python Toolchain (P1)
- **Multi-error collection:** Validator collects block-level errors via DiagnosticCollection (10 tests)
- **cln fmt:** Roundtrip-correct formatter
- **KaTeX math rendering:** latex2mathml for ::math blocks (7 tests)
- **PyPI distribution:** pip install clearnotation
- **AST snapshot assertions:** JSON sidecar files for all valid fixtures (20 tests)
- **Expanded fixture coverage:** 57 total conformance cases (9 new edge cases)

### Demo corpus + conformance suite + converter fixes
- **Demo corpus:** Rust Book (112 files, 7.6% avg loss, 112/112 validate). Analysis: `docs/analysis/demo-corpus-dry-run.md`
- **Converter fixes:** Backslash escaping in code spans, code blocks inside blockquotes now skipped
- **Conformance suite:** HTML snapshots for all 21 valid fixtures. JS conformance test loads shared fixtures (7 pass, 13 known parity gaps, 1 skipped). Suite README added.

### Comment syntax + expanded PRD template
- **Comment syntax:** `//` block-level comments (EBNF, spec, parser, formatter, tree-sitter, 18 tests, conformance fixture)
- **PRD template:** Expanded from 36 to ~100 lines; showcases meta, callouts, tables, anchors/refs, source, figure, math, notes, strong, emphasis

### v1.0 spec freeze
- **Inline comments:** `// comment` at end of line, stripped during parsing
- **Include inlining:** recursive resolution with circular detection and depth cap (10)
- **Nested lists:** indentation-based nesting, multi-paragraph items, tab-in-indent errors
- **Tree-sitter edge cases:** regression tests for `}:`, colon-in-prose, multiple styled spans
- **Spec documents:** v1.0 EBNF, syntax, AST conformance frozen
- **Conformance:** 70 fixtures (30 valid, 17 parse-invalid, 23 validate-invalid)

### Package publishing
- **VS Code extension:** Published to marketplace as `ClearNotation.clearnotation` (vscode-v1.0.0)
- **clearnotation-js:** Published to npm as `clearnotation-js@1.0.0` (npm-v1.0.0)

### JS renderer parity (Phase 1)
- **Math block wrapper:** `<div class="math">` wrapping matches Python reference
- **Source block trailing newline:** `\n` before `</code></pre>` matches Python
- **NListItem model:** list items support nested blocks (multi-paragraph, nested lists)
- **Type mapping fixes:** conformance converter type discriminants aligned with types.ts
- **Result:** 116 tests passing, 3 skipped (include-resolution), 7 remaining known gaps (v02/v03/v14/v18 footnotes, v07 MathML, v10 escaping, v13 syntax highlighting)

### Include-aware file watching
- **Dependency graph:** `IncludeGraph` tracks forward/reverse include maps
- **Targeted rebuilds:** changing an included file rebuilds all transitive includers
- **Graph refresh:** dependencies update after each rebuild (handles added/removed includes)
- **Integration:** graph built during initial `cln watch` build, used by rebuild handler

### Landing page redesign
- **Paper+ink theme:** warm white background, sage green accent, Geist Mono nav
- **Stats row:** conformance (100% vs ~51%), syntax forms (1 vs 3-5), implementations (unified vs fragmented)
- **Copy rewrite:** plain English, no AI-isms, updated fixture count (70)
- **Bug fixes:** dead footer link, column height mismatch, VS Code install command

### Hosted editor Phase 1: Foundation
- **Landing page:** Static HTML/CSS at GitHub Pages root with CLN vs Markdown comparison, install cards, "Try the editor" CTA
- **Editor URL:** Moved from / to /editor/ subpath
- **Deploy workflow:** Updated to assemble landing page + editor
- **Editor inline rendering fix:** simple-cln-loader now parses +{bold}, *{italic}, ^{notes}, `code`, [links], and renders ::math/::source/::callout bodies

### Quality and DX (P2)
- **ReDoS audit:** All regex patterns verified safe (20 tests)
- **Syntax highlighting:** Pygments for rendered code blocks (8 tests)
- **cln watch:** File watcher + local HTTP server (6 tests)
- **cln init:** Project scaffolding command (6 tests)
- **Tree-sitter playground:** Interactive /playground.html page
