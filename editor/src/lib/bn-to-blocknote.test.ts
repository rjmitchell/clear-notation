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
      block("clnCallout", {}, [text("note")]),
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

  it("drops clnNote and clnRef styles", () => {
    const result = bnBlocksToBlockNote([
      block("clnParagraph", {}, [
        text("annotated", { clnNote: true, clnRef: true, clnStrong: true }),
      ]),
    ]);
    expect(result[0].content[0].styles).toEqual({ bold: true });
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
