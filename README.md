# ClearNotation

A docs-first markup language with a formally specified grammar, fail-closed parsing, and typed extensibility. Not Markdown-compatible. That's the point.

## Why

Markdown has no formal grammar, ambiguous parse rules, 41 incompatible flavors, and uses inline HTML as an escape hatch. ClearNotation is a clean-sheet design that trades Markdown compatibility for correctness, predictability, and a real spec you can implement against.

## Quick look

```
::meta{
title = "Example Document"
}

# Getting started

ClearNotation uses +{strong text}, *{emphasized text}, `code spans`,
[links -> https://example.com], and ^{inline footnotes that render as endnotes}.

- Nested lists work  // inline comments too
  - Two-space indent per level
  - Multi-paragraph items via blank line + indent

1. Ordered lists preserve authored numbers
   - Mixed nesting (ordered + unordered)

::callout[kind="tip", title="One syntax per concept"]{
No `*` vs `**` ambiguity. No flavor differences. No inline HTML.
}

::include[src="partials/intro.cln"]
```

## Try it

**[Live editor](https://rjmitchell.github.io/clear-notation/editor/)** — visual editing on the left, ClearNotation source on the right, live bidirectional sync.

**Features:** templates (PRD, design doc, meeting notes), dark mode, keyboard shortcuts, syntax cheat sheet, Markdown paste auto-conversion, File System Access API for open/save, localStorage autosave, HTML export, WCAG 2.1 AA accessibility.

**Local dev:** `cd editor && pnpm dev` starts the editor at localhost:5173.

**Interactive playground:** `/playground.html` lets you type ClearNotation and see the tree-sitter parse tree update live.

## Install

### VS Code

Search "ClearNotation" in the extensions marketplace, or:

```
ext install clearnotation.clearnotation
```

### Python toolchain (CLI, LSP, renderer)

```bash
pip install clearnotation              # CLI: cln build, cln check, cln ast, cln fmt, cln init, cln watch
pip install clearnotation[convert]     # Markdown-to-CLN converter via mistune
pip install clearnotation[math]        # LaTeX math rendering via latex2mathml
pip install clearnotation[highlight]   # Syntax highlighting via Pygments
pip install clearnotation[watch]       # File watcher for cln watch
pip install clearnotation[lsp]         # LSP server for editor integration
```

### JavaScript (normalizer + renderer)

```bash
npm install clearnotation-js
```

### Editor (local dev)

```bash
git clone https://github.com/rjmitchell/clear-notation.git
cd clear-notation
pnpm install        # install all workspace packages
cd editor && pnpm dev   # start the visual editor at localhost:5173
```

## Usage

```bash
cln build document.cln          # compile .cln to HTML
cln build docs/                 # compile all .cln files in a directory
cln check document.cln          # validate without rendering (for CI)
cln ast document.cln            # dump normalized AST as JSON
cln fmt document.cln            # format (stdout)
cln fmt --write document.cln    # format in place
cln fmt --check document.cln    # check formatting (exit 1 if changes needed)
cln init                        # scaffold a new project (clearnotation.toml + docs/index.cln)
cln init my-project             # scaffold in a specific directory
cln watch docs/                 # watch for changes, rebuild, serve at localhost:8000

# Document platform tools
cln convert docs.md             # convert Markdown to CLN
cln convert docs/ -o out/       # convert directory of Markdown files
cln index docs/                 # index .cln files into SQLite (.cln-index.db)
cln query docs/ --stats         # corpus stats: directive histogram, broken references
cln query docs/ --directive callout  # find docs using a specific directive
cln query docs/ --title "API"   # find docs by title (substring match)
cln lint docs/ --schema schema.toml  # validate corpus against a TOML schema
```

## What's in the box

### Language and toolchain
- **Normative EBNF grammar** (`clearnotation-v1.0.ebnf`)
- **Reference parser, validator, normalizer, and HTML renderer** in Python
- **70 conformance fixtures** with a manifest-driven test harness and AST snapshot assertions
- **Default stylesheet** (`clearnotation.css`) with light/dark mode, callouts, tables, footnotes, TOC
- **Formatter** (`cln fmt`) with roundtrip-correct formatting
- **Multi-error diagnostics** for the validator (reports all block-level errors, not just the first)
- **LaTeX math rendering** via `latex2mathml` (optional, `::math{...}` blocks)
- **Syntax highlighting** via Pygments for rendered code blocks (optional)

### Browser editor
- **Visual editor** (BlockNote/React) with live CLN source pane (CodeMirror)
- **Bidirectional sync** with generation counters, 300ms debounce, error recovery
- **Templates, dark mode, keyboard shortcuts, cheat sheet, Markdown paste conversion**
- **File operations** (File System Access API, download fallback, localStorage autosave)
- **Tree-sitter WASM playground** at `/playground.html`

### Developer tooling
- **Tree-sitter grammar** for syntax highlighting and incremental parsing
- **JS normalizer and HTML renderer** (`clearnotation-js/`) for browser-side HTML export
- **VS Code extension** with LSP diagnostics (in `vscode-clearnotation/`)
- **GitHub Actions CI/CD** (TypeScript check, Vitest, Python tests, fixture harness, GitHub Pages deploy)

## Architecture

```
pnpm workspace (repo root)
├── clearnotation_reference/   Python: parser, validator, normalizer, renderer, CLI, LSP
├── editor/                    Browser editor: React + BlockNote + CodeMirror + Vite
│   └── src/
│       ├── parser/            Tree-sitter WASM parser (Web Worker)
│       ├── schema/            BlockNote block/inline specs from registry
│       ├── converter/         CST → BlockNote document model
│       ├── serializer/        BlockNote → ClearNotation source text
│       └── components/        React UI (SplitPane, Toolbar, SourcePane, CheatSheet, etc.)
├── clearnotation-js/          JS normalizer + HTML renderer (browser-side HTML export)
├── tree-sitter-clearnotation/ Tree-sitter grammar + WASM build
├── vscode-clearnotation/      VS Code extension
└── fixtures/                  Conformance test fixtures + escaping matrix
```

## Key differences from Markdown

| Concept | Markdown | ClearNotation |
|---------|----------|---------------|
| Bold | `**text**` | `+{text}` |
| Italic | `*text*` | `*{text}` |
| Link | `[label](url)` | `[label -> url]` |
| Footnote | `[^ref]` + definition | `^{inline note text}` |
| Table | pipe tables | `::table[header=true]{ ... }` |
| Callout | blockquote hacks | `::callout[kind="warning"]{ ... }` |
| Image | `![alt](src)` | `::figure[src="path"]{ caption }` |
| Nested lists | indentation (fragile) | 2-space indent, mixed types |
| Include | not built-in | `::include[src="path.cln"]` |
| Comments | not built-in | `// block` and `text // inline` |
| Code fence | language optional | language required |
| Inline HTML | allowed | always escaped |

## Design principles

- One canonical syntax per concept
- Formally defined, trivially parsable grammar
- Fail-closed: unknown directives, attributes, and refs are errors, not silent passthrough
- Extensions declared in `clearnotation.toml`, never in documents
- No inline HTML, no executable hooks, no Turing completeness
- Readable raw source

## Running the test suite

```bash
# Python tests (336 tests)
python3 -m unittest discover -s tests -v

# Conformance fixture harness (70 cases)
python3 -m clearnotation_harness --manifest fixtures/manifest.toml \
  --adapter clearnotation_reference.adapter:create_adapter

# Editor tests (316 tests)
cd editor && pnpm test

# JS normalizer/renderer tests (106 tests)
cd clearnotation-js && pnpm test
```

## Spec documents

- `clearnotation-v1.0.ebnf` — normative grammar
- `clearnotation-v1.0-syntax.md` — syntax decisions
- `clearnotation-v1.0-ast-conformance.md` — AST model and conformance
- `clearnotation-v0.1-config.md` — config contract
- `clearnotation-v0.1-examples.md` — conformance corpus

## License

MIT
