import { describe, it, expect } from "vitest";
import type { CSTNode } from "../parser/types";
import { convertInline } from "./inline-converter";

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

// ── plain text ──────────────────────────────────────────────

describe("convertInline — plain text", () => {
  it("converts a text node to BNStyledText", () => {
    const result = convertInline(node("text", "hello"));
    expect(result).toEqual([
      { type: "text", text: "hello", styles: {} },
    ]);
  });

  it("converts styled_text the same as text", () => {
    const result = convertInline(node("styled_text", "world"));
    expect(result).toEqual([
      { type: "text", text: "world", styles: {} },
    ]);
  });

  it("converts note_text the same as text", () => {
    const result = convertInline(node("note_text", "a note"));
    expect(result).toEqual([
      { type: "text", text: "a note", styles: {} },
    ]);
  });

  it("converts link_text the same as text", () => {
    const result = convertInline(node("link_text", "click me"));
    expect(result).toEqual([
      { type: "text", text: "click me", styles: {} },
    ]);
  });

  it("inherits active styles", () => {
    const result = convertInline(node("text", "bold"), {
      clnStrong: true,
    });
    expect(result).toEqual([
      { type: "text", text: "bold", styles: { clnStrong: true } },
    ]);
  });
});

// ── escape sequences ────────────────────────────────────────

describe("convertInline — escape sequences", () => {
  it("converts \\{ to {", () => {
    const result = convertInline(node("escape_sequence", "\\{"));
    expect(result).toEqual([
      { type: "text", text: "{", styles: {} },
    ]);
  });

  it("converts \\} to }", () => {
    const result = convertInline(node("escape_sequence", "\\}"));
    expect(result).toEqual([
      { type: "text", text: "}", styles: {} },
    ]);
  });

  it("converts \\+ to +", () => {
    const result = convertInline(node("escape_sequence", "\\+"));
    expect(result).toEqual([
      { type: "text", text: "+", styles: {} },
    ]);
  });

  it("inherits active styles on escapes", () => {
    const result = convertInline(node("escape_sequence", "\\*"), {
      clnEmphasis: true,
    });
    expect(result).toEqual([
      { type: "text", text: "*", styles: { clnEmphasis: true } },
    ]);
  });
});

// ── strong ──────────────────────────────────────────────────

describe("convertInline — strong", () => {
  it("applies clnStrong style to child text", () => {
    const strong = node("strong", "+{bold text}", [
      node("strong_open", "+{"),
      node("styled_text", "bold text"),
      node("styled_close", "}"),
    ]);
    const result = convertInline(strong);
    expect(result).toEqual([
      { type: "text", text: "bold text", styles: { clnStrong: true } },
    ]);
  });

  it("stacks with existing styles", () => {
    const strong = node("strong", "+{inner}", [
      node("strong_open", "+{"),
      node("styled_text", "inner"),
      node("styled_close", "}"),
    ]);
    const result = convertInline(strong, { clnEmphasis: true });
    expect(result).toEqual([
      {
        type: "text",
        text: "inner",
        styles: { clnEmphasis: true, clnStrong: true },
      },
    ]);
  });
});

// ── emphasis ────────────────────────────────────────────────

describe("convertInline — emphasis", () => {
  it("applies clnEmphasis style to child text", () => {
    const em = node("emphasis", "*{italic}", [
      node("emphasis_open", "*{"),
      node("styled_text", "italic"),
      node("styled_close", "}"),
    ]);
    const result = convertInline(em);
    expect(result).toEqual([
      { type: "text", text: "italic", styles: { clnEmphasis: true } },
    ]);
  });
});

// ── code_span ───────────────────────────────────────────────

