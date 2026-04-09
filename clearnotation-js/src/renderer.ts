/**
 * HTML renderer for the ClearNotation normalized AST.
 *
 * Produces identical HTML to the Python reference implementation
 * (clearnotation_reference/renderer.py).
 */

import type {
  NormalizedDocument,
  NormalizedBlock,
  NormalizedInline,
  NHeading,
  NParagraph,
  NBlockQuote,
  NUnorderedList,
  NOrderedList,
  NToc,
  NCallout,
  NFigure,
  NMathBlock,
  NTable,
  NSourceBlock,
} from "./types";

import { escHtml } from "./utils";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderOptions {
  cssPath?: string;
}

/**
 * Render a NormalizedDocument to an HTML string.
 *
 * The output matches the Python `render_html` function exactly:
 * DOCTYPE, html, head (charset, title, css), body (blocks, optional footnotes).
 */
export function renderHtml(
  document: NormalizedDocument,
  options?: RenderOptions,
): string {
  const cssPath = options?.cssPath ?? "clearnotation.css";
  const parts: string[] = [];

  parts.push("<!DOCTYPE html>");
  parts.push('<html lang="en">');
  parts.push("<head>");
  parts.push('<meta charset="utf-8">');

  const title = (document.meta.title as string | undefined) ?? "ClearNotation Document";
  parts.push(`<title>${escHtml(String(title))}</title>`);
  parts.push(`<link rel="stylesheet" href="${escHtml(cssPath)}">`);
  parts.push("</head>");
  parts.push("<body>");

  // Collect all headings for TOC rendering
  const headings: NHeading[] = [];
  for (const block of document.blocks) {
    if (block.type === "heading") {
      headings.push(block);
    }
  }

  for (const block of document.blocks) {
    parts.push(renderBlock(block, headings));
  }

  // Footnotes section
  if (document.notes.length > 0) {
    parts.push('<hr class="footnotes-sep">');
    parts.push('<section class="footnotes">');
    parts.push("<ol>");
    for (const note of document.notes) {
      parts.push(`<li id="fn-${note.number}">`);
      parts.push(renderInlines(note.children));
      parts.push(
        ` <a href="#fnref-${note.number}" class="footnote-backref">\u21a9</a>`,
      );
      parts.push("</li>");
    }
    parts.push("</ol>");
    parts.push("</section>");
  }

  parts.push("</body>");
  parts.push("</html>");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: NormalizedBlock, headings: NHeading[]): string {
  switch (block.type) {
    case "heading":
      return renderHeading(block);
    case "paragraph":
      return renderParagraph(block);
    case "thematic_break":
      return "<hr>";
    case "blockquote":
      return renderBlockQuote(block);
    case "unordered_list":
      return renderUnorderedList(block, headings);
    case "ordered_list":
      return renderOrderedList(block, headings);
    case "toc":
      return renderToc(block, headings);
    case "callout":
      return renderCallout(block, headings);
    case "figure":
      return renderFigure(block, headings);
    case "math_block":
      return renderMathBlock(block);
    case "table":
      return renderTable(block);
    case "source_block":
      return renderSourceBlock(block);
    default:
      return "";
  }
}

function renderHeading(block: NHeading): string {
  const tag = `h${block.level}`;
  return `<${tag} id="${escHtml(block.id)}">${renderInlines(block.content)}</${tag}>`;
}

function renderParagraph(block: NParagraph): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<p${attrs}>${renderInlines(block.content)}</p>`;
}

function renderBlockQuote(block: NBlockQuote): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const lines = block.lines
    .map((line) => `<p>${renderInlines(line)}</p>`)
    .join("\n");
  return `<blockquote${attrs}>\n${lines}\n</blockquote>`;
}

function renderListItem(
  content: NormalizedInline[],
  blocks: NormalizedBlock[],
  headings: NHeading[],
): string {
  if (blocks.length === 0) {
    return `<li>${renderInlines(content)}</li>`;
  }
  const parts = [`<p>${renderInlines(content)}</p>`];
  for (const b of blocks) {
    parts.push(renderBlock(b, headings));
  }
  return `<li>${parts.join("")}</li>`;
}

function renderUnorderedList(block: NUnorderedList, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const items = block.items
    .map((item) => renderListItem(item.content, item.blocks, headings))
    .join("\n");
  return `<ul${attrs}>\n${items}\n</ul>`;
}

function renderOrderedList(block: NOrderedList, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const start = block.items.length > 0 ? block.items[0].ordinal : 1;
  const startAttr = start !== 1 ? ` start="${start}"` : "";
  const items = block.items
    .map((item) => renderListItem(item.content, item.blocks, headings))
    .join("\n");
  return `<ol${attrs}${startAttr}>\n${items}\n</ol>`;
}

function renderToc(block: NToc, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<nav class="toc"${attrs}>\n${renderTocList(headings)}\n</nav>`;
}

