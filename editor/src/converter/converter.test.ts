import { describe, it, expect, vi } from "vitest";
import type { CSTNode } from "../parser/types";
import { convertDocument } from "./converter";

/** Helper to build a minimal CSTNode. */
function node(
  type: string,
  text: string,
  children: CSTNode[] = [],
  overrides: Partial<CSTNode> = {}
): CSTNode {
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
    ...overrides,
  };
}

describe("convertDocument", () => {
  it("returns empty array for empty document", async () => {
    const doc = node("document", "");
    const result = await convertDocument(doc);
    expect(result).toEqual([]);
  });

  it("converts a document with heading + paragraph to 2 blocks", async () => {
    const doc = node("document", "# Title\n\nHello", [
      node("heading", "# Title", [
        node("heading_marker", "#"),
        node("inline_content", "Title", [node("text", "Title")]),
      ]),
      node("paragraph", "Hello", [
        node("paragraph_line", "Hello", [
          node("inline_content", "Hello", [node("text", "Hello")]),
        ]),
      ]),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("clnHeading");
    expect(result[1].type).toBe("clnParagraph");
  });

  it("skips bom nodes", async () => {
    const doc = node("document", "\uFEFF# Title", [
      node("bom", "\uFEFF"),
      node("heading", "# Title", [
        node("heading_marker", "#"),
        node("inline_content", "Title", [node("text", "Title")]),
      ]),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnHeading");
  });

  it("skips unnamed nodes", async () => {
    const doc = node("document", "# Title\n\n", [
      node("heading", "# Title", [
        node("heading_marker", "#"),
        node("inline_content", "Title", [node("text", "Title")]),
      ]),
      // Anonymous whitespace-like node
      node("", "\n\n", [], { isNamed: false }),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnHeading");
  });

  it("expands lists into multiple blocks", async () => {
    const doc = node("document", "- a\n- b\n- c", [
      node("unordered_list", "- a\n- b\n- c", [
        node("unordered_list_item", "- a", [
          node("inline_content", "a", [node("text", "a")]),
        ]),
        node("unordered_list_item", "- b", [
          node("inline_content", "b", [node("text", "b")]),
        ]),
        node("unordered_list_item", "- c", [
          node("inline_content", "c", [node("text", "c")]),
        ]),
      ]),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(3);
    expect(result.every((b) => b.type === "clnUnorderedList")).toBe(true);
  });

  it("passes options (parseFn) through to block converter", async () => {
    const mockParseFn = vi.fn(async (_source: string) =>
      node("document", "inner", [
        node("paragraph", "inner", [
          node("paragraph_line", "inner", [
            node("inline_content", "inner", [node("text", "inner")]),
          ]),
        ]),
      ])
    );

    const doc = node("document", '::callout[kind="info"]{\ninner\n}', [
      node("block_directive_with_body", '::callout[kind="info"]{\ninner\n}', [
        node("directive_marker", "::"),
        node("directive_name", "callout"),
        node("attribute_list", '[kind="info"]', [
          node("attribute", 'kind="info"', [
            node("attribute_key", "kind"),
            node("value", '"info"', [
              node("string", '"info"', [node("string_content", "info")]),
            ]),
          ]),
        ]),
        node("directive_body_content", "inner"),
      ]),
    ]);

    const result = await convertDocument(doc, { parseFn: mockParseFn });
    expect(mockParseFn).toHaveBeenCalledWith("inner");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].type).toBe("clnParagraph");
  });
});
