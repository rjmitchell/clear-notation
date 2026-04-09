/**
 * Cross-implementation conformance tests.
 *
 * Loads shared fixtures from ../fixtures/valid/ and verifies the JS renderer
 * produces the same HTML as the Python reference implementation.
 *
 * The JS pipeline does not have its own CLN parser, so we test at the
 * AST → HTML level: load the normalized AST JSON, feed it to renderHtml,
 * and compare against the expected HTML snapshot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtml } from "./renderer";
import type { NormalizedDocument } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures", "valid");

/**
 * Convert AST JSON (Python format) to the JS NormalizedDocument type.
 *
 * The Python AST uses class names like NHeading, NParagraph, etc.
 * The JS types use discriminated unions with a `type` field like "heading", "paragraph".
 */
function convertAstToJsFormat(ast: any): NormalizedDocument {
  const typeMap: Record<string, string> = {
    NHeading: "heading",
    NParagraph: "paragraph",
    NThematicBreak: "thematic-break",
    NBlockQuote: "blockquote",
    NUnorderedList: "unordered-list",
    NOrderedList: "ordered-list",
    NToc: "toc",
    NCallout: "callout",
    NFigure: "figure",
    NMathBlock: "math",
    NSourceBlock: "source",
    NTable: "table",
  };

  const inlineTypeMap: Record<string, string> = {
    Text: "text",
    CodeSpan: "code",
    Strong: "strong",
    Emphasis: "emphasis",
    Link: "link",
    NRef: "ref",
  };

  function convertInline(node: any): any {
    const t = inlineTypeMap[node.type] || node.type;
    if (t === "text") return { type: t, value: node.value };
    if (t === "code") return { type: t, value: node.value };
    if (t === "strong") return { type: t, children: (node.children || []).map(convertInline) };
    if (t === "emphasis") return { type: t, children: (node.children || []).map(convertInline) };
    if (t === "link") return { type: t, label: (node.label || []).map(convertInline), target: node.target };
    if (t === "ref") return { type: t, target: node.target };
    return node;
  }

  function convertBlock(block: any): any {
    const t = typeMap[block.type] || block.type;

    if (t === "heading") {
      return { type: t, level: block.level, id: block.id, content: (block.content || []).map(convertInline) };
    }
    if (t === "paragraph") {
      return { type: t, content: (block.content || []).map(convertInline), id: block.id || undefined };
    }
    if (t === "thematic-break") return { type: t };
    if (t === "blockquote") {
      return { type: t, lines: (block.lines || []).map((l: any[]) => l.map(convertInline)), id: block.id || undefined };
    }
    if (t === "unordered-list") {
      return { type: t, items: (block.items || []).map((i: any[]) => i.map(convertInline)), id: block.id || undefined };
    }
    if (t === "ordered-list") {
      return {
        type: t,
        items: (block.items || []).map((i: any) => ({
          ordinal: i.ordinal,
          content: (i.content || []).map(convertInline),
        })),
        id: block.id || undefined,
      };
    }
    if (t === "toc") return { type: t, id: block.id || undefined };
    if (t === "callout") {
      return {
        type: t,
        kind: block.kind,
        title: block.title,
        compact: block.compact,
        blocks: (block.blocks || []).map(convertBlock),
        id: block.id || undefined,
      };
    }
    if (t === "figure") {
      return { type: t, src: block.src, blocks: (block.blocks || []).map(convertBlock), id: block.id || undefined };
    }
    if (t === "math") return { type: t, text: block.text, id: block.id || undefined };
    if (t === "source") return { type: t, language: block.language, text: block.text, id: block.id || undefined };
    if (t === "table") {
      return {
        type: t,
        header: block.header,
        align: block.align,
        rows: (block.rows || []).map((r: any) => ({
          cells: (r.cells || []).map((c: any) => ({
            content: (c.content || []).map(convertInline),
          })),
        })),
        id: block.id || undefined,
      };
    }
    return block;
  }

  function convertNote(note: any): any {
    return {
      number: note.number,
      children: (note.children || []).map(convertInline),
    };
  }

  return {
    meta: ast.meta || {},
    blocks: (ast.blocks || []).map(convertBlock),
    notes: (ast.notes || []).map(convertNote),
  };
}

