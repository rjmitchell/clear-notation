import { describe, it, expect } from "vitest";
import {
  CLN_INLINE_MARKS,
  INLINE_NESTING_WHITELIST,
  isNestingAllowed,
} from "./inline-marks";

describe("CLN_INLINE_MARKS", () => {
  it("defines all 6 inline mark types", () => {
    const names = Object.keys(CLN_INLINE_MARKS);
    expect(names).toHaveLength(6);
    expect(names).toContain("clnStrong");
    expect(names).toContain("clnEmphasis");
    expect(names).toContain("clnCode");
    expect(names).toContain("clnNote");
    expect(names).toContain("clnLink");
    expect(names).toContain("clnRef");
  });

  it("strong uses +{ as opener and } as closer", () => {
    const mark = CLN_INLINE_MARKS.clnStrong;
    expect(mark.clnSyntax.open).toBe("+{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("strong");
  });

  it("emphasis uses *{ as opener and } as closer", () => {
    const mark = CLN_INLINE_MARKS.clnEmphasis;
    expect(mark.clnSyntax.open).toBe("*{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("em");
  });

  it("code uses backtick delimiters", () => {
    const mark = CLN_INLINE_MARKS.clnCode;
    expect(mark.clnSyntax.open).toBe("`");
    expect(mark.clnSyntax.close).toBe("`");
    expect(mark.tag).toBe("code");
  });

  it("note uses ^{ as opener", () => {
    const mark = CLN_INLINE_MARKS.clnNote;
    expect(mark.clnSyntax.open).toBe("^{");
    expect(mark.clnSyntax.close).toBe("}");
    expect(mark.tag).toBe("sup");
  });

  it("link has label and target structure", () => {
    const mark = CLN_INLINE_MARKS.clnLink;
    expect(mark.clnSyntax.open).toBe("[");
    expect(mark.clnSyntax.separator).toBe(" -> ");
    expect(mark.clnSyntax.close).toBe("]");
    expect(mark.tag).toBe("a");
    expect(mark.attrs).toContain("href");
  });

  it("ref is an inline directive", () => {
    const mark = CLN_INLINE_MARKS.clnRef;
    expect(mark.clnSyntax.open).toBe("::ref[");
    expect(mark.clnSyntax.close).toBe("]");
    expect(mark.tag).toBe("a");
    expect(mark.attrs).toContain("target");
  });
});

describe("INLINE_NESTING_WHITELIST", () => {
  it("allows code inside strong", () => {
    expect(INLINE_NESTING_WHITELIST.clnStrong).toEqual(["clnCode"]);
  });

  it("allows code inside emphasis", () => {
    expect(INLINE_NESTING_WHITELIST.clnEmphasis).toEqual(["clnCode"]);
  });

  it("does not allow nesting inside code", () => {
    expect(INLINE_NESTING_WHITELIST.clnCode).toEqual([]);
  });

  it("allows strong, emphasis, code, link, ref inside note", () => {
    expect(INLINE_NESTING_WHITELIST.clnNote).toEqual([
      "clnStrong",
      "clnEmphasis",
      "clnCode",
      "clnLink",
      "clnRef",
    ]);
  });

  it("allows strong, emphasis, code inside link label", () => {
    expect(INLINE_NESTING_WHITELIST.clnLink).toEqual([
      "clnStrong",
      "clnEmphasis",
      "clnCode",
    ]);
  });
});

describe("isNestingAllowed", () => {
  it("returns true for code inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnCode")).toBe(true);
  });

  it("returns false for strong inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnStrong")).toBe(false);
  });

  it("returns false for emphasis inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnEmphasis")).toBe(false);
  });

  it("returns false for link inside strong", () => {
    expect(isNestingAllowed("clnStrong", "clnLink")).toBe(false);
  });

  it("returns true for strong inside note", () => {
    expect(isNestingAllowed("clnNote", "clnStrong")).toBe(true);
  });

  it("returns true for link inside note", () => {
    expect(isNestingAllowed("clnNote", "clnLink")).toBe(true);
  });

  it("returns false for anything inside code", () => {
    expect(isNestingAllowed("clnCode", "clnStrong")).toBe(false);
    expect(isNestingAllowed("clnCode", "clnEmphasis")).toBe(false);
    expect(isNestingAllowed("clnCode", "clnLink")).toBe(false);
  });

  it("returns false for unknown parent", () => {
    expect(isNestingAllowed("unknown", "clnCode")).toBe(false);
  });
});
