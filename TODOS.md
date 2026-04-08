# TODOS

## Active — Visual Editor (in progress)

### ~~Phase 4.5: JS validator + normalizer + renderer (HTML export)~~ DONE
Ported to `clearnotation-js/src/`: normalizer (flat-to-tree inline conversion, slug generation, note numbering), renderer (full HTML5 output matching Python), utilities (slugify, splitTableRow, escHtml). 86 tests. Plan: `docs/superpowers/plans/2026-04-07-phase4.5-js-normalizer-renderer.md`.

### ~~Phase 5a: One-directional split-pane editor~~ DONE
Split-pane editor with BlockNote visual editor (left) + live CLN source pane (right). Includes: draggable divider, toolbar (file menu, formatting, dark mode, cheat sheet), File System Access API + localStorage autosave, templates (PRD, design doc, meeting notes), welcome state, keyboard shortcuts (Cmd+B/I/E/S), Markdown paste conversion, status bar, WCAG 2.1 AA (skip link, ARIA labels, focus management). 301 tests. Plan: `docs/superpowers/plans/2026-04-07-phase5a-split-pane-editor.md`.

### Phase 5b: Bidirectional editing
CodeMirror source pane, sync protocol (generation counter, 300ms debounce, last-edit-wins), error recovery (visual holds last valid parse), per-pane undo stacks.
- Effort: L (CC: ~2 hours)
- Depends on: Phase 5a

### Phase 5.5: CI/CD
GitHub Actions: build WASM, run Vitest, run Playwright E2E, build static site, deploy to GitHub Pages on tag push.
- Effort: M (CC: ~30 min)
- Depends on: Phase 5a

### Tree-sitter grammar fixes (3 fixture failures)
v03-link-and-note.cln, v08-anchor-and-ref.cln, v14-anchor-paragraph.cln fail due to: (1) grammar requires blank lines between all blocks but some fixtures have blocks without separators, (2) standalone notes on their own line not handled. Not blocking editor work.
- Effort: S-M (CC: ~20 min)
- Depends on: nothing

## Completed — Visual Editor Phases

### ~~Phase 0: Feasibility spikes~~ DONE
Tree-sitter WASM builds (28KB raw, 9KB gzipped). BlockNote requires React (vanilla JS has no UI chrome). Bundle: 594KB gzipped, under 750KB budget. Stack: React + Vite + TypeScript.

### ~~Phase 1: Tree-sitter WASM parser + Web Worker~~ DONE
Parser module at `editor/src/parser/`: types, Web Worker, main-thread client, CST utilities. 38 tests.

### ~~Phase 2: BlockNote schema from registry~~ DONE
Schema module at `editor/src/schema/`: TOML-to-JSON converter, registry types, core blocks (8), directive blocks (8), inline marks (6 with nesting whitelist), slash menu (16 items). 111 tests total.

### ~~Phase 3-4: CST-to-BlockNote converter + serializer~~ DONE
Converter at `editor/src/converter/`: CST-to-BlockNote with style stacking, directive re-parsing, error fallback. Serializer at `editor/src/serializer/`: style-to-tree inline reconstruction, all block types, shared escaping matrix. 184 tests. Plan: `docs/superpowers/plans/2026-04-07-phase3-4-converter-serializer.md`.

## P1 — Next after v0.1 toolchain ships

### Multi-error collection for LSP diagnostics
The parser/validator currently raises on the first error (single exception). The LSP reports one diagnostic per parse cycle, forcing users into a fix-one-save-see-next loop. Implement partial error recovery: catch the first block-level error, skip to the next block, continue parsing. Report multiple independent diagnostics per cycle.
- Effort: M (human: 3-5 days / CC: ~30 min)
- Depends on: LSP server being stable
- Context: Single-error LSP is the #1 UX complaint for naive language servers. Requires try/continue refactoring in `parser._parse_blocks()` and `validator._validate_blocks()`. Each block that fails gets caught and collected, remaining blocks continue.

### ~~`cln fmt` formatter~~ DONE
Shipped as part of the v0.1 toolchain. Roundtrip-correct formatter operating on the parsed tree (pre-validation). Includes `cln fmt`, `cln fmt --write`, `cln fmt --check`.