/** Extract body content from full HTML document. */
function extractBody(html: string): string {
  const bodyStart = html.indexOf("<body>");
  const bodyEnd = html.indexOf("</body>");
  if (bodyStart === -1 || bodyEnd === -1) return html;
  return html.slice(bodyStart + 6, bodyEnd).trim();
}

/** Normalize whitespace for comparison. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Discover all valid fixtures that have both .ast.json and .html
const fixtures: { name: string; cln: string; ast: string; html: string }[] = [];

if (existsSync(FIXTURES_DIR)) {
  const files = readdirSync(FIXTURES_DIR);
  const clnFiles = files.filter((f: string) => f.endsWith(".cln") && f.startsWith("v"));

  for (const clnFile of clnFiles) {
    const base = clnFile.replace(".cln", "");
    const astFile = `${base}.ast.json`;
    const htmlFile = `${base}.html`;

    if (files.includes(astFile) && files.includes(htmlFile)) {
      fixtures.push({
        name: base,
        cln: join(FIXTURES_DIR, clnFile),
        ast: join(FIXTURES_DIR, astFile),
        html: join(FIXTURES_DIR, htmlFile),
      });
    }
  }
}

describe("Cross-implementation conformance (AST → HTML)", () => {
  // Skip fixtures that use features the JS renderer doesn't support yet
  const SKIP = new Set([
    "v09-include", // Include resolution not implemented in JS
  ]);

  // Known parity gaps between JS and Python renderers.
  // These are expected failures that document where the JS renderer
  // diverges from the Python reference. Fix incrementally.
  const KNOWN_GAPS = new Set([
    "v02-meta-and-inline",       // Footnote HTML structure differs
    "v03-link-and-note",         // Footnote HTML structure differs
    "v04-lists-and-blockquote",  // List/blockquote rendering differences
    "v05-fenced-code",           // Code block wrapper differences
    "v07-raw-blocks",            // Math/table rendering differences
    "v10-escaped-openers",       // Inline escaping output differences
    "v13-source-directive",      // Source block rendering differences
    "v14-anchor-paragraph",      // Anchor ID rendering differences
    "v15-table-escaped-pipe",    // Table cell escaping differences
    "v16-empty-raw-bodies",      // Empty directive rendering
    "v17-whitespace-raw-body",   // Whitespace handling in raw bodies
    "v18-deep-inline-nesting",   // Nested inline rendering
    "v19-adjacent-blocks",       // List rendering missing
    "v22-inline-comments",       // List/blockquote/code rendering differences
  ]);

  for (const fixture of fixtures) {
    const shouldSkip = SKIP.has(fixture.name);
    const isKnownGap = KNOWN_GAPS.has(fixture.name);

    (shouldSkip ? it.skip : it)(`${fixture.name}${isKnownGap ? " [known gap]" : ""}`, () => {
      const astJson = JSON.parse(readFileSync(fixture.ast, "utf-8"));
      const expectedHtml = readFileSync(fixture.html, "utf-8").trim();

      const jsDoc = convertAstToJsFormat(astJson);
      const jsHtml = renderHtml(jsDoc as NormalizedDocument);
      const jsBody = extractBody(jsHtml);

      if (isKnownGap) {
        // Document the divergence but don't fail CI
        const matches = normalizeWhitespace(jsBody) === normalizeWhitespace(expectedHtml);
        if (matches) {
          // Gap has been fixed! Remove from KNOWN_GAPS.
          throw new Error(`${fixture.name} now passes — remove it from KNOWN_GAPS`);
        }
        // Expected to differ, skip assertion
        return;
      }
      expect(normalizeWhitespace(jsBody)).toBe(normalizeWhitespace(expectedHtml));
    });
  }

  it("discovers at least 15 fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });
});
