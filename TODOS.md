# TODOS

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

### VS Code extension (LSP)
Full VS Code extension with diagnostics, autocomplete for directive names/attributes, and error underlining. Uses tree-sitter for highlighting and a custom LSP server for semantic analysis.
- Effort: L-XL (human: 2-4 weeks / CC: ~2 hours)
- Depends on: tree-sitter grammar + stable parser/validator API
