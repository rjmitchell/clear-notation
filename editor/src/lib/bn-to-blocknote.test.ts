import { describe, it, expect } from "vitest";
import { bnBlocksToBlockNote } from "./bn-to-blocknote";
import type { BNBlock } from "../converter/types";

/** Helper to build a minimal BNBlock. */
function block(
  type: string,
  props: Record<string, any> = {},
  content: any[] = [],
  children: BNBlock[] = []
): BNBlock {
  return { type, props, content, children };
}

function text(t: string, styles: Record<string, boolean | string> = {}) {
  return { type: "text" as const, text: t, styles };
}

describe("bnBlocksToBlockNote", () => {
  /* ─── Block type mapping ─── */

  it("maps clnHeading to heading with level", () => {
    const result = bnBlocksToBlockNote([
      block("clnHeading", { level: 2 }, [text("Title")]),
    ]);
    expect(result).toEqual([
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Title", styles: {} }],
        children: [],
      },
    ]);
  });

  it("maps clnParagraph to paragraph", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [text("Hello world")]),
    ]);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].content[0].text).toBe("Hello world");
  });

  it("maps clnUnorderedList to bulletListItem", () => {
    const result = bnBlocksToBlockNote([
      block("clnUnorderedList", {}, [text("item")]),
    ]);
    expect(result[0].type).toBe("bulletListItem");
  });

  it("maps clnOrderedList to numberedListItem", () => {
    const result = bnBlocksToBlockNote([
      block("clnOrderedList", { startNumber: 3 }, [text("item")]),
    ]);
    expect(result[0].type).toBe("numberedListItem");
    expect(result[0].props.startNumber).toBe(3);
  });

  it("maps clnCodeBlock to codeBlock with code as content", () => {
    const result = bnBlocksToBlockNote([
      block("clnCodeBlock", { language: "python", code: "print('hi')" }),
    ]);
    expect(result[0].type).toBe("codeBlock");
    expect(result[0].props.language).toBe("python");
    expect(result[0].content).toEqual([
      { type: "text", text: "print('hi')", styles: {} },
    ]);
  });

  it("maps unknown CLN types to paragraph as fallback", () => {
    const result = bnBlocksToBlockNote([
      block("clnUnknownDirective", {}, [text("note")]),
    ]);
    expect(result[0].type).toBe("paragraph");
  });

  /* ─── Style mapping ─── */

  it("maps clnStrong to bold", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [text("bold", { clnStrong: true })]),
    ]);
    expect(result[0].content[0].styles).toEqual({ bold: true });
  });

  it("maps clnEmphasis to italic", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [text("em", { clnEmphasis: true })]),
    ]);
    expect(result[0].content[0].styles).toEqual({ italic: true });
  });

  it("maps clnCode to code", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [text("mono", { clnCode: true })]),
    ]);
    expect(result[0].content[0].styles).toEqual({ code: true });
  });

  /* ─── Links ─── */

  it("passes through links with style mapping", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [
        {
          type: "link" as const,
          href: "https://example.com",
          content: [text("click", { clnStrong: true })],
        },
      ]),
    ]);
    expect(result[0].content[0]).toEqual({
      type: "link",
      href: "https://example.com",
      content: [{ type: "text", text: "click", styles: { bold: true } }],
    });
  });

  /* ─── Children ─── */

  it("recursively converts children", () => {
    const result = bnBlocksToBlockNote([
      block(
        "clnUnorderedList",
        {},
        [text("parent")],
        [block("clnUnorderedList", {}, [text("child")])]
      ),
    ]);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].type).toBe("bulletListItem");
    expect(result[0].children[0].content[0].text).toBe("child");
  });

  /* ─── Empty inputs ─── */

  it("returns empty array for empty input", () => {
    expect(bnBlocksToBlockNote([])).toEqual([]);
  });

  it("handles code block with empty code", () => {
    const result = bnBlocksToBlockNote([
      block("clnCodeBlock", { language: "js", code: "" }),
    ]);
    expect(result[0].content).toEqual([]);
  });
});

describe("bn-to-blocknote — anchorId prop forwarding", () => {
  it("forwards non-empty anchorId on a heading block", () => {
    const result = bnBlocksToBlockNote([
      block("clnHeading", { level: 1, anchorId: "intro" }, [text("Title")]),
    ]);
    expect(result[0].props.anchorId).toBe("intro");
  });

  it("forwards anchorId on a paragraph block", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", { anchorId: "section-1" }, [text("prose")]),
    ]);
    expect(result[0].props.anchorId).toBe("section-1");
  });

  it("omits anchorId when empty string", () => {
    const result = bnBlocksToBlockNote([
      block("clnHeading", { level: 1, anchorId: "" }, [text("Title")]),
    ]);
    expect(result[0].props.anchorId).toBeUndefined();
  });

  it("omits anchorId when absent", () => {
    const result = bnBlocksToBlockNote([
      block("clnHeading", { level: 1 }, [text("Title")]),
    ]);
    expect(result[0].props.anchorId).toBeUndefined();
  });
});

