import { describe, it, expect } from "vitest";
import {
  clnHeadingBlockSpec,
  clnParagraphBlockSpec,
  clnCodeBlockSpec,
  clnUnorderedListBlockSpec,
  clnOrderedListBlockSpec,
  clnBlockquoteBlockSpec,
  clnThematicBreakBlockSpec,
  clnMetaBlockSpec,
  CORE_BLOCK_SPECS,
} from "./core-blocks";

describe("Core block specs", () => {
  it("exports all 8 core block types", () => {
    expect(Object.keys(CORE_BLOCK_SPECS)).toHaveLength(8);
  });

  it("heading spec has level prop with default 1", () => {
    const spec = clnHeadingBlockSpec;
    expect(spec.type).toBe("clnHeading");
    expect(spec.propSchema.level.default).toBe(1);
    expect(spec.content).toBe("inline");
  });

  it("paragraph spec has inline content", () => {
    const spec = clnParagraphBlockSpec;
    expect(spec.type).toBe("clnParagraph");
    expect(spec.content).toBe("inline");
  });

  it("code block spec has language prop and no inline content", () => {
    const spec = clnCodeBlockSpec;
    expect(spec.type).toBe("clnCodeBlock");
    expect(spec.propSchema.language.default).toBe("");
    expect(spec.content).toBe("none");
  });

  it("unordered list spec has inline content", () => {
    const spec = clnUnorderedListBlockSpec;
    expect(spec.type).toBe("clnUnorderedList");
    expect(spec.content).toBe("inline");
  });

  it("ordered list spec has inline content and startNumber prop", () => {
    const spec = clnOrderedListBlockSpec;
    expect(spec.type).toBe("clnOrderedList");
    expect(spec.propSchema.startNumber.default).toBe(1);
    expect(spec.content).toBe("inline");
  });

  it("blockquote spec has inline content", () => {
    const spec = clnBlockquoteBlockSpec;
    expect(spec.type).toBe("clnBlockquote");
    expect(spec.content).toBe("inline");
  });

  it("thematic break spec has no content", () => {
    const spec = clnThematicBreakBlockSpec;
    expect(spec.type).toBe("clnThematicBreak");
    expect(spec.content).toBe("none");
  });

  it("meta block spec has entries prop", () => {
    const spec = clnMetaBlockSpec;
    expect(spec.type).toBe("clnMeta");
    expect(spec.propSchema.entries.default).toBe("{}");
    expect(spec.content).toBe("none");
  });

  it("all specs have a valid type name", () => {
    for (const [key, spec] of Object.entries(CORE_BLOCK_SPECS)) {
      expect(spec.type).toBe(key);
      expect(spec.type).toMatch(/^cln[A-Z]/);
    }
  });
});
