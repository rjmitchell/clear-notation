import { describe, it, expect } from "vitest";
import {
  findChildByType,
  findChildrenByType,
  getDirectiveName,
  getHeadingLevel,
  getAttributeMap,
  getBodyText,
  hasErrorDescendant,
} from "./cst-utils";
import type { CSTNode } from "./types";

function makeNode(
  type: string,
  text: string,
  children: CSTNode[] = []
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
  };
}

describe("findChildByType", () => {
  it("finds first matching child", () => {
    const node = makeNode("heading", "# Hello\n", [
      makeNode("heading_marker", "#"),
      makeNode("inline_content", "Hello"),
    ]);
    const result = findChildByType(node, "heading_marker");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("heading_marker");
  });

  it("returns null when not found", () => {
    const node = makeNode("heading", "# Hello\n");
    expect(findChildByType(node, "code_span")).toBeNull();
  });
});

describe("findChildrenByType", () => {
  it("finds all matching children", () => {
    const node = makeNode("paragraph", "a b c\n", [
      makeNode("paragraph_line", "a"),
      makeNode("paragraph_line", "b"),
      makeNode("paragraph_line", "c"),
    ]);
    const results = findChildrenByType(node, "paragraph_line");
    expect(results).toHaveLength(3);
  });

  it("returns empty array when none found", () => {
    const node = makeNode("document", "");
    expect(findChildrenByType(node, "heading")).toHaveLength(0);
  });
});

describe("getDirectiveName", () => {
  it("extracts directive name", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "toc"),
    ]);
    expect(getDirectiveName(node)).toBe("toc");
  });

  it("returns null if no directive_name child", () => {
    const node = makeNode("paragraph", "hello");
    expect(getDirectiveName(node)).toBeNull();
  });
});

describe("getHeadingLevel", () => {
  it("returns level 1 for #", () => {
    const node = makeNode("heading", "# Title\n", [
      makeNode("heading_marker", "#"),
    ]);
    expect(getHeadingLevel(node)).toBe(1);
  });

  it("returns level 3 for ###", () => {
    const node = makeNode("heading", "### Sub\n", [
      makeNode("heading_marker", "###"),
    ]);
    expect(getHeadingLevel(node)).toBe(3);
  });

  it("returns level 6 for ######", () => {
    const node = makeNode("heading", "###### Deep\n", [
      makeNode("heading_marker", "######"),
    ]);
    expect(getHeadingLevel(node)).toBe(6);
  });

  it("returns 0 if no heading_marker", () => {
    const node = makeNode("paragraph", "not a heading");
    expect(getHeadingLevel(node)).toBe(0);
  });
});

describe("getAttributeMap", () => {
  it("extracts key-value attributes", () => {
    const attrList = makeNode("attribute_list", '[kind="info"]', [
      makeNode("attribute", 'kind="info"', [
        makeNode("attribute_key", "kind"),
        makeNode("value", '"info"', [
          makeNode("string", '"info"', [
            makeNode("string_content", "info"),
          ]),
        ]),
      ]),
    ]);
    const node = makeNode("block_directive_self_closing", '::callout[kind="info"]', [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "callout"),
      attrList,
    ]);

    const attrs = getAttributeMap(node);
    expect(attrs).toEqual({ kind: "info" });
  });

  it("handles boolean attributes", () => {
    const attrList = makeNode("attribute_list", "[header=true]", [
      makeNode("attribute", "header=true", [
        makeNode("attribute_key", "header"),
        makeNode("value", "true", [
          makeNode("boolean", "true"),
        ]),
      ]),
    ]);
    const node = makeNode("block_directive_with_body", "::table[header=true]{", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "table"),
      attrList,
    ]);

    const attrs = getAttributeMap(node);
    expect(attrs).toEqual({ header: true });
  });

  it("returns empty map for no attributes", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n", [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "toc"),
    ]);
    expect(getAttributeMap(node)).toEqual({});
  });
});

describe("getBodyText", () => {
  it("extracts directive body content text", () => {
    const node = makeNode("block_directive_with_body", '::callout[kind="info"]{\nbody text\n}', [
      makeNode("directive_marker", "::"),
      makeNode("directive_name", "callout"),
      makeNode("directive_body_open", "{"),
      makeNode("directive_body_content", "body text\n"),
      makeNode("block_close", "}"),
    ]);
    expect(getBodyText(node)).toBe("body text\n");
  });

  it("returns empty string for no body", () => {
    const node = makeNode("block_directive_self_closing", "::toc\n");
    expect(getBodyText(node)).toBe("");
  });
});

describe("hasErrorDescendant", () => {
  it("returns false for clean tree", () => {
    const node = makeNode("document", "# Hello\n");
    expect(hasErrorDescendant(node)).toBe(false);
  });

  it("returns true when node has error", () => {
    const node: CSTNode = {
      ...makeNode("document", "bad"),
      hasError: true,
    };
    expect(hasErrorDescendant(node)).toBe(true);
  });

  it("returns true when descendant has error", () => {
    const child: CSTNode = {
      ...makeNode("paragraph", "bad"),
      hasError: true,
    };
    const node = makeNode("document", "bad", [child]);
    expect(hasErrorDescendant(node)).toBe(true);
  });
});
