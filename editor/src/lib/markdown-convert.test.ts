import { describe, it, expect } from "vitest";
import { convertMarkdownToCln } from "./markdown-convert";

describe("convertMarkdownToCln", () => {
  it("converts **bold** to +{bold}", () => {
    expect(convertMarkdownToCln("**bold**")).toBe("+{bold}");
  });
  it("converts *italic* to *{italic}", () => {
    expect(convertMarkdownToCln("*italic*")).toBe("*{italic}");
  });
  it("converts [text](url) to [text -> url]", () => {
    expect(convertMarkdownToCln("[docs](/docs)")).toBe("[docs -> /docs]");
  });
  it("handles mixed formatting", () => {
    expect(convertMarkdownToCln("**bold** and *italic*")).toBe("+{bold} and *{italic}");
  });
  it("passes through ClearNotation syntax unchanged", () => {
    expect(convertMarkdownToCln("+{bold} and *{italic}")).toBe("+{bold} and *{italic}");
  });
  it("passes through plain text unchanged", () => {
    expect(convertMarkdownToCln("hello world")).toBe("hello world");
  });
});
