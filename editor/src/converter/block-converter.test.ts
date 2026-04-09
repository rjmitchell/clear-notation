import { describe, it, expect, vi } from "vitest";
import type { CSTNode } from "../parser/types";
import { convertBlock } from "./block-converter";

/** Helper to build a minimal CSTNode. */
function node(type: string, text: string, children: CSTNode[] = []): CSTNode {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    isNamed: true,
    hasError: false,
    children,
    fieldName: null,
  };
}

/** Shorthand for an error node. */
function errorNode(type: string, text: string, children: CSTNode[] = []): CSTNode {
  return { ...node(type, text, children), hasError: true };
}

// ═══════════════════════════════════════════════════════════════
// Task 4: headings, paragraphs, code blocks, thematic breaks
// ═══════════════════════════════════════════════════════════════

describe("convertBlock — heading", () => {
  it("converts a level 1 heading", async () => {
    const heading = node("heading", "# Hello", [
      node("heading_marker", "#"),
      node("inline_content", "Hello", [
        node("text", "Hello"),
      ]),
    ]);
    const result = await convertBlock(heading);
    expect(result).toEqual([
      {
        type: "clnHeading",
        props: { level: 1 },
        content: [{ type: "text", text: "Hello", styles: {} }],
        children: [],
      },
    ]);
  });

  it("converts a level 3 heading", async () => {
    const heading = node("heading", "### Sub", [
      node("heading_marker", "###"),
      node("inline_content", "Sub", [
        node("text", "Sub"),
      ]),
    ]);
    const result = await convertBlock(heading);
    expect(result).toHaveLength(1);
    expect(result[0].props.level).toBe(3);
  });

  it("converts heading with inline styles", async () => {
    const heading = node("heading", "## +{Bold} title", [
      node("heading_marker", "##"),
      node("inline_content", "+{Bold} title", [
        node("strong", "+{Bold}", [
          node("strong_open", "+{"),
          node("styled_text", "Bold"),
          node("styled_close", "}"),
        ]),
        node("text", " title"),
      ]),
    ]);
    const result = await convertBlock(heading);
    expect(result[0].content).toEqual([
      { type: "text", text: "Bold", styles: { clnStrong: true } },
      { type: "text", text: " title", styles: {} },
    ]);
  });
});

describe("convertBlock — paragraph", () => {
  it("converts a single-line paragraph", async () => {
    const para = node("paragraph", "Hello world", [
      node("paragraph_line", "Hello world", [
        node("inline_content", "Hello world", [
          node("text", "Hello world"),
        ]),
      ]),
    ]);
    const result = await convertBlock(para);
    expect(result).toEqual([
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "Hello world", styles: {} }],
        children: [],
      },
    ]);
  });

  it("joins multi-line paragraph with newline text nodes", async () => {
    const para = node("paragraph", "line1\nline2", [
      node("paragraph_line", "line1", [
        node("inline_content", "line1", [node("text", "line1")]),
      ]),
      node("paragraph_line", "line2", [
        node("inline_content", "line2", [node("text", "line2")]),
      ]),
    ]);
    const result = await convertBlock(para);
    expect(result[0].content).toEqual([
      { type: "text", text: "line1", styles: {} },
      { type: "text", text: "\n", styles: {} },
      { type: "text", text: "line2", styles: {} },
    ]);
  });
});

describe("convertBlock — fenced code block", () => {
  it("converts a code block with language and content", async () => {
    const code = node("fenced_code_block", "```js\nconsole.log(1)\n```", [
      node("language_tag", "js"),
      node("code_block_content", "console.log(1)\n"),
    ]);
    const result = await convertBlock(code);
    expect(result).toEqual([
      {
        type: "clnCodeBlock",
        props: { language: "js", code: "console.log(1)\n" },
        content: [],
        children: [],
      },
    ]);
  });

  it("handles empty code block", async () => {
    const code = node("fenced_code_block", "```py\n```", [
      node("language_tag", "py"),
    ]);
    const result = await convertBlock(code);
    expect(result[0].props).toEqual({ language: "py", code: "" });
  });
});

