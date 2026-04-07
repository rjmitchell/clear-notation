import { describe, it, expect } from "vitest";
import type {
  BNStyledText,
  BNLink,
  BNInlineContent,
  BNTableRow,
  BNTableContent,
  BNBlock,
  ConvertOptions,
} from "./types";

/** Helper to build a CSTNode-like object (for ConvertOptions type check). */
function fakeCSTNode() {
  return {
    type: "document",
    text: "",
    startIndex: 0,
    endIndex: 0,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    isNamed: true,
    hasError: false,
    children: [],
    fieldName: null,
  };
}

describe("BNStyledText", () => {
  it("represents plain text with no styles", () => {
    const t: BNStyledText = { type: "text", text: "hello", styles: {} };
    expect(t.type).toBe("text");
    expect(t.text).toBe("hello");
    expect(t.styles).toEqual({});
  });

  it("supports boolean styles", () => {
    const t: BNStyledText = {
      type: "text",
      text: "bold",
      styles: { clnStrong: true },
    };
    expect(t.styles.clnStrong).toBe(true);
  });

  it("supports string styles", () => {
    const t: BNStyledText = {
      type: "text",
      text: "ref",
      styles: { clnRef: "intro" },
    };
    expect(t.styles.clnRef).toBe("intro");
  });
});

describe("BNLink", () => {
  it("represents a link with styled content", () => {
    const link: BNLink = {
      type: "link",
      href: "/docs",
      content: [{ type: "text", text: "docs", styles: {} }],
    };
    expect(link.type).toBe("link");
    expect(link.href).toBe("/docs");
    expect(link.content).toHaveLength(1);
  });

  it("supports multiple styled text segments", () => {
    const link: BNLink = {
      type: "link",
      href: "/api",
      content: [
        { type: "text", text: "API", styles: { clnStrong: true } },
        { type: "text", text: " ref", styles: {} },
      ],
    };
    expect(link.content).toHaveLength(2);
    expect(link.content[0].styles.clnStrong).toBe(true);
  });
});

describe("BNInlineContent union", () => {
  it("discriminates on type field", () => {
    const items: BNInlineContent[] = [
      { type: "text", text: "hi", styles: {} },
      { type: "link", href: "/x", content: [] },
    ];
    expect(items[0].type).toBe("text");
    expect(items[1].type).toBe("link");
  });
});

describe("BNTableRow", () => {
  it("has cells as arrays of inline content", () => {
    const row: BNTableRow = {
      cells: [
        [{ type: "text", text: "A", styles: {} }],
        [{ type: "text", text: "B", styles: {} }],
      ],
    };
    expect(row.cells).toHaveLength(2);
    const firstCell = row.cells[0][0];
    expect(firstCell.type).toBe("text");
    expect((firstCell as BNStyledText).text).toBe("A");
  });
});

describe("BNTableContent", () => {
  it("wraps rows with a type discriminant", () => {
    const table: BNTableContent = {
      type: "tableContent",
      rows: [
        {
          cells: [[{ type: "text", text: "cell", styles: {} }]],
        },
      ],
    };
    expect(table.type).toBe("tableContent");
    expect(table.rows).toHaveLength(1);
  });
});

describe("BNBlock", () => {
  it("represents a minimal paragraph block", () => {
    const block: BNBlock = {
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: "hello", styles: {} }],
      children: [],
    };
    expect(block.type).toBe("paragraph");
    expect(block.content).toHaveLength(1);
    expect(block.children).toHaveLength(0);
  });

  it("supports optional id", () => {
    const block: BNBlock = {
      id: "abc-123",
      type: "heading",
      props: { level: 2 },
      content: [{ type: "text", text: "Title", styles: {} }],
      children: [],
    };
    expect(block.id).toBe("abc-123");
    expect(block.props.level).toBe(2);
  });

  it("supports optional parseError flag", () => {
    const block: BNBlock = {
      type: "paragraph",
      props: {},
      content: [],
      children: [],
      parseError: true,
    };
    expect(block.parseError).toBe(true);
  });

  it("supports nested children", () => {
    const child: BNBlock = {
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: "nested", styles: {} }],
      children: [],
    };
    const parent: BNBlock = {
      type: "bulletListItem",
      props: {},
      content: [],
      children: [child],
    };
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].content[0]).toEqual({
      type: "text",
      text: "nested",
      styles: {},
    });
  });

  it("supports mixed prop value types", () => {
    const block: BNBlock = {
      type: "codeBlock",
      props: { language: "typescript", lineNumbers: true, startLine: 1 },
      content: [],
      children: [],
    };
    expect(block.props.language).toBe("typescript");
    expect(block.props.lineNumbers).toBe(true);
    expect(block.props.startLine).toBe(1);
  });
});

describe("ConvertOptions", () => {
  it("accepts an optional parseFn", () => {
    const opts: ConvertOptions = {
      parseFn: async (source: string) => fakeCSTNode(),
    };
    expect(opts.parseFn).toBeDefined();
  });

  it("allows empty options", () => {
    const opts: ConvertOptions = {};
    expect(opts.parseFn).toBeUndefined();
  });
});
