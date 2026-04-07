import { describe, it, expect } from "vitest";
import { slugify, splitTableRow, escHtml } from "./utils";

describe("slugify", () => {
  it("lowercases text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips non-ASCII after NFKD normalization", () => {
    // é (U+00E9) decomposes to e + combining accent under NFKD;
    // the accent is trailing non-alnum and gets stripped.
    expect(slugify("café")).toBe("cafe");
  });

  it("collapses consecutive non-alnum chars to a single dash", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("handles all-punctuation input", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("handles parentheses and mixed punctuation", () => {
    expect(slugify("foo (bar) baz")).toBe("foo-bar-baz");
  });
});

describe("splitTableRow", () => {
  it("splits simple pipe-delimited cells", () => {
    expect(splitTableRow("a|b|c")).toEqual(["a", "b", "c"]);
  });

  it("handles escaped pipe", () => {
    expect(splitTableRow("a\\|b|c")).toEqual(["a|b", "c"]);
  });

  it("handles escaped backslash", () => {
    expect(splitTableRow("a\\\\|b")).toEqual(["a\\", "b"]);
  });

  it("preserves unknown escape sequences", () => {
    expect(splitTableRow("a\\n|b")).toEqual(["a\\n", "b"]);
  });

  it("handles single cell", () => {
    expect(splitTableRow("hello")).toEqual(["hello"]);
  });

  it("trims whitespace from cells", () => {
    expect(splitTableRow(" a | b | c ")).toEqual(["a", "b", "c"]);
  });

  it("handles trailing backslash", () => {
    expect(splitTableRow("a\\")).toEqual(["a\\"]);
  });
});

describe("escHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escHtml('<div class="x">&')).toBe(
      "&lt;div class=&quot;x&quot;&gt;&amp;",
    );
  });

  it("escapes single quotes", () => {
    expect(escHtml("it's")).toBe("it&#x27;s");
  });

  it("passes safe text through unchanged", () => {
    expect(escHtml("hello world")).toBe("hello world");
  });
});
