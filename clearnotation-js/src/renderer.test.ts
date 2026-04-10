import { describe, it, expect } from "vitest";
import { renderHtml, type RenderOptions } from "./renderer";
import type {
  NormalizedDocument,
  NormalizedBlock,
  NHeading,
  NParagraph,
  NThematicBreak,
  NBlockQuote,
  NUnorderedList,
  NOrderedList,
  NToc,
  NCallout,
  NFigure,
  NMathBlock,
  NSourceBlock,
  NTable,
  NNote,
  NormalizedInline,
} from "./types";

/** Helper: create a minimal NormalizedDocument. */
function doc(
  blocks: NormalizedBlock[] = [],
  meta: Record<string, unknown> = {},
  notes: NNote[] = [],
): NormalizedDocument {
  return { meta, blocks, notes };
}

/** Helper: create a text inline. */
function text(value: string): NormalizedInline {
  return { type: "text", value };
}

describe("renderHtml", () => {
  // -----------------------------------------------------------------------
  // Document structure
  // -----------------------------------------------------------------------

  describe("document structure", () => {
    it("produces DOCTYPE, html, head, and body", () => {
      const html = renderHtml(doc());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<head>");
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
      expect(html).toContain("</html>");
    });

    it("uses meta.title in the <title> tag", () => {
      const html = renderHtml(doc([], { title: "My Doc" }));
      expect(html).toContain("<title>My Doc</title>");
    });

    it("uses default title when meta.title is absent", () => {
      const html = renderHtml(doc());
      expect(html).toContain("<title>ClearNotation Document</title>");
    });

    it("links the default CSS path", () => {
      const html = renderHtml(doc());
      expect(html).toContain('<link rel="stylesheet" href="clearnotation.css">');
    });

    it("accepts a custom CSS path", () => {
      const html = renderHtml(doc(), { cssPath: "/styles/custom.css" });
      expect(html).toContain(
        '<link rel="stylesheet" href="/styles/custom.css">',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Block rendering
  // -----------------------------------------------------------------------

  describe("heading", () => {
    it("renders heading with id", () => {
      const html = renderHtml(
        doc([
          {
            type: "heading",
            level: 2,
            id: "my-heading",
            content: [text("Hello")],
          },
        ]),
      );
      expect(html).toContain('<h2 id="my-heading">Hello</h2>');
    });
  });

  describe("paragraph", () => {
    it("renders paragraph without id", () => {
      const html = renderHtml(
        doc([{ type: "paragraph", content: [text("Some text")] }]),
      );
      expect(html).toContain("<p>Some text</p>");
    });

    it("renders paragraph with id", () => {
      const html = renderHtml(
        doc([{ type: "paragraph", content: [text("Abc")], id: "para-1" }]),
      );
      expect(html).toContain('<p id="para-1">Abc</p>');
    });
  });

  describe("thematic_break", () => {
    it("renders <hr>", () => {
      const html = renderHtml(doc([{ type: "thematic_break" }]));
      expect(html).toContain("<hr>");
    });
  });

  describe("blockquote", () => {
    it("renders blockquote with multiple lines", () => {
      const html = renderHtml(
        doc([
          {
            type: "blockquote",
            lines: [[text("First line")], [text("Second line")]],
          },
        ]),
      );
      expect(html).toContain(
        "<blockquote>\n<p>First line</p>\n<p>Second line</p>\n</blockquote>",
      );
    });

    it("renders blockquote with id", () => {
      const html = renderHtml(
        doc([
          {
            type: "blockquote",
            lines: [[text("Quoted")]],
            id: "q1",
          },
        ]),
      );
      expect(html).toContain('<blockquote id="q1">');
    });
  });

  describe("unordered_list", () => {
    it("renders unordered list", () => {
      const html = renderHtml(
        doc([
          {
            type: "unordered_list",
            items: [{ content: [text("Alpha")], blocks: [] }, { content: [text("Beta")], blocks: [] }],
          },
        ]),
      );
      expect(html).toContain(
        "<ul>\n<li>Alpha</li>\n<li>Beta</li>\n</ul>",
      );
    });
  });

  describe("ordered_list", () => {
    it("renders ordered list starting at 1 (no start attr)", () => {
      const html = renderHtml(
        doc([
          {
            type: "ordered_list",
            items: [
              { ordinal: 1, content: [text("First")], blocks: [] },
              { ordinal: 2, content: [text("Second")], blocks: [] },
            ],
          },
        ]),
      );
      expect(html).toContain("<ol>\n<li>First</li>\n<li>Second</li>\n</ol>");
      expect(html).not.toContain("start=");
    });

    it("renders ordered list with start > 1", () => {
      const html = renderHtml(
        doc([
          {
            type: "ordered_list",
            items: [
              { ordinal: 3, content: [text("Third")], blocks: [] },
              { ordinal: 4, content: [text("Fourth")], blocks: [] },
            ],
          },
        ]),
      );
      expect(html).toContain('<ol start="3">');
    });
  });

  describe("source_block", () => {
    it("renders code block with language", () => {
      const html = renderHtml(
        doc([
          {
            type: "source_block",
            language: "python",
            text: 'print("hi")',
          },
        ]),
      );
      expect(html).toContain(
        '<pre><code class="language-python">print(&quot;hi&quot;)\n</code></pre>',
      );
    });

    it("renders source_block with id", () => {
      const html = renderHtml(
        doc([
          {
            type: "source_block",
            language: "js",
            text: "x",
            id: "src-1",
          },
        ]),
      );
      expect(html).toContain('<pre id="src-1">');
    });
  });

  describe("math_block", () => {
    it("renders math block", () => {
      const html = renderHtml(
        doc([{ type: "math_block", text: "E = mc^2" }]),
      );
      expect(html).toContain(
        '<div class="math"><pre class="math"><code>E = mc^2</code></pre></div>',
      );
    });
  });

  describe("callout", () => {
    it("renders callout with title and child blocks", () => {
      const html = renderHtml(
        doc([
          {
            type: "callout",
            kind: "warning",
            title: "Watch out",
            compact: false,
            blocks: [{ type: "paragraph", content: [text("Be careful")] }],
          },
        ]),
      );
      expect(html).toContain('<aside class="callout callout-warning">');
      expect(html).toContain('<p class="callout-title">Watch out</p>');
      expect(html).toContain("<p>Be careful</p>");
      expect(html).toContain("</aside>");
    });

    it("renders callout without title", () => {
      const html = renderHtml(
        doc([
          {
            type: "callout",
            kind: "note",
            title: undefined,
            compact: false,
            blocks: [{ type: "paragraph", content: [text("Info")] }],
          },
        ]),
      );
      expect(html).not.toContain("callout-title");
    });
  });

  describe("figure", () => {
    it("renders figure with caption", () => {
      const html = renderHtml(
        doc([
          {
            type: "figure",
            src: "img.png",
            blocks: [
              { type: "paragraph", content: [text("A caption")] },
            ],
          },
        ]),
      );
      expect(html).toContain("<figure>");
      expect(html).toContain('<img src="img.png" alt="">');
      expect(html).toContain("<figcaption>");
      expect(html).toContain("<p>A caption</p>");
      expect(html).toContain("</figcaption>");
      expect(html).toContain("</figure>");
    });

    it("renders figure without caption blocks", () => {
      const html = renderHtml(
        doc([{ type: "figure", src: "pic.jpg", blocks: [] }]),
      );
      expect(html).toContain('<img src="pic.jpg" alt="">');
      expect(html).not.toContain("<figcaption>");
    });
  });

  // -----------------------------------------------------------------------
  // Inline rendering
  // -----------------------------------------------------------------------

  describe("inlines", () => {
    it("renders strong", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [
              { type: "strong", children: [text("bold")] },
            ],
          },
        ]),
      );
      expect(html).toContain("<strong>bold</strong>");
    });

    it("renders emphasis", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [
              { type: "emphasis", children: [text("italic")] },
            ],
          },
        ]),
      );
      expect(html).toContain("<em>italic</em>");
    });

    it("renders link", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [
              { type: "link", label: [text("Click")], target: "https://example.com" },
            ],
          },
        ]),
      );
      expect(html).toContain(
        '<a href="https://example.com">Click</a>',
      );
    });

    it("renders ref", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [{ type: "ref", target: "my-section" }],
          },
        ]),
      );
      expect(html).toContain('<a href="#my-section">my-section</a>');
    });

    it("renders code_span", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [{ type: "code_span", value: "let x = 1" }],
          },
        ]),
      );
      expect(html).toContain("<code>let x = 1</code>");
    });

    it("escapes HTML in text", () => {
      const html = renderHtml(
        doc([
          {
            type: "paragraph",
            content: [text('<script>alert("xss")</script>')],
          },
        ]),
      );
      expect(html).toContain(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
      );
      expect(html).not.toContain("<script>");
    });
  });

  // -----------------------------------------------------------------------
  // Footnotes
  // -----------------------------------------------------------------------

  describe("footnotes", () => {
    it("renders footnote references inline", () => {
      const note: NNote = {
        type: "note",
        children: [text("A footnote")],
        number: 1,
      };
      const html = renderHtml(
        doc(
          [
            {
              type: "paragraph",
              content: [text("Hello"), note],
            },
          ],
          {},
          [note],
        ),
      );
      expect(html).toContain(
        '<sup><a href="#fn-1" id="fnref-1" class="footnote-ref">[1]</a></sup>',
      );
    });

    it("renders footnote section at the end", () => {
      const note: NNote = {
        type: "note",
        children: [text("Detail")],
        number: 1,
      };
      const html = renderHtml(doc([], {}, [note]));
      expect(html).toContain('<hr class="footnotes-sep">');
      expect(html).toContain('<section class="footnotes">');
      expect(html).toContain('<li id="fn-1">');
      expect(html).toContain("Detail");
      expect(html).toContain(
        ' <a href="#fnref-1" class="footnote-backref">\u21a9</a>',
      );
      expect(html).toContain("</ol>");
      expect(html).toContain("</section>");
    });

    it("does not render footnote section when no notes", () => {
      const html = renderHtml(doc());
      expect(html).not.toContain("footnotes-sep");
      expect(html).not.toContain("footnotes");
    });
  });

  // -----------------------------------------------------------------------
  // TOC
  // -----------------------------------------------------------------------

  describe("toc", () => {
    it("generates a table of contents from headings", () => {
      const headings: NHeading[] = [
        { type: "heading", level: 1, id: "intro", content: [text("Intro")] },
        {
          type: "heading",
          level: 2,
          id: "details",
          content: [text("Details")],
        },
        {
          type: "heading",
          level: 3,
          id: "sub",
          content: [text("Sub")],
        },
      ];
      const html = renderHtml(
        doc([
          ...headings,
          { type: "toc" },
        ]),
      );
      expect(html).toContain('<nav class="toc">');
      expect(html).toContain('<li><a href="#intro">Intro</a></li>');
      expect(html).toContain('  <li><a href="#details">Details</a></li>');
      expect(html).toContain('    <li><a href="#sub">Sub</a></li>');
      expect(html).toContain("</nav>");
    });

    it("renders empty toc when no headings", () => {
      const html = renderHtml(doc([{ type: "toc" }]));
      expect(html).toContain('<nav class="toc">');
      // Empty toc body
      expect(html).toContain('<nav class="toc">\n\n</nav>');
    });
  });

  // -----------------------------------------------------------------------
  // Table
  // -----------------------------------------------------------------------

  describe("table", () => {
    it("renders table with header and align", () => {
      const table: NTable = {
        type: "table",
        header: true,
        align: ["left", "center"],
        rows: [
          {
            cells: [
              { content: [text("Name")] },
              { content: [text("Age")] },
            ],
          },
          {
            cells: [
              { content: [text("Alice")] },
              { content: [text("30")] },
            ],
          },
        ],
      };
      const html = renderHtml(doc([table]));
      expect(html).toContain("<table>");
      expect(html).toContain("<thead>");
      expect(html).toContain('<th style="text-align: left">Name</th>');
      expect(html).toContain('<th style="text-align: center">Age</th>');
      expect(html).toContain("</thead>");
      expect(html).toContain("<tbody>");
      expect(html).toContain('<td style="text-align: left">Alice</td>');
      expect(html).toContain('<td style="text-align: center">30</td>');
      expect(html).toContain("</tbody>");
      expect(html).toContain("</table>");
    });

    it("renders table without header", () => {
      const table: NTable = {
        type: "table",
        header: false,
        align: undefined,
        rows: [
          { cells: [{ content: [text("X")] }] },
        ],
      };
      const html = renderHtml(doc([table]));
      expect(html).not.toContain("<thead>");
      expect(html).toContain("<tbody>");
      expect(html).toContain("<td>X</td>");
    });

    it("renders table with id", () => {
      const table: NTable = {
        type: "table",
        header: false,
        align: undefined,
        rows: [{ cells: [{ content: [text("V")] }] }],
        id: "t1",
      };
      const html = renderHtml(doc([table]));
      expect(html).toContain('<table id="t1">');
    });
  });

  describe("URL scheme sanitization", () => {
    it("blocks javascript: in links", () => {
      const html = renderHtml(doc([
        { type: "paragraph", content: [
          { type: "link", label: [{ type: "text", value: "click" }], target: "javascript:alert(1)" }
        ] }
      ]));
      expect(html).not.toContain('href="javascript:');
      expect(html).toContain('href="#"');
    });

    it("blocks data: in links", () => {
      const html = renderHtml(doc([
        { type: "paragraph", content: [
          { type: "link", label: [{ type: "text", value: "click" }], target: "data:text/html,test" }
        ] }
      ]));
      expect(html).not.toContain('href="data:');
    });

    it("allows https: links", () => {
      const html = renderHtml(doc([
        { type: "paragraph", content: [
          { type: "link", label: [{ type: "text", value: "click" }], target: "https://example.com" }
        ] }
      ]));
      expect(html).toContain('href="https://example.com"');
    });

    it("allows relative links", () => {
      const html = renderHtml(doc([
        { type: "paragraph", content: [
          { type: "link", label: [{ type: "text", value: "docs" }], target: "/docs/intro" }
        ] }
      ]));
      expect(html).toContain('href="/docs/intro"');
    });

    it("allows anchor links", () => {
      const html = renderHtml(doc([
        { type: "paragraph", content: [
          { type: "link", label: [{ type: "text", value: "sec" }], target: "#overview" }
        ] }
      ]));
      expect(html).toContain('href="#overview"');
    });

    it("blocks javascript: in figure src", () => {
      const html = renderHtml(doc([
        { type: "figure", src: "javascript:alert(1)", blocks: [] }
      ]));
      expect(html).not.toContain('src="javascript:');
    });
  });
});
