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

// ── anchor fold CST builders ─────────────────────────────────

function anchorDirective(id: string): CSTNode {
  return node("block_directive_self_closing", `::anchor[id="${id}"]`, [
    node("directive_marker", "::"),
    node("directive_name", "anchor"),
    node("attribute_list", `[id="${id}"]`, [
      node("attribute", `id="${id}"`, [
        node("attribute_key", "id"),
        node("value", `"${id}"`, [
          node("string", `"${id}"`, [node("string_content", id)]),
        ]),
      ]),
    ]),
  ]);
}

function headingNode(level: number, text: string): CSTNode {
  const marker = "#".repeat(level);
  return node("heading", `${marker} ${text}`, [
    node("heading_marker", marker),
    node("inline_content", text, [node("text", text)]),
  ]);
}

function paragraphNode(text: string): CSTNode {
  return node("paragraph", text, [
    node("paragraph_line", text, [
      node("inline_content", text, [node("text", text)]),
    ]),
  ]);
}

function thematicBreakNode(): CSTNode {
  return node("thematic_break", "---");
}

function makeDoc(children: CSTNode[]): CSTNode {
  return node("document", "", children);
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

// ═══════════════════════════════════════════════════════════════
// Task 7: anchor fold
// ═══════════════════════════════════════════════════════════════

describe("convertDocument — anchor fold", () => {
  it("folds anchor into the next heading's anchorId prop", async () => {
    const doc = makeDoc([
      anchorDirective("intro"),
      headingNode(1, "Introduction"),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnHeading");
    expect(result[0].props.anchorId).toBe("intro");
  });

  it("folds anchor into the next paragraph's anchorId prop", async () => {
    const doc = makeDoc([
      anchorDirective("section-1"),
      paragraphNode("Some prose"),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnParagraph");
    expect(result[0].props.anchorId).toBe("section-1");
  });

  it("drops duplicate anchors before one block (first wins)", async () => {
    const doc = makeDoc([
      anchorDirective("first"),
      anchorDirective("second"),
      headingNode(1, "Heading"),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].props.anchorId).toBe("first");
  });

  it("drops anchor at EOF with no following block", async () => {
    const doc = makeDoc([
      headingNode(1, "Heading"),
      anchorDirective("orphan"),
    ]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].props.anchorId).toBeUndefined();
  });

  it("persists anchor past thematic break until next addressable block", async () => {
    const doc = makeDoc([
      anchorDirective("keep"),
      thematicBreakNode(),
      paragraphNode("target"),
    ]);
    const result = await convertDocument(doc);
    // Thematic break emits clnThematicBreak (not addressable), so
    // pendingAnchor persists and attaches to the following paragraph.
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("clnThematicBreak");
    expect(result[0].props.anchorId).toBeUndefined();
    expect(result[1].type).toBe("clnParagraph");
    expect(result[1].props.anchorId).toBe("keep");
  });

  it("no anchor → block has no anchorId prop", async () => {
    const doc = makeDoc([headingNode(1, "Heading")]);
    const result = await convertDocument(doc);
    expect(result).toHaveLength(1);
    expect(result[0].props.anchorId).toBeUndefined();
  });
});
