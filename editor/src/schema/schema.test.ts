import { describe, it, expect } from "vitest";
import {
  CORE_BLOCK_SPECS,
  DIRECTIVE_BLOCK_SPECS,
  CLN_INLINE_MARKS,
  SLASH_MENU_ITEMS,
  ALL_BLOCK_SPECS,
  getBlockSpecByType,
  getDirectiveSpecByName,
} from "./index";

describe("schema integration", () => {
  it("ALL_BLOCK_SPECS combines core and directive specs", () => {
    const coreCount = Object.keys(CORE_BLOCK_SPECS).length;
    const directiveCount = Object.keys(DIRECTIVE_BLOCK_SPECS).length;
    const allCount = Object.keys(ALL_BLOCK_SPECS).length;

    expect(allCount).toBe(coreCount + directiveCount);
    expect(allCount).toBe(16); // 8 core + 8 directive
  });

  it("no type name collisions between core and directive specs", () => {
    const coreTypes = new Set(Object.keys(CORE_BLOCK_SPECS));
    const directiveTypes = Object.keys(DIRECTIVE_BLOCK_SPECS);

    for (const dt of directiveTypes) {
      expect(coreTypes.has(dt)).toBe(false);
    }
  });

  it("every slash menu item references a valid block type", () => {
    for (const item of SLASH_MENU_ITEMS) {
      expect(ALL_BLOCK_SPECS[item.blockType]).toBeDefined();
    }
  });

  it("getBlockSpecByType finds core blocks", () => {
    const heading = getBlockSpecByType("clnHeading");
    expect(heading).toBeDefined();
    expect(heading!.type).toBe("clnHeading");
  });

  it("getBlockSpecByType finds directive blocks", () => {
    const callout = getBlockSpecByType("clnCallout");
    expect(callout).toBeDefined();
  });

  it("getBlockSpecByType returns undefined for unknown type", () => {
    expect(getBlockSpecByType("clnUnknown")).toBeUndefined();
  });

  it("getDirectiveSpecByName finds by directive name", () => {
    const callout = getDirectiveSpecByName("callout");
    expect(callout).toBeDefined();
    expect(callout!.directiveName).toBe("callout");
  });

  it("getDirectiveSpecByName returns undefined for non-directive", () => {
    expect(getDirectiveSpecByName("heading")).toBeUndefined();
  });

  it("inline marks are complete", () => {
    expect(Object.keys(CLN_INLINE_MARKS)).toHaveLength(6);
  });
});
