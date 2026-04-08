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

### Cross-implementation conformance test suite
Expand the shared JSON escaping test matrix into a full language-agnostic conformance suite (input .cln text -> expected normalized AST -> expected HTML output) that any ClearNotation implementation (Python, JS, future Rust/Go) can run.
- Effort: M (CC: ~30 min)
- Depends on: Phase 4.5 JS pipeline (DONE)

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

### Quality and DX (P2)
- **ReDoS audit:** All regex patterns verified safe (20 tests)
- **Syntax highlighting:** Pygments for rendered code blocks (8 tests)
- **cln watch:** File watcher + local HTTP server (6 tests)
- **cln init:** Project scaffolding command (6 tests)
- **Tree-sitter playground:** Interactive /playground.html page
