# ClearNotation for Visual Studio Code

Syntax highlighting for [ClearNotation](https://github.com/rjmitchell/clear-notation) `.cln` files in Visual Studio Code.

## Features

- **TextMate grammar** for accurate, scope-aware tokenization of ClearNotation v1.0 syntax
- Highlights headings, directives, inline formatting, links, code blocks, and comments
- Automatic **file association** for `.cln` files
- **Bracket matching** for directive delimiters and inline spans

## Installation

Search for **ClearNotation** in the VS Code Extensions panel, or install from the command line:

```
ext install clearnotation.clearnotation
```

## What is ClearNotation?

ClearNotation is a docs-first, non-Turing-complete markup language for technical documentation. It features a normative EBNF grammar, fail-closed parsing, and typed extensibility — designed as a clean-sheet alternative to Markdown.

- **GitHub:** https://github.com/rjmitchell/clear-notation
- **Live editor:** https://rjmitchell.github.io/clear-notation/
- **Python reference implementation:** `pip install clearnotation`
- **JavaScript normalizer/renderer:** `npm install clearnotation-js`

## Syntax Overview

```cln
# Heading

A paragraph with +{bold} and *{italic} inline formatting.

- Item one
- Item two

> A blockquote.

[Visit the docs -> https://github.com/rjmitchell/clear-notation]

@callout[type=note] {
  This is a callout block.
}
```
