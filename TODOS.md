# TODOS

## Active — Visual Editor (in progress)

### ~~Phase 4.5: JS validator + normalizer + renderer (HTML export)~~ DONE
Ported to `clearnotation-js/src/`: normalizer (flat-to-tree inline conversion, slug generation, note numbering), renderer (full HTML5 output matching Python), utilities (slugify, splitTableRow, escHtml). 86 tests. Plan: `docs/superpowers/plans/2026-04-07-phase4.5-js-normalizer-renderer.md`.

### ~~Phase 5a: One-directional split-pane editor~~ DONE
Split-pane editor with BlockNote visual editor (left) + live CLN source pane (right). Includes: draggable divider, toolbar (file menu, formatting, dark mode, cheat sheet), File System Access API + localStorage autosave, templates (PRD, design doc, meeting notes), welcome state, keyboard shortcuts (Cmd+B/I/E/S), Markdown paste conversion, status bar, WCAG 2.1 AA (skip link, ARIA labels, focus management). 301 tests. Plan: `docs/superpowers/plans/2026-04-07-phase5a-split-pane-editor.md`.

### ~~Phase 5b: Bidirectional editing~~ DONE
CodeMirror editable source pane, bidirectional sync protocol (generation counters, 300ms debounce, activeGen flag), error recovery (visual holds last valid parse, error bar in source), per-pane undo stacks (sync updates excluded from history), BNBlock→BlockNote reverse mapping. 315 tests. Plan: `docs/superpowers/plans/2026-04-07-phase5b-bidirectional-editing.md`.

### ~~Phase 5.5: CI/CD~~ DONE
GitHub Actions CI (push/PR to main: TypeScript check, Vitest, Python tests, fixture harness, Vite build) + deploy (tag push: build + GitHub Pages). Workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.

### ~~Tree-sitter grammar fixes~~ DONE
Fixed: (1) blocks no longer require blank line separators (`repeat1` → `repeat`), (2) link labels now support spaces via word-splitting with space alias + high-precedence separator. All 15 valid fixtures now parse cleanly.

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

### ~~Multi-error collection for LSP diagnostics~~ DONE
Validator collects block-level errors via `DiagnosticCollection` and reports all at once via `MultipleValidationFailures`. Single errors still raise `ValidationFailure` (backward compatible). CLI prints each error individually. 10 tests.

### ~~`cln fmt` formatter~~ DONE
Shipped as part of the v0.1 toolchain. Roundtrip-correct formatter operating on the parsed tree (pre-validation). Includes `cln fmt`, `cln fmt --write`, `cln fmt --check`.

### ~~KaTeX server-side math rendering~~ DONE
Integrated `latex2mathml` for `::math{...}` blocks. Renders LaTeX to MathML at build time (no client-side JS). Graceful fallback if not installed. Optional dependency: `pip install clearnotation[math]`.

### ~~PyPI distribution~~ DONE
Shipped as part of the v0.1 toolchain. `pip install clearnotation` for CLI, `pip install clearnotation[lsp]` for LSP server. GitHub Actions CI for publishing on tag push.

### ~~AST-shape assertions for valid fixtures~~ DONE
JSON snapshot `.ast.json` sidecar files for all valid fixtures. Snapshot comparison test in `tests/test_ast_snapshots.py`.

### ~~Expanded fixture coverage for edge cases~~ DONE
Added 9 new fixtures: empty raw bodies, whitespace raw body, deep inline nesting, adjacent blocks, multiple anchors (valid), plus duplicate anchor ID, unresolved ref, unknown directive, missing required attribute (invalid). 57 total fixture cases.

## P2 — Important but not blocking

### ~~ReDoS audit of inline parser~~ DONE
All regex patterns audited and verified safe. No catastrophic backtracking found. Timeout tests added.

### ~~Code syntax highlighting in SourceBlock~~ DONE
Pygments integration for server-side syntax highlighting. Optional dependency: `pip install clearnotation[highlight]`. Graceful fallback if not installed.

### ~~`cln watch` live-reload~~ DONE
`cln watch <file|dir>` with watchdog file watcher, local HTTP server, auto-rebuild on `.cln` changes. Optional dependency: `pip install clearnotation[watch]`.

### ~~`cln init` scaffolding~~ DONE
`cln init [directory]` creates `clearnotation.toml` + `docs/index.cln` starter project. 6 tests.

### ~~Tree-sitter WASM playground page~~ DONE
Interactive playground at `/playground.html` — type ClearNotation, see CST update live. Self-contained HTML, dark mode, draggable divider, error highlighting.

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