describe("convertInline — code span", () => {
  it("extracts code content with clnCode style", () => {
    const code = node("code_span", "`foo()`", [
      node("code_span_delimiter", "`"),
      node("code_span_content", "foo()"),
      node("code_span_delimiter", "`"),
    ]);
    const result = convertInline(code);
    expect(result).toEqual([
      { type: "text", text: "foo()", styles: { clnCode: true } },
    ]);
  });

  it("stacks with parent styles", () => {
    const code = node("code_span", "`val`", [
      node("code_span_delimiter", "`"),
      node("code_span_content", "val"),
      node("code_span_delimiter", "`"),
    ]);
    const result = convertInline(code, { clnStrong: true });
    expect(result).toEqual([
      {
        type: "text",
        text: "val",
        styles: { clnStrong: true, clnCode: true },
      },
    ]);
  });
});

// ── delimiter skipping ──────────────────────────────────────

describe("convertInline — delimiter skipping", () => {
  it("skips strong_open", () => {
    expect(convertInline(node("strong_open", "+{"))).toEqual([]);
  });

  it("skips styled_close", () => {
    expect(convertInline(node("styled_close", "}"))).toEqual([]);
  });

  it("skips note_open", () => {
    expect(convertInline(node("note_open", "^{"))).toEqual([]);
  });

  it("skips emphasis_open", () => {
    expect(convertInline(node("emphasis_open", "*{"))).toEqual([]);
  });

  it("skips link_separator", () => {
    expect(convertInline(node("link_separator", "->"))).toEqual([]);
  });

  it("skips code_span_delimiter", () => {
    expect(convertInline(node("code_span_delimiter", "`"))).toEqual([]);
  });
});

// ── container nodes (inline_content, etc.) ──────────────────

describe("convertInline — container passthrough", () => {
  it("recurses into inline_content children", () => {
    const container = node("inline_content", "hello world", [
      node("text", "hello "),
      node("text", "world"),
    ]);
    const result = convertInline(container);
    expect(result).toEqual([
      { type: "text", text: "hello ", styles: {} },
      { type: "text", text: "world", styles: {} },
    ]);
  });

  it("handles nested strong in inline_content", () => {
    const container = node("inline_content", "a +{b} c", [
      node("text", "a "),
      node("strong", "+{b}", [
        node("strong_open", "+{"),
        node("styled_text", "b"),
        node("styled_close", "}"),
      ]),
      node("text", " c"),
    ]);
    const result = convertInline(container);
    expect(result).toEqual([
      { type: "text", text: "a ", styles: {} },
      { type: "text", text: "b", styles: { clnStrong: true } },
      { type: "text", text: " c", styles: {} },
    ]);
  });
});

// ── links ───────────────────────────────────────────────────

describe("convertInline — links", () => {
  it("converts a simple link [docs -> /docs]", () => {
    const link = node("link", "[docs -> /docs]", [
      node("link_open", "["),
      node("link_label", "docs", [
        node("link_text", "docs"),
      ]),
      node("link_separator", "->"),
      node("link_target", "/docs"),
      node("link_close", "]"),
    ]);
    const result = convertInline(link);
    expect(result).toEqual([
      {
        type: "link",
        href: "/docs",
        content: [{ type: "text", text: "docs", styles: {} }],
      },
    ]);
  });

  it("converts a link with styled label [+{API} ref -> /api]", () => {
    const link = node("link", "[+{API} ref -> /api]", [
      node("link_open", "["),
      node("link_label", "+{API} ref", [
        node("strong", "+{API}", [
          node("strong_open", "+{"),
          node("styled_text", "API"),
          node("styled_close", "}"),
        ]),
        node("link_text", " ref"),
      ]),
      node("link_separator", "->"),
      node("link_target", "/api"),
      node("link_close", "]"),
    ]);
    const result = convertInline(link);
    expect(result).toEqual([
      {
        type: "link",
        href: "/api",
        content: [
          { type: "text", text: "API", styles: { clnStrong: true } },
          { type: "text", text: " ref", styles: {} },
        ],
      },
    ]);
  });

  it("preserves parent styles on link content", () => {
    // A link nested inside a note: ^{See [guide -> /g].}
    // The note wraps the link, so link content inherits clnNote
    const link = node("link", "[guide -> /g]", [
      node("link_open", "["),
      node("link_label", "guide", [
        node("link_text", "guide"),
      ]),
      node("link_separator", "->"),
      node("link_target", "/g"),
      node("link_close", "]"),
    ]);
    const result = convertInline(link, { clnNote: true });
    expect(result).toEqual([
      {
        type: "link",
        href: "/g",
        content: [{ type: "text", text: "guide", styles: { clnNote: true } }],
      },
    ]);
  });
});

