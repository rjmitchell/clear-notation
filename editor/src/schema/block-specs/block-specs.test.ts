import { describe, it, expect } from "vitest";
import { clnHeadingSpec } from "./clnHeading";
import { clnParagraphSpec } from "./clnParagraph";
import { clnBlockquoteSpec } from "./clnBlockquote";
import { clnBulletListItemSpec } from "./clnBulletListItem";
import { clnNumberedListItemSpec } from "./clnNumberedListItem";

describe("block-specs — anchorId prop on addressable blocks", () => {
  it("clnHeadingSpec exposes anchorId with empty default", () => {
    const schema = (clnHeadingSpec as any).config.propSchema;
    expect(schema).toHaveProperty("anchorId");
    expect(schema.anchorId.default).toBe("");
  });

  it("clnHeadingSpec preserves level prop", () => {
    const schema = (clnHeadingSpec as any).config.propSchema;
    expect(schema).toHaveProperty("level");
  });

  it("clnParagraphSpec exposes anchorId", () => {
    const schema = (clnParagraphSpec as any).config.propSchema;
    expect(schema).toHaveProperty("anchorId");
    expect(schema.anchorId.default).toBe("");
  });

  it("clnBlockquoteSpec exposes anchorId", () => {
    const schema = (clnBlockquoteSpec as any).config.propSchema;
    expect(schema).toHaveProperty("anchorId");
    expect(schema.anchorId.default).toBe("");
  });

  it("clnBulletListItemSpec exposes anchorId", () => {
    const schema = (clnBulletListItemSpec as any).config.propSchema;
    expect(schema).toHaveProperty("anchorId");
    expect(schema.anchorId.default).toBe("");
  });

  it("clnNumberedListItemSpec exposes anchorId AND startNumber (not start)", () => {
    const schema = (clnNumberedListItemSpec as any).config.propSchema;
    expect(schema).toHaveProperty("anchorId");
    expect(schema.anchorId.default).toBe("");
    expect(schema).toHaveProperty("startNumber");
    expect(schema).not.toHaveProperty("start");
  });
});
