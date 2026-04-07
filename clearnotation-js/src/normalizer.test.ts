import { describe, it, expect } from "vitest";
import { normalize } from "./normalizer";
import type { BNBlock } from "./normalizer";
import type {
  NHeading,
  NParagraph,
  NSourceBlock,
  NThematicBreak,
  NCallout,
  NMathBlock,
  NNote,
  NStrong,
  NText,
  NCodeSpan,
  NRef,
  NLink,
} from "./types";

/** Helper: create a minimal BNBlock. */
function block(
  type: string,
  content: BNBlock["content"] = [],
  props: BNBlock["props"] = {},
  children: BNBlock[] = [],
): BNBlock {
  return { type, content, props, children };
}

/** Helper: create a BNStyledText. */
function text(value: string, styles: Record<string, boolean | string> = {}) {
  return { type: "text" as const, text: value, styles };
}

/** Helper: create a BNLink. */
function link(href: string, content: BNBlock["content"]) {
  return { type: "link" as const, href, content: content as any };
}

describe("normalize", () => {
  describe("inline conversion", () => {
    it("converts plain text", () => {
      const doc = normalize([
        block("clnParagraph", [text("hello world")]),
      ]);
      const para = doc.blocks[0] as NParagraph;
      expect(para.type).toBe("paragraph");
      expect(para.content).toEqual([{ type: "text", value: "hello world" }]);
    });

    it("converts strong text", () => {
      const doc = normalize([
        block("clnParagraph", [text("bold", { clnStrong: true })]),
      ]);
      const para = doc.blocks[0] as NParagraph;
      expect(para.content).toEqual([
        { type: "strong", children: [{ type: "text", value: "bold" }] },
      ]);
    });

    it("converts code span", () => {
      const doc = normalize([
        block("clnParagraph", [text("x = 1", { clnCode: true })]),
      ]);
      const para = doc.blocks[0] as NParagraph;
      expect(para.content).toEqual([{ type: "code_span", value: "x = 1" }]);
    });

    it("converts ref", () => {
      const doc = normalize([
        block("clnParagraph", [text("sec-intro", { clnRef: true })]),
      ]);
      const para = doc.blocks[0] as NParagraph;
      expect(para.content).toEqual([{ type: "ref", target: "sec-intro" }]);
    });

    it("converts link", () => {
      const doc = normalize([
        block("clnParagraph", [
          link("https://example.com", [text("click here")]),
        ]),
      ]);
      const para = doc.blocks[0] as NParagraph;
      const lnk = para.content[0] as NLink;
      expect(lnk.type).toBe("link");
      expect(lnk.target).toBe("https://example.com");
      expect(lnk.label).toEqual([{ type: "text", value: "click here" }]);
    });
  });

  describe("note numbering", () => {
    it("assigns sequential note numbers", () => {
      const doc = normalize([
        block("clnParagraph", [
          text("first note", { clnNote: true }),
        ]),
        block("clnParagraph", [
          text("second note", { clnNote: true }),
        ]),
      ]);
      expect(doc.notes).toHaveLength(2);
      expect(doc.notes[0].number).toBe(1);
      expect(doc.notes[1].number).toBe(2);
    });

    it("handles nested strong inside note", () => {
      const doc = normalize([
        block("clnParagraph", [
          text("bold note", { clnNote: true, clnStrong: true }),
        ]),
      ]);
      const note = doc.notes[0];
      expect(note.type).toBe("note");
      // The note wraps a strong which wraps text
      expect(note.children).toEqual([
        { type: "strong", children: [{ type: "text", value: "bold note" }] },
      ]);
    });
  });

  describe("heading slugs", () => {
    it("generates slug from heading text", () => {
      const doc = normalize([
        block("clnHeading", [text("Hello World")], { level: 1 }),
      ]);
      const heading = doc.blocks[0] as NHeading;
      expect(heading.type).toBe("heading");
      expect(heading.id).toBe("hello-world");
      expect(heading.level).toBe(1);
    });

    it("deduplicates slug collisions", () => {
      const doc = normalize([
        block("clnHeading", [text("Intro")], { level: 2 }),
        block("clnHeading", [text("Intro")], { level: 2 }),
        block("clnHeading", [text("Intro")], { level: 2 }),
      ]);
      expect((doc.blocks[0] as NHeading).id).toBe("intro");
      expect((doc.blocks[1] as NHeading).id).toBe("intro-2");
      expect((doc.blocks[2] as NHeading).id).toBe("intro-3");
    });
  });

  describe("anchor id consumption", () => {
    it("applies pending anchor id to next block", () => {
      const doc = normalize([
        block("clnAnchor", [], { id: "custom-id" }),
        block("clnParagraph", [text("anchored text")]),
      ]);
      expect(doc.blocks).toHaveLength(1);
      const para = doc.blocks[0] as NParagraph;
      expect(para.id).toBe("custom-id");
    });

    it("applies anchor id to heading instead of slug", () => {
      const doc = normalize([
        block("clnAnchor", [], { id: "my-section" }),
        block("clnHeading", [text("Some Title")], { level: 1 }),
      ]);
      const heading = doc.blocks[0] as NHeading;
      expect(heading.id).toBe("my-section");
    });
  });

  describe("block types", () => {
    it("converts thematic break", () => {
      const doc = normalize([block("clnThematicBreak")]);
      expect(doc.blocks[0]).toEqual({ type: "thematic_break" });
    });

    it("converts code block", () => {
      const doc = normalize([
        block("clnCodeBlock", [], { language: "python", code: "print('hi')" }),
      ]);
      const src = doc.blocks[0] as NSourceBlock;
      expect(src.type).toBe("source_block");
      expect(src.language).toBe("python");
      expect(src.text).toBe("print('hi')");
    });

    it("converts callout with nested blocks", () => {
      const doc = normalize([
        block(
          "clnCallout",
          [],
          { kind: "warning", title: "Caution", compact: false },
          [block("clnParagraph", [text("Watch out")])],
        ),
      ]);
      const callout = doc.blocks[0] as NCallout;
      expect(callout.type).toBe("callout");
      expect(callout.kind).toBe("warning");
      expect(callout.title).toBe("Caution");
      expect(callout.blocks).toHaveLength(1);
      expect(callout.blocks[0].type).toBe("paragraph");
    });

    it("merges meta block into document meta without emitting", () => {
      const doc = normalize([
        block("clnMeta", [], { title: "My Doc", author: "Me" }),
        block("clnParagraph", [text("body")]),
      ]);
      expect(doc.blocks).toHaveLength(1);
      expect(doc.meta.title).toBe("My Doc");
      expect(doc.meta.author).toBe("Me");
    });

    it("skips include blocks", () => {
      const doc = normalize([
        block("clnInclude", [], { path: "other.cln" }),
        block("clnParagraph", [text("after include")]),
      ]);
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe("paragraph");
    });

    it("converts math block", () => {
      const doc = normalize([
        block("clnMath", [], { rawContent: "E = mc^2" }),
      ]);
      const math = doc.blocks[0] as NMathBlock;
      expect(math.type).toBe("math_block");
      expect(math.text).toBe("E = mc^2");
    });
  });
});
