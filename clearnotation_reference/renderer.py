"""HTML renderer for the ClearNotation normalized AST."""

from __future__ import annotations

import html
from typing import Any

try:
    import latex2mathml.converter as _l2m

    _HAS_LATEX2MATHML = True
except ImportError:  # pragma: no cover
    _HAS_LATEX2MATHML = False

from .models import (
    CodeSpan,
    Emphasis,
    Link,
    NBlockQuote,
    NCallout,
    NExtensionBlock,
    NFigure,
    NHeading,
    NMathBlock,
    NOrderedList,
    NParagraph,
    NRef,
    NSourceBlock,
    NTable,
    NThematicBreak,
    NToc,
    NUnorderedList,
    NormalizedBlock,
    NormalizedDocument,
    NormalizedInline,
    Note,
    Strong,
    Text,
)


def render_html(document: NormalizedDocument, *, css_path: str = "clearnotation.css") -> str:
    parts: list[str] = []
    parts.append("<!DOCTYPE html>")
    parts.append('<html lang="en">')
    parts.append("<head>")
    parts.append('<meta charset="utf-8">')
    title = document.meta.get("title", "ClearNotation Document")
    parts.append(f"<title>{_esc(str(title))}</title>")
    parts.append(f'<link rel="stylesheet" href="{_esc(css_path)}">')
    parts.append("</head>")
    parts.append("<body>")

    headings: list[NHeading] = []
    for block in document.blocks:
        if isinstance(block, NHeading):
            headings.append(block)

    for block in document.blocks:
        parts.append(_render_block(block, headings))

    if document.notes:
        parts.append('<hr class="footnotes-sep">')
        parts.append('<section class="footnotes">')
        parts.append("<ol>")
        for note in document.notes:
            assert note.number is not None
            parts.append(f'<li id="fn-{note.number}">')
            parts.append(_render_inlines(note.children))
            parts.append(f' <a href="#fnref-{note.number}" class="footnote-backref">\u21a9</a>')
            parts.append("</li>")
        parts.append("</ol>")
        parts.append("</section>")

    parts.append("</body>")
    parts.append("</html>")
    return "\n".join(parts)


def _render_math(latex: str) -> str:
    """Render a LaTeX string to MathML via latex2mathml.

    Returns MathML markup when the library is available and the input is
    non-empty.  Falls back to an escaped ``<pre>`` placeholder otherwise.
    """
    text = latex.strip()
    if _HAS_LATEX2MATHML and text:
        try:
            return _l2m.convert(text, display="block")
        except Exception:
            # Conversion failure (e.g. truly malformed input) — fall through
            pass
    return f'<pre class="math"><code>{_esc(latex)}</code></pre>'