describe("convertBlock — thematic break", () => {
  it("converts a thematic break", async () => {
    const hr = node("thematic_break", "---");
    const result = await convertBlock(hr);
    expect(result).toEqual([
      { type: "clnThematicBreak", props: {}, content: [], children: [] },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 5: lists, blockquotes, meta
// ═══════════════════════════════════════════════════════════════

describe("convertBlock — unordered list", () => {
  it("converts 2 list items to 2 blocks", async () => {
    const list = node("unordered_list", "- a\n- b", [
      node("unordered_list_item", "- a", [
        node("inline_content", "a", [node("text", "a")]),
      ]),
      node("unordered_list_item", "- b", [
        node("inline_content", "b", [node("text", "b")]),
      ]),
    ]);
    const result = await convertBlock(list);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "a", styles: {} }],
      children: [],
    });
    expect(result[1]).toEqual({
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "b", styles: {} }],
      children: [],
    });
  });
});

describe("convertBlock — ordered list", () => {
  it("converts ordered list items with start numbers", async () => {
    const list = node("ordered_list", "1. first\n2. second", [
      node("ordered_list_item", "1. first", [
        node("ordered_list_marker", "1. "),
        node("inline_content", "first", [node("text", "first")]),
      ]),
      node("ordered_list_item", "2. second", [
        node("ordered_list_marker", "2. "),
        node("inline_content", "second", [node("text", "second")]),
      ]),
    ]);
    const result = await convertBlock(list);
    expect(result).toHaveLength(2);
    expect(result[0].props.startNumber).toBe(1);
    expect(result[1].props.startNumber).toBe(2);
    expect(result[0].content).toEqual([
      { type: "text", text: "first", styles: {} },
    ]);
  });

  it("handles non-sequential start numbers", async () => {
    const list = node("ordered_list", "5. five", [
      node("ordered_list_item", "5. five", [
        node("ordered_list_marker", "5. "),
        node("inline_content", "five", [node("text", "five")]),
      ]),
    ]);
    const result = await convertBlock(list);
    expect(result[0].props.startNumber).toBe(5);
  });

  it("converts ordered list items with strong text", async () => {
    const list = node("ordered_list", "1. +{Performance} -- details", [
      node("ordered_list_item", "1. +{Performance} -- details", [
        node("ordered_list_marker", "1. "),
        node("inline_content", "+{Performance} -- details", [
          node("strong", "+{Performance}", [
            node("strong_open", "+{"),
            node("styled_text", "Performance"),
            node("styled_close", "}"),
          ]),
          node("text", " -- details"),
        ]),
      ]),
    ]);
    const result = await convertBlock(list);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual([
      { type: "text", text: "Performance", styles: { clnStrong: true } },
      { type: "text", text: " -- details", styles: {} },
    ]);
  });
});

describe("convertBlock — blockquote", () => {
  it("converts a single-line blockquote", async () => {
    const bq = node("blockquote", "> hello", [
      node("blockquote_line", "> hello", [
        node("inline_content", "hello", [node("text", "hello")]),
      ]),
    ]);
    const result = await convertBlock(bq);
    expect(result).toEqual([
      {
        type: "clnBlockquote",
        props: {},
        content: [{ type: "text", text: "hello", styles: {} }],
        children: [],
      },
    ]);
  });

  it("joins multiple blockquote lines with newline", async () => {
    const bq = node("blockquote", "> line1\n> line2", [
      node("blockquote_line", "> line1", [
        node("inline_content", "line1", [node("text", "line1")]),
      ]),
      node("blockquote_line", "> line2", [
        node("inline_content", "line2", [node("text", "line2")]),
      ]),
    ]);
    const result = await convertBlock(bq);
    expect(result[0].content).toEqual([
      { type: "text", text: "line1", styles: {} },
      { type: "text", text: "\n", styles: {} },
      { type: "text", text: "line2", styles: {} },
    ]);
  });
});

