import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSlashMenuItems,
  type SlashMenuItem,
} from "./slash-menu";

describe("buildSlashMenuItems", () => {
  let items: SlashMenuItem[];

  beforeAll(() => {
    items = buildSlashMenuItems();
  });

  it("returns items for all insertable block types", () => {
    // Core: heading (3 levels), paragraph, code block, unordered list,
    //        ordered list, blockquote, thematic break = 9
    // Directives: callout, figure, math, table, source, toc, anchor = 7
    // Excluded: meta (only one per doc, not from slash menu), include (unsupported in browser)
    expect(items.length).toBeGreaterThanOrEqual(15);
  });

  it("includes heading levels 1-3 as separate items", () => {
    const headings = items.filter((i) => i.blockType === "clnHeading");
    expect(headings.length).toBeGreaterThanOrEqual(3);

    const h1 = headings.find((h) => h.label === "Heading 1");
    expect(h1).toBeDefined();
    expect(h1!.props).toEqual({ level: 1 });

    const h2 = headings.find((h) => h.label === "Heading 2");
    expect(h2).toBeDefined();
    expect(h2!.props).toEqual({ level: 2 });

    const h3 = headings.find((h) => h.label === "Heading 3");
    expect(h3).toBeDefined();
    expect(h3!.props).toEqual({ level: 3 });
  });

  it("includes paragraph", () => {
    const para = items.find((i) => i.blockType === "clnParagraph");
    expect(para).toBeDefined();
    expect(para!.label).toBe("Paragraph");
  });

  it("includes code block", () => {
    const code = items.find((i) => i.blockType === "clnCodeBlock");
    expect(code).toBeDefined();
    expect(code!.label).toBe("Code Block");
  });

  it("includes callout with default kind", () => {
    const callout = items.find((i) => i.blockType === "clnCallout");
    expect(callout).toBeDefined();
    expect(callout!.label).toBe("Callout");
    expect(callout!.group).toBe("Directives");
  });

  it("includes math", () => {
    const math = items.find((i) => i.blockType === "clnMath");
    expect(math).toBeDefined();
    expect(math!.label).toBe("Math");
  });

  it("includes table", () => {
    const table = items.find((i) => i.blockType === "clnTable");
    expect(table).toBeDefined();
    expect(table!.label).toBe("Table");
  });

  it("includes toc", () => {
    const toc = items.find((i) => i.blockType === "clnToc");
    expect(toc).toBeDefined();
    expect(toc!.label).toBe("Table of Contents");
  });

  it("includes anchor", () => {
    const anchor = items.find((i) => i.blockType === "clnAnchor");
    expect(anchor).toBeDefined();
    expect(anchor!.label).toBe("Anchor");
  });

  it("excludes include (unsupported in browser editor)", () => {
    const inc = items.find((i) => i.blockType === "clnInclude");
    expect(inc).toBeUndefined();
  });

  it("excludes meta (not insertable from slash menu)", () => {
    const meta = items.find((i) => i.blockType === "clnMeta");
    expect(meta).toBeUndefined();
  });

  it("groups core syntax and directives separately", () => {
    const groups = new Set(items.map((i) => i.group));
    expect(groups).toContain("Basic blocks");
    expect(groups).toContain("Directives");
  });

  it("all items have aliases for fuzzy matching", () => {
    for (const item of items) {
      expect(Array.isArray(item.aliases)).toBe(true);
    }
  });

  it("source has aliases including 'code highlight'", () => {
    const source = items.find((i) => i.blockType === "clnSource");
    expect(source).toBeDefined();
    expect(source!.aliases).toContain("code");
    expect(source!.aliases).toContain("highlight");
  });
});