// ── inline refs ─────────────────────────────────────────────

describe("convertInline — inline refs", () => {
  it("converts ::ref[target=\"intro\"] to styled text with clnRef", () => {
    const ref = node("inline_directive", "::ref[target=\"intro\"]", [
      node("directive_marker", "::"),
      node("directive_name", "ref"),
      node("attribute_list", "[target=\"intro\"]", [
        node("attribute", "target=\"intro\"", [
          node("attribute_key", "target"),
          node("value", "\"intro\"", [
            node("string", "\"intro\"", [
              node("string_content", "intro"),
            ]),
          ]),
        ]),
      ]),
    ]);
    const result = convertInline(ref);
    expect(result).toEqual([
      {
        type: "text",
        text: "intro",
        styles: { clnRef: "intro" },
      },
    ]);
  });

  it("preserves parent styles on ref", () => {
    const ref = node("inline_directive", "::ref[target=\"sec1\"]", [
      node("directive_marker", "::"),
      node("directive_name", "ref"),
      node("attribute_list", "[target=\"sec1\"]", [
        node("attribute", "target=\"sec1\"", [
          node("attribute_key", "target"),
          node("value", "\"sec1\"", [
            node("string", "\"sec1\"", [
              node("string_content", "sec1"),
            ]),
          ]),
        ]),
      ]),
    ]);
    const result = convertInline(ref, { clnStrong: true });
    expect(result).toEqual([
      {
        type: "text",
        text: "sec1",
        styles: { clnStrong: true, clnRef: "sec1" },
      },
    ]);
  });
});

// ── notes ───────────────────────────────────────────────────

describe("convertInline — notes", () => {
  it("converts a simple note ^{a note}", () => {
    const note = node("note", "^{a note}", [
      node("note_open", "^{"),
      node("note_text", "a note"),
      node("note_close", "}"),
    ]);
    const result = convertInline(note);
    expect(result).toEqual([
      { type: "text", text: "a note", styles: { clnNote: true } },
    ]);
  });

  it("converts a note with nested link ^{See [guide -> /g].}", () => {
    const note = node("note", "^{See [guide -> /g].}", [
      node("note_open", "^{"),
      node("note_text", "See "),
      node("link", "[guide -> /g]", [
        node("link_open", "["),
        node("link_label", "guide", [
          node("link_text", "guide"),
        ]),
        node("link_separator", "->"),
        node("link_target", "/g"),
        node("link_close", "]"),
      ]),
      node("note_text", "."),
      node("note_close", "}"),
    ]);
    const result = convertInline(note);
    expect(result).toEqual([
      { type: "text", text: "See ", styles: { clnNote: true } },
      {
        type: "link",
        href: "/g",
        content: [
          { type: "text", text: "guide", styles: { clnNote: true } },
        ],
      },
      { type: "text", text: ".", styles: { clnNote: true } },
    ]);
  });

  it("converts a note with strong and code ^{+{key} is `val`}", () => {
    const note = node("note", "^{+{key} is `val`}", [
      node("note_open", "^{"),
      node("strong", "+{key}", [
        node("strong_open", "+{"),
        node("styled_text", "key"),
        node("styled_close", "}"),
      ]),
      node("note_text", " is "),
      node("code_span", "`val`", [
        node("code_span_delimiter", "`"),
        node("code_span_content", "val"),
        node("code_span_delimiter", "`"),
      ]),
      node("note_close", "}"),
    ]);
    const result = convertInline(note);
    expect(result).toEqual([
      {
        type: "text",
        text: "key",
        styles: { clnNote: true, clnStrong: true },
      },
      { type: "text", text: " is ", styles: { clnNote: true } },
      {
        type: "text",
        text: "val",
        styles: { clnNote: true, clnCode: true },
      },
    ]);
  });
});
