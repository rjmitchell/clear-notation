# ClearNotation

A docs-first, non-Turing-complete, formally specified markup language for technical documentation. Not Markdown-compatible. Clean-sheet design with normative EBNF, fail-closed parsing, and typed extensibility.

## Key commands

```bash
# Run fixture harness (44 conformance tests)
python3 -m clearnotation_harness --manifest fixtures/manifest.toml --adapter clearnotation_reference.adapter:create_adapter

# Run unit tests
python3 -m unittest discover -s tests -v

# Build .cln to HTML
python3 -m clearnotation_reference.cli build <file.cln>

# Validate without rendering
python3 -m clearnotation_reference.cli check <file.cln>

# Dump normalized AST as JSON
python3 -m clearnotation_reference.cli ast <file.cln>
```

## Architecture

Pipeline: `parse → validate → normalize → render → postprocess`

- `clearnotation_reference/parser.py` + `inline_parser.py`: source → parsed tree (generic BlockDirective)
- `clearnotation_reference/validator.py`: semantic checks (attrs, refs, includes, IDs)
- `clearnotation_reference/normalizer.py`: parsed tree → typed normalized AST (NHeading, NCallout, NTable, etc.)
- `clearnotation_reference/renderer.py`: normalized AST → semantic HTML5
- `clearnotation_reference/cli.py`: CLI wrapper (cln build/check/ast)
- `clearnotation_reference/diagnostics.py`: error formatting (human/plain/json)

The parser is parameterized by the directive registry from `clearnotation.toml`. The validator walks read-only for ref collection and structural checks. The normalizer handles all mutations (ID assignment, note numbering, typed node creation). Two-pass design.

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
