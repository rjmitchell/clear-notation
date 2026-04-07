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

::callout[kind="tip", title="One syntax per concept"]{
No `*` vs `**` ambiguity. No flavor differences. No inline HTML.
}

::table[header=true, align=["left", "right"]]{
Feature | Syntax
Strong  | +{text}
Emphasis | *{text}
Link    | [label -> url]
Note    | ^{text}
}
```

## Install

```bash
git clone https://github.com/rjmitchell/clear-notation.git
cd clear-notation
pip install -e .
```

## Usage

```bash
cln build document.cln    # compile .cln to HTML with default stylesheet
cln check document.cln    # validate without rendering (for CI)
cln ast document.cln      # dump normalized AST as JSON
```

## What's in the box

- **Normative EBNF grammar** (`clearnotation-v0.1.ebnf`)
- **Reference parser, validator, normalizer, and HTML renderer** in Python (stdlib-only)
- **44 conformance fixtures** with a manifest-driven test harness
- **Default stylesheet** with light/dark mode, callouts, tables, footnotes, and TOC
- **Tree-sitter grammar** for editor syntax highlighting
- **Migration cheat sheet** from Markdown (`docs/migration-from-markdown.cln`)

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
python3 -m clearnotation_harness --manifest fixtures/manifest.toml \
  --adapter clearnotation_reference.adapter:create_adapter
python3 -m unittest discover -s tests -v
```

## Spec documents

- `clearnotation-v0.1.ebnf` - normative grammar
- `clearnotation-v0.1-syntax.md` - syntax decisions
- `clearnotation-v0.1-config.md` - config contract
- `clearnotation-v0.1-ast-conformance.md` - AST model and conformance
- `clearnotation-v0.1-examples.md` - conformance corpus

## License

MIT