def _render_block(block: NormalizedBlock, headings: list[NHeading]) -> str:
    if isinstance(block, NHeading):
        tag = f"h{block.level}"
        return f'<{tag} id="{_esc(block.id)}">{_render_inlines(block.content)}</{tag}>'

    if isinstance(block, NParagraph):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        return f"<p{attrs}>{_render_inlines(block.content)}</p>"

    if isinstance(block, NThematicBreak):
        return "<hr>"

    if isinstance(block, NBlockQuote):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        lines = "\n".join(f"<p>{_render_inlines(line)}</p>" for line in block.lines)
        return f"<blockquote{attrs}>\n{lines}\n</blockquote>"

    if isinstance(block, NUnorderedList):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        items = "\n".join(f"<li>{_render_inlines(item)}</li>" for item in block.items)
        return f"<ul{attrs}>\n{items}\n</ul>"

    if isinstance(block, NOrderedList):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        start = block.items[0].ordinal if block.items else 1
        start_attr = f' start="{start}"' if start != 1 else ""
        items = "\n".join(
            f"<li>{_render_inlines(item.content)}</li>" for item in block.items
        )
        return f"<ol{attrs}{start_attr}>\n{items}\n</ol>"

    if isinstance(block, NToc):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        return f'<nav class="toc"{attrs}>\n{_render_toc(headings)}\n</nav>'

    if isinstance(block, NCallout):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        parts: list[str] = [f'<aside class="callout callout-{_esc(block.kind)}"{attrs}>']
        if block.title:
            parts.append(f'<p class="callout-title">{_esc(block.title)}</p>')
        for child in block.blocks:
            parts.append(_render_block(child, headings))
        parts.append("</aside>")
        return "\n".join(parts)

    if isinstance(block, NFigure):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        parts_list: list[str] = [f"<figure{attrs}>"]
        parts_list.append(f'<img src="{_esc(block.src)}" alt="">')
        if block.blocks:
            parts_list.append("<figcaption>")
            for child in block.blocks:
                parts_list.append(_render_block(child, headings))
            parts_list.append("</figcaption>")
        parts_list.append("</figure>")
        return "\n".join(parts_list)

    if isinstance(block, NMathBlock):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        rendered = _render_math(block.text)
        return f'<div class="math"{attrs}>{rendered}</div>'

    if isinstance(block, NTable):
        return _render_table(block)

    if isinstance(block, NSourceBlock):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        return f'<pre{attrs}><code class="language-{_esc(block.language)}">{_esc(block.text)}</code></pre>'

    if isinstance(block, NExtensionBlock):
        attrs = f' id="{_esc(block.id)}"' if block.id else ""
        inner = "\n".join(_render_block(child, headings) for child in block.blocks)
        return f'<div data-extension="{_esc(block.type_name)}"{attrs}>{inner}</div>'

    return ""


def _render_inlines(inlines: list[NormalizedInline]) -> str:
    parts: list[str] = []
    for node in inlines:
        if isinstance(node, Text):
            parts.append(_esc(node.value))
        elif isinstance(node, CodeSpan):
            parts.append(f"<code>{_esc(node.value)}</code>")
        elif isinstance(node, Strong):
            parts.append(f"<strong>{_render_inlines(node.children)}</strong>")
        elif isinstance(node, Emphasis):
            parts.append(f"<em>{_render_inlines(node.children)}</em>")
        elif isinstance(node, Link):
            parts.append(f'<a href="{_esc(node.target)}">{_render_inlines(node.label)}</a>')
        elif isinstance(node, Note):
            assert node.number is not None
            n = node.number
            parts.append(
                f'<sup><a href="#fn-{n}" id="fnref-{n}" class="footnote-ref">[{n}]</a></sup>'
            )
        elif isinstance(node, NRef):
            parts.append(f'<a href="#{_esc(node.target)}">{_esc(node.target)}</a>')
    return "".join(parts)


def _render_toc(headings: list[NHeading]) -> str:
    if not headings:
        return ""
    items: list[str] = []
    for h in headings:
        indent = "  " * (h.level - 1)
        label = _render_inlines(h.content)
        items.append(f'{indent}<li><a href="#{_esc(h.id)}">{label}</a></li>')
    return "<ul>\n" + "\n".join(items) + "\n</ul>"


def _render_table(table: NTable) -> str:
    attrs = f' id="{_esc(table.id)}"' if table.id else ""
    parts: list[str] = [f"<table{attrs}>"]

    rows = list(table.rows)
    if table.header and rows:
        header_row = rows.pop(0)
        parts.append("<thead>")
        parts.append("<tr>")
        for i, cell in enumerate(header_row.cells):
            style = _align_style(table.align, i)
            parts.append(f"<th{style}>{_render_inlines(cell.content)}</th>")
        parts.append("</tr>")
        parts.append("</thead>")

    if rows:
        parts.append("<tbody>")
        for row in rows:
            parts.append("<tr>")
            for i, cell in enumerate(row.cells):
                style = _align_style(table.align, i)
                parts.append(f"<td{style}>{_render_inlines(cell.content)}</td>")
            parts.append("</tr>")
        parts.append("</tbody>")

    parts.append("</table>")
    return "\n".join(parts)


def _align_style(align: list[str] | None, index: int) -> str:
    if align and index < len(align):
        return f' style="text-align: {align[index]}"'
    return ""


def _esc(text: str) -> str:
    return html.escape(text, quote=True)
