# TODOS

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

---

## Completed

### Editor v1.0 parity (Phase 1: grammar + converter + serializer)
- **Security fix:** URL scheme validation blocks javascript: and data: URIs in rendered links and figures (Python + JS renderers)
- **Tree-sitter grammar v1.0:** external scanner with indent stack, nested list support (both unordered and ordered), multi-paragraph items via LIST_CONTINUATION token
- **Converter updates:** nested list children populated from list_item_body, clnComment block type
- **Serializer updates:** depth-aware indentation for nested lists and continuations

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
