import { describe, it, expect } from "vitest";
import { serializeDocument } from "./serializer";
import type { BNBlock, BNStyledText } from "../converter/types";

/** Helper: create a block with defaults. */
function block(
  type: string,
  props: Record<string, string | number | boolean> = {},
  content: BNStyledText[] = [],
  children: BNBlock[] = []
): BNBlock {
  return { type, props, content, children };
}

/** Helper: plain text span. */
function text(t: string): BNStyledText {
  return { type: "text", text: t, styles: {} };
}

describe("serializeDocument", () => {
  it("returns empty string for empty document", () => {
    expect(serializeDocument([])).toBe("");
  });

  it("serializes single paragraph", () => {
    expect(
      serializeDocument([block("clnParagraph", {}, [text("Hello.")])])
    ).toBe("Hello.\n");
  });

  it("serializes heading + paragraph with blank line between", () => {
    expect(
      serializeDocument([
        block("clnHeading", { level: 1 }, [text("Title")]),
        block("clnParagraph", {}, [text("Body.")]),
      ])
    ).toBe("# Title\n\nBody.\n");
  });

  it("joins consecutive unordered list items with single newlines", () => {
    expect(
      serializeDocument([
        block("clnUnorderedList", {}, [text("A")]),
        block("clnUnorderedList", {}, [text("B")]),
        block("clnUnorderedList", {}, [text("C")]),
      ])
    ).toBe("- A\n- B\n- C\n");
  });

  it("joins consecutive ordered list items with single newlines", () => {
    expect(
      serializeDocument([
        block("clnOrderedList", { startNumber: 1 }, [text("First")]),
        block("clnOrderedList", { startNumber: 2 }, [text("Second")]),
      ])
    ).toBe("1. First\n2. Second\n");
  });

  it("puts blank line between list and non-list", () => {
    expect(
      serializeDocument([
        block("clnUnorderedList", {}, [text("A")]),
        block("clnParagraph", {}, [text("Text.")]),
      ])
    ).toBe("- A\n\nText.\n");
  });

  it("puts blank line between different list types", () => {
    expect(
      serializeDocument([
        block("clnUnorderedList", {}, [text("Bullet")]),
        block("clnOrderedList", { startNumber: 1 }, [text("Numbered")]),
      ])
    ).toBe("- Bullet\n\n1. Numbered\n");
  });

  it("serializes parseError blocks with raw text", () => {
    const errorBlock: BNBlock = {
      type: "clnParagraph",
      props: { rawContent: "some broken :: syntax" },
      content: [],
      children: [],
      parseError: true,
    };
    expect(serializeDocument([errorBlock])).toBe("some broken :: syntax\n");
  });

  it("serializes multiple blocks with correct separation", () => {
    expect(
      serializeDocument([
        block("clnHeading", { level: 2 }, [text("Section")]),
        block("clnParagraph", {}, [text("Intro paragraph.")]),
        block("clnUnorderedList", {}, [text("Point one")]),
        block("clnUnorderedList", {}, [text("Point two")]),
        block("clnParagraph", {}, [text("Conclusion.")]),
      ])
    ).toBe(
      "## Section\n\nIntro paragraph.\n\n- Point one\n- Point two\n\nConclusion.\n"
    );
  });

  it("serializes thematic break between paragraphs", () => {
    expect(
      serializeDocument([
        block("clnParagraph", {}, [text("Before.")]),
        block("clnThematicBreak"),
        block("clnParagraph", {}, [text("After.")]),
      ])
    ).toBe("Before.\n\n---\n\nAfter.\n");
  });
});