describe("convertBlock — meta block", () => {
  it("converts meta with string and boolean entries", async () => {
    const meta = node("meta_block", '::meta{\ntitle = "Doc"\ndraft = true\n}', [
      node("meta_entry", 'title = "Doc"', [
        node("meta_key", "title"),
        node("value", '"Doc"', [
          node("string", '"Doc"', [
            node("string_content", "Doc"),
          ]),
        ]),
      ]),
      node("meta_entry", "draft = true", [
        node("meta_key", "draft"),
        node("value", "true", [
          node("boolean", "true"),
        ]),
      ]),
    ]);
    const result = await convertBlock(meta);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnMeta");
    const entries = JSON.parse(result[0].props.entries as string);
    expect(entries.title).toBe("Doc");
    expect(entries.draft).toBe(true);
  });

  it("converts meta with integer values", async () => {
    const meta = node("meta_block", "::meta{\nversion = 3\n}", [
      node("meta_entry", "version = 3", [
        node("meta_key", "version"),
        node("value", "3", [
          node("integer", "3"),
        ]),
      ]),
    ]);
    const result = await convertBlock(meta);
    const entries = JSON.parse(result[0].props.entries as string);
    expect(entries.version).toBe(3);
  });

  it("converts meta with array values", async () => {
    const meta = node("meta_block", '::meta{\ntags = ["a", "b"]\n}', [
      node("meta_entry", 'tags = ["a", "b"]', [
        node("meta_key", "tags"),
        node("value", '["a", "b"]', [
          node("array", '["a", "b"]', [
            node("string", '"a"', [node("string_content", "a")]),
            node("string", '"b"', [node("string_content", "b")]),
          ]),
        ]),
      ]),
    ]);
    const result = await convertBlock(meta);
    const entries = JSON.parse(result[0].props.entries as string);
    expect(entries.tags).toEqual(["a", "b"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Task 6: directives
// ═══════════════════════════════════════════════════════════════

describe("convertBlock — self-closing directives", () => {
  it("converts ::toc (void block, no attrs)", async () => {
    const toc = node("block_directive_self_closing", "::toc", [
      node("directive_marker", "::"),
      node("directive_name", "toc"),
    ]);
    const result = await convertBlock(toc);
    expect(result).toEqual([
      { type: "clnToc", props: {}, content: [], children: [] },
    ]);
  });

  it("converts ::anchor[id=\"top\"] with attribute", async () => {
    const anchor = node("block_directive_self_closing", '::anchor[id="top"]', [
      node("directive_marker", "::"),
      node("directive_name", "anchor"),
      node("attribute_list", '[id="top"]', [
        node("attribute", 'id="top"', [
          node("attribute_key", "id"),
          node("value", '"top"', [
            node("string", '"top"', [
              node("string_content", "top"),
            ]),
          ]),
        ]),
      ]),
    ]);
    const result = await convertBlock(anchor);
    expect(result).toEqual([
      { type: "clnAnchor", props: { id: "top" }, content: [], children: [] },
    ]);
  });

  it("falls back to paragraph for unknown self-closing directive", async () => {
    const unknown = node("block_directive_self_closing", "::unknown", [
      node("directive_marker", "::"),
      node("directive_name", "unknown"),
    ]);
    const result = await convertBlock(unknown);
    expect(result[0].type).toBe("clnParagraph");
    expect(result[0].content[0]).toEqual({
      type: "text",
      text: "::unknown",
      styles: {},
    });
  });
});

describe("convertBlock — raw-mode body directives", () => {
  it("converts ::math with rawContent", async () => {
    const math = node("block_directive_with_body", "::math{\nE = mc^2\n}", [
      node("directive_marker", "::"),
      node("directive_name", "math"),
      node("directive_body_content", "E = mc^2"),
    ]);
    const result = await convertBlock(math);
    expect(result).toEqual([
      {
        type: "clnMath",
        props: { rawContent: "E = mc^2" },
        content: [],
        children: [],
      },
    ]);
  });

  it("converts ::source[language=\"js\"] with rawContent and language prop", async () => {
    const source = node(
      "block_directive_with_body",
      '::source[language="js"]{\nconst x = 1;\n}',
      [
        node("directive_marker", "::"),
        node("directive_name", "source"),
        node("attribute_list", '[language="js"]', [
          node("attribute", 'language="js"', [
            node("attribute_key", "language"),
            node("value", '"js"', [
              node("string", '"js"', [
                node("string_content", "js"),
              ]),
            ]),
          ]),
        ]),
        node("directive_body_content", "const x = 1;"),
      ]
    );
    const result = await convertBlock(source);
    expect(result[0].type).toBe("clnSource");
    expect(result[0].props.language).toBe("js");
    expect(result[0].props.rawContent).toBe("const x = 1;");
  });

  it("converts ::table[header=true] with tableData", async () => {
    const table = node(
      "block_directive_with_body",
      "::table[header=true]{\nA | B\n1 | 2\n}",
      [
        node("directive_marker", "::"),
        node("directive_name", "table"),
        node("attribute_list", "[header=true]", [
          node("attribute", "header=true", [
            node("attribute_key", "header"),
            node("value", "true", [
              node("boolean", "true"),
            ]),
          ]),
        ]),
        node("directive_body_content", "A | B\n1 | 2"),
      ]
    );
    const result = await convertBlock(table);
    expect(result[0].type).toBe("clnTable");
    expect(result[0].props.header).toBe(true);
    const tableData = JSON.parse(result[0].props.tableData as string);
    expect(tableData).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });
});

describe("convertBlock — parsed-mode body directives", () => {
  it("converts ::callout without parseFn (text fallback)", async () => {
    const callout = node(
      "block_directive_with_body",
      '::callout[kind="info"]{\nSome body text\n}',
      [
        node("directive_marker", "::"),
        node("directive_name", "callout"),
        node("attribute_list", '[kind="info"]', [
          node("attribute", 'kind="info"', [
            node("attribute_key", "kind"),
            node("value", '"info"', [
              node("string", '"info"', [
                node("string_content", "info"),
              ]),
            ]),
          ]),
        ]),
        node("directive_body_content", "Some body text"),
      ]
    );
    const result = await convertBlock(callout);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.kind).toBe("info");
    // No parseFn — content is text fallback, children empty
    expect(result[0].content).toEqual([
      { type: "text", text: "Some body text", styles: {} },
    ]);
    expect(result[0].children).toEqual([]);
  });

  it("converts ::callout with parseFn (children blocks)", async () => {
    // Mock parseFn returns a document CST with one paragraph
    const mockParseFn = vi.fn(async (_source: string) =>
      node("document", "Warning text", [
        node("paragraph", "Warning text", [
          node("paragraph_line", "Warning text", [
            node("inline_content", "Warning text", [
              node("text", "Warning text"),
            ]),
          ]),
        ]),
      ])
    );

    const callout = node(
      "block_directive_with_body",
      '::callout[kind="warning"]{\nWarning text\n}',
      [
        node("directive_marker", "::"),
        node("directive_name", "callout"),
        node("attribute_list", '[kind="warning"]', [
          node("attribute", 'kind="warning"', [
            node("attribute_key", "kind"),
            node("value", '"warning"', [
              node("string", '"warning"', [
                node("string_content", "warning"),
              ]),
            ]),
          ]),
        ]),
        node("directive_body_content", "Warning text"),
      ]
    );

    const result = await convertBlock(callout, { parseFn: mockParseFn });
    expect(mockParseFn).toHaveBeenCalledWith("Warning text");
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.kind).toBe("warning");
    expect(result[0].content).toEqual([]); // parsed mode uses children, not content
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].type).toBe("clnParagraph");
    expect(result[0].children[0].content).toEqual([
      { type: "text", text: "Warning text", styles: {} },
    ]);
  });
});

describe("convertBlock — error nodes", () => {
  it("converts an error node to parseError block", async () => {
    const err = errorNode("ERROR", "broken }{");
    const result = await convertBlock(err);
    expect(result).toEqual([
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "broken }{", styles: {} }],
        children: [],
        parseError: true,
      },
    ]);
  });

  it("converts a node with hasError flag", async () => {
    const broken = errorNode("paragraph", "bad content", [
      node("paragraph_line", "bad content", [
        node("inline_content", "bad content", [node("text", "bad content")]),
      ]),
    ]);
    const result = await convertBlock(broken);
    expect(result[0].parseError).toBe(true);
  });
});
