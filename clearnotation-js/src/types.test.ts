import { describe, it, expect } from "vitest";
import type {
  NText,
  NCodeSpan,
  NStrong,
  NEmphasis,
  NLink,
  NNote,
  NRef,
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
  NTable,
  NSourceBlock,
  NormalizedInline,
  NormalizedBlock,
  NormalizedDocument,
} from "./types";

describe("Normalized AST types", () => {
  it("NText has correct shape", () => {
    const node: NText = { type: "text", value: "hello" };
    expect(node.type).toBe("text");
    expect(node.value).toBe("hello");
  });

  it("NCodeSpan has correct shape", () => {
    const node: NCodeSpan = { type: "code_span", value: "x = 1" };
    expect(node.type).toBe("code_span");
  });

  it("NStrong wraps children", () => {
    const node: NStrong = {
      type: "strong",
      children: [{ type: "text", value: "bold" }],
    };
    expect(node.children).toHaveLength(1);
  });

  it("NEmphasis wraps children", () => {
    const node: NEmphasis = {
      type: "emphasis",
      children: [{ type: "text", value: "italic" }],
    };
    expect(node.children).toHaveLength(1);
  });

  it("NLink has label and target", () => {
    const node: NLink = {
      type: "link",
      label: [{ type: "text", value: "click" }],
      target: "https://example.com",
    };
    expect(node.target).toBe("https://example.com");
  });

  it("NNote has number and children", () => {
    const node: NNote = {
      type: "note",
      children: [{ type: "text", value: "a footnote" }],
      number: 1,
    };
    expect(node.number).toBe(1);
  });

  it("NRef has target", () => {
    const node: NRef = { type: "ref", target: "some-id" };
    expect(node.target).toBe("some-id");
  });

  it("NHeading has level, id, and content", () => {
    const node: NHeading = {
      type: "heading",
      level: 2,
      id: "introduction",
      content: [{ type: "text", value: "Introduction" }],
    };
    expect(node.level).toBe(2);
    expect(node.id).toBe("introduction");
  });

  it("NParagraph has optional id", () => {
    const node: NParagraph = {
      type: "paragraph",
      content: [{ type: "text", value: "text" }],
    };
    expect(node.id).toBeUndefined();
  });

  it("NThematicBreak has no extra fields", () => {
    const node: NThematicBreak = { type: "thematic_break" };
    expect(node.type).toBe("thematic_break");
  });

  it("NBlockQuote holds lines of inlines", () => {
    const node: NBlockQuote = {
      type: "blockquote",
      lines: [[{ type: "text", value: "quoted" }]],
    };
    expect(node.lines).toHaveLength(1);
  });

  it("NOrderedList holds NOrderedItems", () => {
    const node: NOrderedList = {
      type: "ordered_list",
      items: [{ ordinal: 1, content: [{ type: "text", value: "first" }], blocks: [] }],
    };
    expect(node.items[0].ordinal).toBe(1);
  });

  it("NCallout has kind, title, compact, and blocks", () => {
    const node: NCallout = {
      type: "callout",
      kind: "warning",
      title: "Watch out",
      compact: false,
      blocks: [],
    };
    expect(node.kind).toBe("warning");
  });

  it("NTable has header, align, and rows", () => {
    const node: NTable = {
      type: "table",
      header: true,
      align: ["left", "center"],
      rows: [{ cells: [{ content: [{ type: "text", value: "A" }] }] }],
    };
    expect(node.header).toBe(true);
    expect(node.rows).toHaveLength(1);
  });

  it("NSourceBlock has language and text", () => {
    const node: NSourceBlock = {
      type: "source_block",
      language: "python",
      text: "print('hello')",
    };
    expect(node.language).toBe("python");
  });

  it("NormalizedInline discriminated union works", () => {
    const inline: NormalizedInline = { type: "text", value: "hi" };
    if (inline.type === "text") {
      expect(inline.value).toBe("hi");
    }
  });

  it("NormalizedBlock discriminated union works", () => {
    const block: NormalizedBlock = { type: "thematic_break" };
    expect(block.type).toBe("thematic_break");
  });

  it("NormalizedDocument has meta, blocks, and notes", () => {
    const doc: NormalizedDocument = {
      meta: { title: "Test" },
      blocks: [{ type: "thematic_break" }],
      notes: [],
    };
    expect(doc.meta.title).toBe("Test");
    expect(doc.blocks).toHaveLength(1);
  });
});
