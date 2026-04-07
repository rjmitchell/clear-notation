import { describe, it, expect } from "vitest";
import {
  escapeInline,
  unescapeInline,
  escapeAttribute,
  escapeTableCell,
} from "./escaping";
import matrix from "../../../fixtures/escaping-matrix.json";

// ═══════════════════════════════════════════════════════════════════
// Inline escaping (driven by shared matrix)
// ═══════════════════════════════════════════════════════════════════

describe("escapeInline", () => {
  for (const tc of matrix.domains.inline.cases) {
    it(`escapes: ${tc.note}`, () => {
      expect(escapeInline(tc.raw)).toBe(tc.escaped);
    });
  }
});

describe("unescapeInline", () => {
  for (const tc of matrix.domains.inline.cases) {
    it(`unescapes: ${tc.note}`, () => {
      expect(unescapeInline(tc.escaped)).toBe(tc.raw);
    });
  }
});

describe("escapeInline / unescapeInline round-trip", () => {
  const roundTripCases = [
    "hello world",
    "a { b } c",
    "+{strong}",
    "*{emphasis}",
    "^{note}",
    "::directive",
    "[link -> url]",
    "back\\slash",
    "`code`",
    "mixed +{ and *{ and ^{ and :: and { and } and [ and ] and \\ and `",
    "",
    "no special chars here at all",
  ];

  for (const raw of roundTripCases) {
    it(`round-trips: ${JSON.stringify(raw)}`, () => {
      const escaped = escapeInline(raw);
      const unescaped = unescapeInline(escaped);
      expect(unescaped).toBe(raw);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Attribute escaping (driven by shared matrix)
// ═══════════════════════════════════════════════════════════════════

describe("escapeAttribute", () => {
  for (const tc of matrix.domains.attribute.cases) {
    it(`escapes: ${tc.note}`, () => {
      expect(escapeAttribute(tc.raw)).toBe(tc.escaped);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Table cell escaping (driven by shared matrix)
// ═══════════════════════════════════════════════════════════════════

describe("escapeTableCell", () => {
  for (const tc of matrix.domains.table.cases) {
    it(`escapes: ${tc.note}`, () => {
      expect(escapeTableCell(tc.raw)).toBe(tc.escaped);
    });
  }
});
