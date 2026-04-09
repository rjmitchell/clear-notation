# clearnotation-js

JavaScript/TypeScript normalizer and HTML renderer for ClearNotation documents.

## Installation

```bash
npm install clearnotation-js
```

## Usage

```ts
import { normalize, renderHtml } from "clearnotation-js";

// Normalize a BlockNote block array into a typed NormalizedDocument
const doc = normalize(blocks, meta);

// Render the document to an HTML string
const html = renderHtml(doc, { cssPath: "clearnotation.css" });
```

## API

### `normalize(blocks: BNBlock[], meta?: Record<string, unknown>): NormalizedDocument`

Converts a BlockNote block array (from the ClearNotation editor or parser) into a typed `NormalizedDocument`. This is the JavaScript counterpart of the Python `normalizer.py` in the reference implementation.

- `blocks` — array of BlockNote blocks produced by the editor or CST converter
- `meta` — optional document metadata (title, author, etc.)

### `renderHtml(doc: NormalizedDocument, options?: RenderOptions): string`

Renders a `NormalizedDocument` to a complete HTML5 string. Output matches the Python `render_html` reference implementation exactly: DOCTYPE, `<html>`, `<head>` (charset, title, CSS link), `<body>` (blocks, optional footnotes).

- `doc` — normalized document returned by `normalize`
- `options.cssPath` — path to the stylesheet (default: `"clearnotation.css"`)

## Types

| Type | Description |
|---|---|
| `NormalizedDocument` | Top-level document with `meta` and `blocks` |
| `NormalizedBlock` | Union of all block node types (heading, paragraph, code, table, etc.) |
| `NormalizedInline` | Union of all inline node types (text, strong, emphasis, link, note, ref) |
| `RenderOptions` | Options for `renderHtml` (`cssPath?: string`) |

Individual block types: `NHeading`, `NParagraph`, `NThematicBreak`, `NBlockQuote`, `NUnorderedList`, `NOrderedList`, `NOrderedItem`, `NToc`, `NCallout`, `NFigure`, `NMathBlock`, `NTable`, `NTableRow`, `NTableCell`, `NSourceBlock`

Individual inline types: `NText`, `NCodeSpan`, `NStrong`, `NEmphasis`, `NLink`, `NNote`, `NRef`

All types are exported from the package root.

## What is ClearNotation?

ClearNotation is a docs-first, non-Turing-complete markup language for technical documentation. It has a normative EBNF grammar, fail-closed parsing, and typed extensibility — designed as a clean-sheet alternative to Markdown.

- GitHub: [https://github.com/rjmitchell/clear-notation](https://github.com/rjmitchell/clear-notation)
- Live editor: [https://clearnotation.dev](https://clearnotation.dev)
- Python reference implementation: `pip install clearnotation`

## License

MIT
