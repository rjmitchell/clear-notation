import { describe, it, expect } from "vitest";
import { clnSchema } from "./cln-schema";

describe("clnSchema", () => {
  it("is a valid BlockNoteSchema instance", () => {
    expect(clnSchema).toBeDefined();
    expect(clnSchema.blockSpecs).toBeDefined();
    expect(clnSchema.inlineContentSpecs).toBeDefined();
  });

  it("registers clnNote as a custom inline content type", () => {
    expect(clnSchema.inlineContentSpecs).toHaveProperty("clnNote");
  });

  it("registers clnRef as a custom inline content type", () => {
    expect(clnSchema.inlineContentSpecs).toHaveProperty("clnRef");
  });

  it("keeps the default inline content specs (text, link) alongside the new cln types", () => {
    expect(clnSchema.inlineContentSpecs).toHaveProperty("text");
    expect(clnSchema.inlineContentSpecs).toHaveProperty("link");
  });

  it("registers the five custom addressable block specs", () => {
    expect(clnSchema.blockSpecs).toHaveProperty("heading");
    expect(clnSchema.blockSpecs).toHaveProperty("paragraph");
    expect(clnSchema.blockSpecs).toHaveProperty("quote");
    expect(clnSchema.blockSpecs).toHaveProperty("bulletListItem");
    expect(clnSchema.blockSpecs).toHaveProperty("numberedListItem");
  });

  it("keeps the default non-addressable block specs (codeBlock, image, etc.)", () => {
    expect(clnSchema.blockSpecs).toHaveProperty("codeBlock");
  });
});
