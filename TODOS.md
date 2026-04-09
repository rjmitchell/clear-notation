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

### Include-aware file watching
`cln watch` doesn't track include dependencies. If main.cln includes chapter1.cln and chapter1.cln changes, main.cln won't rebuild. Fix: build an include dependency graph during the initial build, then watch all referenced files.
- Effort: S (CC: ~15 min)
- Priority: P2
- Context: Include inlining now ships in v1.0. This is the remaining usability gap for multi-file projects.

### JS renderer parity gaps (13+ fixtures)
The cross-implementation conformance suite identified 13+ fixtures where the JS renderer diverges from the Python reference. Tracked as known gaps and skips in `clearnotation-js/src/conformance.test.ts`. Key categories: footnote HTML structure, code block wrappers, table rendering, NListItem format (v1.0 model change), inline escaping output.
- Effort: M (CC: ~1 hour)
- Depends on: nothing

### Publish VS Code extension to marketplace
Extension is ready (README, icon, CHANGELOG, metadata). Needs `VSCE_PAT` secret in GitHub repo, then `git tag vscode-v1.0.0 && git push origin vscode-v1.0.0` triggers publish.
- Effort: S (manual: ~15 min for token setup)
- Priority: P1
- Blocked on: Azure DevOps PAT + marketplace publisher account

### Publish clearnotation-js to npm
Package is ready (README, files field, publish workflow). Needs `NPM_TOKEN` secret in GitHub repo, then `git tag npm-v1.0.0 && git push origin npm-v1.0.0` triggers publish.
- Effort: S (manual: ~10 min for token setup)
- Priority: P1
- Blocked on: npm access token

### Hosted editor Phase 2: Shareable URLs
Add pako compression + base64url encoding of CLN source in the URL hash. Share button that copies the link. Documents over ~2KB compressed show a warning. Custom domain setup.
- Effort: M (CC: ~30 min)
- Priority: P2
- Depends on: Phase 1 adoption metrics (gate: 10+ VS Code installs OR 5+ npm weekly downloads)
- Design doc: `~/.gstack/projects/rjmitchell-clear-notation/ryan-docs/readme-v1-design-20260408-194517.md`
- Implementation plan (Phase 2 not yet written): extend `docs/superpowers/plans/2026-04-08-hosted-editor-phase1.md`

---

## Completed

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

### Hosted editor Phase 1: Foundation
- **VS Code extension:** README, icon, CHANGELOG, marketplace metadata (ready to publish, needs VSCE_PAT)
- **clearnotation-js npm:** README, removed private, files field, publish workflow (ready to publish, needs NPM_TOKEN)
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