describe("bn-to-blocknote — ref inline content", () => {
  it("maps { type: 'ref', target } to a clnRef BlockNote custom inline content node", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [{ type: "ref", target: "intro" }]),
    ]);
    expect(result[0].content[0]).toEqual({
      type: "clnRef",
      props: { target: "intro" },
    });
  });
});

describe("bn-to-blocknote — note inline content", () => {
  it("maps { type: 'note', content } to a clnNote BlockNote custom inline content node with nested content", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [
        {
          type: "note",
          content: [text("footnote")],
        },
      ]),
    ]);
    expect(result[0].content[0]).toEqual({
      type: "clnNote",
      props: {},
      content: [{ type: "text", text: "footnote", styles: {} }],
    });
  });

  it("preserves nested ref inside note", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [
        {
          type: "note",
          content: [text("See "), { type: "ref", target: "intro" }],
        },
      ]),
    ]);
    expect(result[0].content[0]).toEqual({
      type: "clnNote",
      props: {},
      content: [
        { type: "text", text: "See ", styles: {} },
        { type: "clnRef", props: { target: "intro" } },
      ],
    });
  });

  it("preserves styled content inside note (bold)", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [
        {
          type: "note",
          content: [text("important", { clnStrong: true })],
        },
      ]),
    ]);
    // The inner clnStrong style should map to bold via STYLE_REVERSE
    expect(result[0].content[0]).toEqual({
      type: "clnNote",
      props: {},
      content: [{ type: "text", text: "important", styles: { bold: true } }],
    });
  });
});

describe("bn-to-blocknote — clnBlockquote mapping", () => {
  it("maps clnBlockquote to the 'quote' BlockNote type", () => {
    const result = bnBlocksToBlockNote([
      block("clnBlockquote", {}, [text("quoted")]),
    ]);
    expect(result[0].type).toBe("quote");
  });
});

describe("bn-to-blocknote — directive block types", () => {
  it("passes through clnTable with all props", () => {
    const tableData = JSON.stringify([["A", "B"], ["1", "2"]]);
    const result = bnBlocksToBlockNote([
      block("clnTable", { header: true, tableData, align: "left, right" }),
    ]);
    expect(result[0].type).toBe("clnTable");
    expect(result[0].props.header).toBe(true);
    expect(result[0].props.tableData).toBe(tableData);
    expect(result[0].props.align).toBe("left, right");
  });

  it("passes through clnMath with rawContent", () => {
    const result = bnBlocksToBlockNote([
      block("clnMath", { rawContent: "E = mc^2" }),
    ]);
    expect(result[0].type).toBe("clnMath");
    expect(result[0].props.rawContent).toBe("E = mc^2");
  });

  it("passes through clnFigure with src", () => {
    const result = bnBlocksToBlockNote([
      block("clnFigure", { src: "images/arch.svg" }),
    ]);
    expect(result[0].type).toBe("clnFigure");
    expect(result[0].props.src).toBe("images/arch.svg");
  });

  it("passes through clnSource with language and rawContent", () => {
    const result = bnBlocksToBlockNote([
      block("clnSource", { language: "python", rawContent: "print('hi')" }),
    ]);
    expect(result[0].type).toBe("clnSource");
    expect(result[0].props.language).toBe("python");
    expect(result[0].props.rawContent).toBe("print('hi')");
  });

  it("passes through clnCallout with kind and title", () => {
    const result = bnBlocksToBlockNote([
      block("clnCallout", { kind: "warning", title: "Heads up" }),
    ]);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.kind).toBe("warning");
    expect(result[0].props.title).toBe("Heads up");
  });

  it("extracts text content into rawContent for parsed-mode directives", () => {
    const result = bnBlocksToBlockNote([
      block("clnCallout", { kind: "info" }, [text("Body text here")]),
    ]);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.rawContent).toBe("Body text here");
    expect(result[0].content).toEqual([]);
  });

  it("preserves rawContent if already present (raw-mode directives)", () => {
    const result = bnBlocksToBlockNote([
      block("clnMath", { rawContent: "x^2" }),
    ]);
    expect(result[0].props.rawContent).toBe("x^2");
  });
});
