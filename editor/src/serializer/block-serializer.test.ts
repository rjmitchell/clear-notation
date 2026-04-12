import { describe, it, expect } from "vitest";
import { serializeBlock } from "./block-serializer";
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

describe("serializeBlock", () => {
  // ═══════════════════════════════════════════════════════════════
  // Core blocks
  // ═══════════════════════════════════════════════════════════════

  describe("clnHeading", () => {
    it("serializes h1", () => {
      expect(
        serializeBlock(block("clnHeading", { level: 1 }, [text("Title")]))
      ).toBe("# Title");
    });

    it("serializes h3", () => {
      expect(
        serializeBlock(block("clnHeading", { level: 3 }, [text("Sub")]))
      ).toBe("### Sub");
    });
  });

  describe("clnParagraph", () => {
    it("serializes paragraph", () => {
      expect(
        serializeBlock(block("clnParagraph", {}, [text("Hello world.")]))
      ).toBe("Hello world.");
    });

    it("serializes empty paragraph", () => {
      expect(serializeBlock(block("clnParagraph"))).toBe("");
    });
  });

  describe("clnCodeBlock", () => {
    it("serializes code block with language", () => {
      expect(
        serializeBlock(
          block("clnCodeBlock", { language: "js", code: "const x = 1;" })
        )
      ).toBe("```js\nconst x = 1;\n```");
    });

    it("serializes code block with multi-line code", () => {
      expect(
        serializeBlock(
          block("clnCodeBlock", {
            language: "python",
            code: "def foo():\n    return 42",
          })
        )
      ).toBe("```python\ndef foo():\n    return 42\n```");
    });
  });

  describe("clnThematicBreak", () => {
    it("serializes thematic break", () => {
      expect(serializeBlock(block("clnThematicBreak"))).toBe("---");
    });
  });

  describe("clnUnorderedList", () => {
    it("serializes unordered list item", () => {
      expect(
        serializeBlock(block("clnUnorderedList", {}, [text("Item")]))
      ).toBe("- Item");
    });

    it("serializes nested unordered list", () => {
      const child = block("clnUnorderedList", {}, [text("child")]);
      expect(
        serializeBlock(block("clnUnorderedList", {}, [text("parent")], [child]))
      ).toBe("- parent\n  - child");
    });

    it("serializes unordered list with paragraph continuation", () => {
      const child = block("clnParagraph", {}, [text("continuation")]);
      expect(
        serializeBlock(block("clnUnorderedList", {}, [text("item")], [child]))
      ).toBe("- item\n\n  continuation");
    });

    it("serializes deeply nested unordered list", () => {
      const grandchild = block("clnUnorderedList", {}, [text("grandchild")]);
      const child = block("clnUnorderedList", {}, [text("child")], [grandchild]);
      expect(
        serializeBlock(block("clnUnorderedList", {}, [text("parent")], [child]))
      ).toBe("- parent\n  - child\n    - grandchild");
    });

    it("serializes flat unordered list with no children unchanged", () => {
      expect(
        serializeBlock(block("clnUnorderedList", {}, [text("Item")], []))
      ).toBe("- Item");
    });
  });

  describe("clnOrderedList", () => {
    it("serializes ordered list item with default number", () => {
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 1 }, [text("First")]))
      ).toBe("1. First");
    });

    it("serializes ordered list item with custom number", () => {
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 5 }, [text("Fifth")]))
      ).toBe("5. Fifth");
    });

    it("serializes ordered list with nested unordered list", () => {
      const child = block("clnUnorderedList", {}, [text("bullet")]);
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 1 }, [text("item")], [child]))
      ).toBe("1. item\n  - bullet");
    });

    it("serializes ordered list with paragraph continuation", () => {
      const child = block("clnParagraph", {}, [text("continuation")]);
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 1 }, [text("item")], [child]))
      ).toBe("1. item\n\n   continuation");
    });

    it("serializes ordered list with paragraph continuation (double-digit number)", () => {
      const child = block("clnParagraph", {}, [text("continuation")]);
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 10 }, [text("item")], [child]))
      ).toBe("10. item\n\n    continuation");
    });

    it("serializes flat ordered list with no children unchanged", () => {
      expect(
        serializeBlock(block("clnOrderedList", { startNumber: 2 }, [text("Second")], []))
      ).toBe("2. Second");
    });
  });

  describe("clnComment", () => {
    it("serializes comment block with text", () => {
      expect(
        serializeBlock(block("clnComment", { text: "hello" }))
      ).toBe("// hello");
    });

    it("serializes comment block with empty text", () => {
      expect(
        serializeBlock(block("clnComment", { text: "" }))
      ).toBe("// ");
    });

    it("serializes comment block with no text prop", () => {
      expect(
        serializeBlock(block("clnComment"))
      ).toBe("// ");
    });
  });

  describe("clnBlockquote", () => {
    it("serializes single-line blockquote", () => {
      expect(
        serializeBlock(block("clnBlockquote", {}, [text("Quote text")]))
      ).toBe("> Quote text");
    });
  });

  describe("clnMeta", () => {
    it("serializes meta block with entries", () => {
      expect(
        serializeBlock(
          block("clnMeta", {
            entries: JSON.stringify({ title: "My Doc", draft: true }),
          })
        )
      ).toBe('::meta{\ntitle = "My Doc"\ndraft = true\n}');
    });

    it("serializes meta block with number", () => {
      expect(
        serializeBlock(
          block("clnMeta", { entries: JSON.stringify({ version: 2 }) })
        )
      ).toBe("::meta{\nversion = 2\n}");
    });

    it("serializes meta block with array", () => {
      expect(
        serializeBlock(
          block("clnMeta", {
            entries: JSON.stringify({ tags: ["a", "b"] }),
          })
        )
      ).toBe('::meta{\ntags = ["a", "b"]\n}');
    });

    it("serializes empty meta block", () => {
      expect(
        serializeBlock(block("clnMeta", { entries: "{}" }))
      ).toBe("::meta{\n}");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Directive blocks
  // ═══════════════════════════════════════════════════════════════

  describe("directive: none body mode", () => {
    it("serializes toc directive", () => {
      expect(serializeBlock(block("clnToc"))).toBe("::toc");
    });

    it("serializes include directive", () => {
      expect(
        serializeBlock(block("clnInclude", { src: "header.cln" }))
      ).toBe('::include[src="header.cln"]');
    });
  });

  describe("directive: raw body mode", () => {
    it("serializes math directive", () => {
      expect(
        serializeBlock(block("clnMath", { rawContent: "E = mc^2" }))
      ).toBe("::math{\nE = mc^2\n}");
    });

    it("serializes source directive with language", () => {
      expect(
        serializeBlock(
          block("clnSource", { language: "rust", rawContent: "fn main() {}" })
        )
      ).toBe('::source[language="rust"]{\nfn main() {}\n}');
    });
  });

  describe("directive: table", () => {
    it("serializes table with rows", () => {
      const tableData = JSON.stringify([
        ["Name", "Age"],
        ["Alice", "30"],
      ]);
      expect(
        serializeBlock(block("clnTable", { header: true, tableData }))
      ).toBe("::table[header=true]{\nName | Age\nAlice | 30\n}");
    });

    it("serializes table with pipe in cell", () => {
      const tableData = JSON.stringify([["a | b", "c"]]);
      expect(
        serializeBlock(block("clnTable", { tableData }))
      ).toBe("::table{\na \\| b | c\n}");
    });

    it("serializes empty table", () => {
      expect(
        serializeBlock(block("clnTable", { tableData: "[]" }))
      ).toBe("::table{\n}");
    });
  });

  describe("directive: parsed body mode", () => {
    it("serializes callout with children", () => {
      const child = block("clnParagraph", {}, [text("Be careful!")]);
      expect(
        serializeBlock(
          block("clnCallout", { kind: "warning" }, [], [child])
        )
      ).toBe('::callout[kind="warning"]{\nBe careful!\n}');
    });

    it("serializes callout with optional attrs at default values (skipped)", () => {
      const child = block("clnParagraph", {}, [text("Note text")]);
      // compact=false is the default — should be skipped
      expect(
        serializeBlock(
          block("clnCallout", { kind: "info", compact: false }, [], [child])
        )
      ).toBe('::callout[kind="info"]{\nNote text\n}');
    });

    it("serializes callout with non-default optional attr", () => {
      const child = block("clnParagraph", {}, [text("Compact note")]);
      expect(
        serializeBlock(
          block("clnCallout", { kind: "tip", compact: true }, [], [child])
        )
      ).toBe('::callout[kind="tip" compact=true]{\nCompact note\n}');
    });

    it("serializes figure directive", () => {
      const child = block("clnParagraph", {}, [text("Caption text")]);
      expect(
        serializeBlock(
          block("clnFigure", { src: "photo.png" }, [], [child])
        )
      ).toBe('::figure[src="photo.png"]{\nCaption text\n}');
    });

    it("serializes empty parsed body", () => {
      expect(
        serializeBlock(
          block("clnCallout", { kind: "note" }, [], [])
        )
      ).toBe('::callout[kind="note"]{\n}');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // parseError blocks
  // ═══════════════════════════════════════════════════════════════

  describe("parseError blocks", () => {
    it("emits raw text as-is", () => {
      const b: BNBlock = {
        type: "clnParagraph",
        props: { rawContent: "some broken :: syntax" },
        content: [],
        children: [],
        parseError: true,
      };
      expect(serializeBlock(b)).toBe("some broken :: syntax");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Anchor prefix emission
  // ═══════════════════════════════════════════════════════════════

  describe("anchor prefix emission", () => {
    it("emits ::anchor[id=\"x\"] before a heading with non-empty anchorId", () => {
      const b = block("clnHeading", { level: 1, anchorId: "intro" }, [text("Introduction")]);
      expect(serializeBlock(b)).toBe('::anchor[id="intro"]\n# Introduction');
    });

    it("emits ::anchor before a paragraph with anchorId", () => {
      const b = block("clnParagraph", { anchorId: "section-1" }, [text("Some prose")]);
      expect(serializeBlock(b)).toBe('::anchor[id="section-1"]\nSome prose');
    });

    it("emits ::anchor before a blockquote with anchorId", () => {
      const b = block("clnBlockquote", { anchorId: "q1" }, [text("A quote")]);
      expect(serializeBlock(b)).toBe('::anchor[id="q1"]\n> A quote');
    });

    it("does NOT emit anchor line when anchorId is empty string", () => {
      const b = block("clnHeading", { level: 1, anchorId: "" }, [text("Title")]);
      expect(serializeBlock(b)).toBe("# Title");
    });

    it("does NOT emit anchor line when anchorId is absent", () => {
      const b = block("clnHeading", { level: 1 }, [text("Title")]);
      expect(serializeBlock(b)).toBe("# Title");
    });

    it("escapes double quotes in anchor id", () => {
      const b = block("clnHeading", { level: 1, anchorId: 'with"quote' }, [text("H")]);
      expect(serializeBlock(b)).toBe('::anchor[id="with\\"quote"]\n# H');
    });
  });
});
