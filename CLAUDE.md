# ClearNotation

A docs-first, non-Turing-complete, formally specified markup language for technical documentation. Not Markdown-compatible. Clean-sheet design with normative EBNF, fail-closed parsing, and typed extensibility.

## Key commands

```bash
# Run all tests
python3 -m unittest discover -s tests -v          # 128 Python tests
cd editor && pnpm test                             # 315 editor tests
cd clearnotation-js && pnpm test                   # 86 JS normalizer/renderer tests

# Run fixture harness (57 conformance cases)
python3 -m clearnotation_harness --manifest fixtures/manifest.toml --adapter clearnotation_reference.adapter:create_adapter

# CLI
cln build <file.cln>       # compile .cln to HTML
cln check <file.cln>       # validate without rendering
cln ast <file.cln>         # dump normalized AST as JSON
cln fmt <file.cln>         # format source
cln init [directory]       # scaffold new project
cln watch <file|dir>       # watch + rebuild + serve
cln convert <file.md|dir>  # convert Markdown to CLN (requires pip install clearnotation[convert])
cln index [directory]      # index .cln files into SQLite (.cln-index.db)
cln query [directory]      # query the index (--directive, --references, --title, --stats)
cln lint <dir> --schema <toml>  # validate corpus against a TOML schema

# Editor
cd editor && pnpm dev      # start visual editor at localhost:5173
```

## Architecture

### Python pipeline
`parse → validate → normalize → render`

- `clearnotation_reference/parser.py` + `inline_parser.py`: source → parsed tree
- `clearnotation_reference/validator.py`: semantic checks with multi-error collection
- `clearnotation_reference/normalizer.py`: parsed tree → typed normalized AST
- `clearnotation_reference/renderer.py`: normalized AST → HTML5 (with Pygments highlighting, latex2mathml math)
- `clearnotation_reference/cli.py`: CLI (build/check/ast/fmt/init/watch)
- `clearnotation_reference/config.py`: config loading + user directive merging

### Browser editor pipeline
`CLN source ↔ tree-sitter CST ↔ BlockNote document model ↔ visual editor`

- `editor/src/parser/`: tree-sitter WASM in Web Worker
- `editor/src/schema/`: BlockNote block specs + inline marks from registry
- `editor/src/converter/`: CST → BlockNote blocks (style stacking, directive re-parsing)
- `editor/src/serializer/`: BlockNote → CLN text (style-to-tree reconstruction)
- `editor/src/components/`: React UI (SplitPane, Toolbar, SourcePane, CheatSheet, etc.)
- `editor/src/hooks/`: bidirectional sync, file ops, dark mode, markdown paste
- `clearnotation-js/src/`: JS normalizer + renderer for HTML export

## Design constraints (do not violate)

- No inline HTML in documents
- No document-defined executable hooks
- Inline-only notes (no reference-style footnotes)
- Explicit directive block delimiters, not indentation-sensitive
- Extensions registered only in `clearnotation.toml`, never in documents
- Fail-closed: unknown directives, attributes, refs, includes all fail
- `+{strong}` and `*{emphasis}` are the inline forms (not Markdown-style `**`/`*`)
- `[label -> url]` is the link syntax (not Markdown-style `[]()`
- Code fences require a mandatory language tag
- The language is not trying to preserve Markdown compatibility

## Spec documents

- `clearnotation-v0.1.ebnf`: normative grammar
- `clearnotation-v0.1-syntax.md`: syntax decisions
- `clearnotation-v0.1-config.md`: config contract
- `clearnotation-v0.1-ast-conformance.md`: AST model and conformance
- `clearnotation-v0.1-examples.md`: conformance corpus
- `docs/designs/v01-renderer.md`: implementation plan (CEO + eng reviewed)

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