function renderTocList(headings: NHeading[]): string {
  if (headings.length === 0) {
    return "";
  }
  const items: string[] = [];
  for (const h of headings) {
    const indent = "  ".repeat(h.level - 1);
    const label = renderInlinesTextOnly(h.content);
    items.push(`${indent}<li><a href="#${escHtml(h.id)}">${label}</a></li>`);
  }
  return "<ul>\n" + items.join("\n") + "\n</ul>";
}

/** Render inlines without links or refs — safe for wrapping in <a> tags (TOC). */
function renderInlinesTextOnly(inlines: NormalizedInline[]): string {
  return inlines
    .map((node) => {
      switch (node.type) {
        case "text":
          return escHtml(node.value);
        case "code_span":
          return `<code>${escHtml(node.value)}</code>`;
        case "strong":
          return `<strong>${renderInlinesTextOnly(node.children)}</strong>`;
        case "emphasis":
          return `<em>${renderInlinesTextOnly(node.children)}</em>`;
        case "link":
          return renderInlinesTextOnly(node.label);
        case "note":
          return `[${node.number}]`;
        case "ref":
          return escHtml(node.target);
        default:
          return "";
      }
    })
    .join("");
}

function renderCallout(block: NCallout, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const parts: string[] = [
    `<aside class="callout callout-${escHtml(block.kind)}"${attrs}>`,
  ];
  if (block.title) {
    parts.push(`<p class="callout-title">${escHtml(block.title)}</p>`);
  }
  for (const child of block.blocks) {
    parts.push(renderBlock(child, headings));
  }
  parts.push("</aside>");
  return parts.join("\n");
}

function renderFigure(block: NFigure, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const parts: string[] = [`<figure${attrs}>`];
  parts.push(`<img src="${escHtml(block.src)}" alt="">`);
  if (block.blocks.length > 0) {
    parts.push("<figcaption>");
    for (const child of block.blocks) {
      parts.push(renderBlock(child, headings));
    }
    parts.push("</figcaption>");
  }
  parts.push("</figure>");
  return parts.join("\n");
}

function renderMathBlock(block: NMathBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<div class="math"${attrs}><pre class="math"><code>${escHtml(block.text)}</code></pre></div>`;
}

function renderSourceBlock(block: NSourceBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<pre${attrs}><code class="language-${escHtml(block.language)}">${escHtml(block.text)}\n</code></pre>`;
}

function renderTable(table: NTable): string {
  const attrs = table.id ? ` id="${escHtml(table.id)}"` : "";
  const parts: string[] = [`<table${attrs}>`];

  const rows = [...table.rows];

  if (table.header && rows.length > 0) {
    const headerRow = rows.shift()!;
    parts.push("<thead>");
    parts.push("<tr>");
    for (let i = 0; i < headerRow.cells.length; i++) {
      const style = alignStyle(table.align, i);
      parts.push(
        `<th${style}>${renderInlines(headerRow.cells[i].content)}</th>`,
      );
    }
    parts.push("</tr>");
    parts.push("</thead>");
  }

  if (rows.length > 0) {
    parts.push("<tbody>");
    for (const row of rows) {
      parts.push("<tr>");
      for (let i = 0; i < row.cells.length; i++) {
        const style = alignStyle(table.align, i);
        parts.push(
          `<td${style}>${renderInlines(row.cells[i].content)}</td>`,
        );
      }
      parts.push("</tr>");
    }
    parts.push("</tbody>");
  }

  parts.push("</table>");
  return parts.join("\n");
}

function alignStyle(
  align: string[] | undefined,
  index: number,
): string {
  if (align && index < align.length) {
    return ` style="text-align: ${align[index]}"`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderInlines(inlines: NormalizedInline[]): string {
  const parts: string[] = [];
  for (const node of inlines) {
    switch (node.type) {
      case "text":
        parts.push(escHtml(node.value));
        break;
      case "code_span":
        parts.push(`<code>${escHtml(node.value)}</code>`);
        break;
      case "strong":
        parts.push(`<strong>${renderInlines(node.children)}</strong>`);
        break;
      case "emphasis":
        parts.push(`<em>${renderInlines(node.children)}</em>`);
        break;
      case "link":
        parts.push(
          `<a href="${escHtml(node.target)}">${renderInlines(node.label)}</a>`,
        );
        break;
      case "note":
        parts.push(
          `<sup><a href="#fn-${node.number}" id="fnref-${node.number}" class="footnote-ref">[${node.number}]</a></sup>`,
        );
        break;
      case "ref":
        parts.push(
          `<a href="#${escHtml(node.target)}">${escHtml(node.target)}</a>`,
        );
        break;
    }
  }
  return parts.join("");
}
