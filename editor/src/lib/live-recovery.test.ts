import { describe, it, expect } from "vitest";
import { normalizeForLiveParse, type AppliedRule } from "./live-recovery";

describe("normalizeForLiveParse — Rule 1 (append trailing newline)", () => {
  it("appends \\n when source does not end with one", () => {
    const result = normalizeForLiveParse("  +{bold}");
    expect(result.normalized).toBe("  +{bold}\n");
    expect(result.appliedRules).toEqual(["append-newline"]);
  });

  it("is a no-op when source already ends with \\n", () => {
    const result = normalizeForLiveParse("+{bold}\n");
    expect(result.normalized).toBe("+{bold}\n");
    expect(result.appliedRules).toEqual([]);
  });

  it("preserves multiple trailing newlines", () => {
    const result = normalizeForLiveParse("+{bold}\n\n\n");
    expect(result.normalized).toBe("+{bold}\n\n\n");
    expect(result.appliedRules).toEqual([]);
  });

  it("returns empty appliedRules for no-op case", () => {
    const result = normalizeForLiveParse("already fine\n");
    expect(result.appliedRules).toHaveLength(0);
  });

  it("handles empty string", () => {
    const result = normalizeForLiveParse("");
    expect(result.normalized).toBe("\n");
    expect(result.appliedRules).toEqual(["append-newline"]);
  });
});