### KaTeX server-side math rendering
Integrate KaTeX (or a Python math renderer) for `::math{...}` blocks. v0.1 renders math as `<pre class="math">` placeholder. Real math rendering produces HTML/MathML at build time with no client-side JS.
- Effort: M (human: 3-5 days / CC: ~20 min)
- Depends on: renderer being complete
- Context: Table stakes for scientific/technical documentation. KaTeX is faster than MathJax and supports server-side rendering. Alternative: find a pure-Python LaTeX-to-HTML library to avoid Node.js dependency.

### ~~PyPI distribution~~ DONE
Shipped as part of the v0.1 toolchain. `pip install clearnotation` for CLI, `pip install clearnotation[lsp]` for LSP server. GitHub Actions CI for publishing on tag push.

### AST-shape assertions for valid fixtures
Add JSON snapshot assertions for parsed and normalized AST output of each valid fixture. Currently the harness only tests pass/fail. Snapshots pin parser behavior so regressions are caught by diffing the full AST, not just the outcome.
- Effort: S (human: ~4 hours / CC: ~15 min)
- Depends on: nothing (can be done anytime)
- Context: Decided in eng review (hybrid testing approach). The normalizer and renderer are done, so AST shapes can be snapshotted now. Add `expected_ast` field to fixture manifest entries or use sidecar `.json` files.

### Expanded fixture coverage for edge cases
Add conformance fixtures for: config-level failures (missing `spec`, duplicate directive names, invalid `body_mode`), include cycles (mutual includes), deeper inline nesting boundary cases (max nesting, mixed constructs at boundaries), and more raw-body directive corner cases (empty raw bodies, raw body with only whitespace).
- Effort: S (human: ~4 hours / CC: ~15 min)
- Depends on: nothing
- Context: The current 44 fixtures cover the core cases. These edge cases were identified in the original handoff as gaps worth filling.

## P2 — Important but not blocking

### ReDoS audit of inline parser
Audit regex patterns in `inline_parser.py` for catastrophic backtracking. The inline parser uses regex for `+{`, `*{`, `^{`, `[...->...]`, `::name[...]`. If ClearNotation is ever used in a server context (doc site builder accepting user content), malicious `.cln` files could cause denial-of-service.
- Effort: S (human: ~4 hours / CC: ~10 min)
- Depends on: nothing
- Context: Low risk for reference implementation. Only matters when the parser processes untrusted input.

### Code syntax highlighting in SourceBlock
Add syntax highlighting to rendered code blocks (currently outputs raw `<code class="language-X">`). Options: server-side Pygments, client-side highlight.js/Prism, or build-time highlighting.
- Effort: S-M (human: 1-3 days / CC: ~15 min)
- Depends on: renderer being complete

### `cln watch` live-reload
File watcher that rebuilds on save and live-reloads the browser. Standard DX for documentation tools.
- Effort: M (human: 3-5 days / CC: ~20 min)
- Depends on: CLI being stable

### `cln init` scaffolding
Generate a starter project with `clearnotation.toml`, `docs/` directory, and `index.cln` template.
- Effort: S (human: ~4 hours / CC: ~10 min)
- Depends on: CLI being stable

### Tree-sitter WASM playground page
Interactive syntax playground at /playground where users try ClearNotation syntax and see the parsed tree live. Near-zero marginal cost once the WASM parser exists.
- Effort: S (CC: ~15 min)
- Depends on: Phase 1 WASM parser (DONE)
- Context: Teaching tool and marketing asset. Great for blog posts and docs.

### VS Code custom editor provider (v1.1)
Register a custom editor for .cln files in the VS Code extension. Embed the same BlockNote editor in a VS Code webview. Deferred until browser editor validates with real users.
- Effort: L (CC: ~2 hours)
- Depends on: Phase 5a browser editor working

### VS Code extension (LSP) improvements
Full VS Code extension with diagnostics, autocomplete for directive names/attributes, and error underlining. Uses tree-sitter for highlighting and a custom LSP server for semantic analysis.
- Effort: L-XL (human: 2-4 weeks / CC: ~2 hours)
- Depends on: tree-sitter grammar + stable parser/validator API

## P3 — Future

### Cross-implementation conformance test suite
Expand the shared JSON escaping test matrix into a full language-agnostic conformance suite (input .cln text -> expected normalized AST -> expected HTML output) that any ClearNotation implementation (Python, JS, future Rust/Go) can run.
- Effort: M (CC: ~30 min)
- Depends on: Phase 4.5 JS pipeline
- Context: The existing fixtures + parity tests produce most of this data naturally.
