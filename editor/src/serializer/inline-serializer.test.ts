import { describe, it, expect } from "vitest";
import { serializeInline } from "./inline-serializer";
import type { BNInlineContent, BNStyledText, BNLink } from "../converter/types";

/** Helper: plain text span with no styles. */
function text(t: string, styles: Record<string, boolean | string> = {}): BNStyledText {
  return { type: "text", text: t, styles };
}

/** Helper: link item. */
function link(href: string, content: BNStyledText[]): BNLink {
  return { type: "link", href, content };
}

describe("serializeInline", () => {
  it("returns empty string for empty content", () => {
    expect(serializeInline([])).toBe("");
  });

  it("serializes plain text", () => {
    expect(serializeInline([text("hello")])).toBe("hello");
  });

  it("escapes special characters in plain text", () => {
    expect(serializeInline([text("a { b")])).toBe("a \\{ b");
  });

  it("serializes strong text", () => {
    expect(serializeInline([text("bold", { clnStrong: true })])).toBe("+{bold}");
  });

  it("serializes emphasis text", () => {
    expect(serializeInline([text("italic", { clnEmphasis: true })])).toBe("*{italic}");
  });

  it("serializes code text", () => {
    expect(serializeInline([text("code", { clnCode: true })])).toBe("`code`");
  });

  it("serializes code inside strong", () => {
    expect(
      serializeInline([text("code", { clnStrong: true, clnCode: true })])
    ).toBe("+{`code`}");
  });

  it("serializes a link", () => {
    expect(
      serializeInline([link("/docs", [text("docs")])])
    ).toBe("[docs -> /docs]");
  });

  it("serializes a link with styled label", () => {
    expect(
      serializeInline([
        link("/api", [text("API", { clnStrong: true }), text(" ref")]),
      ])
    ).toBe("[+{API} ref -> /api]");
  });

  it("serializes a ref", () => {
    const input: BNInlineContent[] = [{ type: "ref", target: "intro" }];
    expect(serializeInline(input)).toBe('::ref[target="intro"]');
  });

  it("serializes a note", () => {
    const input: BNInlineContent[] = [
      { type: "note", content: [text("a note")] },
    ];
    expect(serializeInline(input)).toBe("^{a note}");
  });

  it("serializes a note with nested link", () => {
    const input: BNInlineContent[] = [
      {
        type: "note",
        content: [
          text("see "),
          link("/docs", [text("docs")]),
        ],
      },
    ];
    expect(serializeInline(input)).toBe("^{see [docs -> /docs]}");
  });

  it("serializes mixed content: plain + bold + plain", () => {
    expect(
      serializeInline([
        text("Hello "),
        text("world", { clnStrong: true }),
        text("!"),
      ])
    ).toBe("Hello +{world}!");
  });

  it("serializes note with strong and code", () => {
    const input: BNInlineContent[] = [
      {
        type: "note",
        content: [
          text("key", { clnStrong: true }),
          text(" is "),
          text("val", { clnCode: true }),
        ],
      },
    ];
    expect(serializeInline(input)).toBe("^{+{key} is `val`}");
  });

  it("groups consecutive items sharing the same mark", () => {
    expect(
      serializeInline([
        text("a", { clnStrong: true }),
        text("b", { clnStrong: true }),
        text("c", { clnStrong: true }),
      ])
    ).toBe("+{abc}");
  });

  it("serializes strong then emphasis as separate groups", () => {
    expect(
      serializeInline([
        text("bold", { clnStrong: true }),
        text("italic", { clnEmphasis: true }),
      ])
    ).toBe("+{bold}*{italic}");
  });

  it("serializes nested strong inside emphasis", () => {
    // Priority is outermost first: clnStrong > clnEmphasis > clnCode.
    // So if both strong and emphasis are set, strong is outermost.
    expect(
      serializeInline([text("both", { clnStrong: true, clnEmphasis: true })])
    ).toBe("+{*{both}}");
  });

  it("serializes multiple links in a row", () => {
    expect(
      serializeInline([
        link("/a", [text("A")]),
        text(" and "),
        link("/b", [text("B")]),
      ])
    ).toBe("[A -> /a] and [B -> /b]");
  });

  it("handles text with only special characters", () => {
    expect(serializeInline([text("{}[]")])).toBe("\\{\\}\\[\\]");
  });
});

describe("inline-serializer — structured note/ref", () => {
  it("serializes { type: 'ref', target } to ::ref[target=\"x\"]", () => {
    const input: BNInlineContent[] = [{ type: "ref", target: "intro" }];
    expect(serializeInline(input)).toBe('::ref[target="intro"]');
  });

  it("serializes { type: 'note', content } to ^{content}", () => {
    const input: BNInlineContent[] = [
      {
        type: "note",
        content: [{ type: "text", text: "simple note", styles: {} }],
      },
    ];
    expect(serializeInline(input)).toBe("^{simple note}");
  });

  it("serializes a note with nested ref", () => {
    const input: BNInlineContent[] = [
      {
        type: "note",
        content: [
          { type: "text", text: "See ", styles: {} },
          { type: "ref", target: "intro" },
          { type: "text", text: " for details", styles: {} },
        ],
      },
    ];
    expect(serializeInline(input)).toBe(
      '^{See ::ref[target="intro"] for details}'
    );
  });

  it("serializes a note with nested bold", () => {
    const input: BNInlineContent[] = [
      {
        type: "note",
        content: [
          { type: "text", text: "important", styles: { clnStrong: true } },
        ],
      },
    ];
    expect(serializeInline(input)).toBe("^{+{important}}");
  });

  it("escapes double quotes in ref target", () => {
    const input: BNInlineContent[] = [
      { type: "ref", target: 'weird"id' },
    ];
    expect(serializeInline(input)).toBe('::ref[target="weird\\"id"]');
  });
});
