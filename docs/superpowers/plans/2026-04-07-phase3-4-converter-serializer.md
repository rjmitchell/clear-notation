# Phase 3-4: CST-to-BlockNote Converter + BlockNote-to-CLN Serializer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bidirectional data bridge between tree-sitter CSTs and BlockNote documents: (1) a converter that walks a tree-sitter CST and produces a BlockNote document model (array of typed blocks with inline content), including re-parsing parsed-mode directive bodies and error-node fallback; and (2) a serializer that walks a BlockNote document model and produces ClearNotation source text, plus a shared JSON escaping test matrix covering inline, attribute, and table cell escaping.

**Architecture:** Phase 3 creates `editor/src/converter/` — a pure-function module that maps each CST node type to the corresponding BlockNote block or inline content type defined in the schema module. Block-level nodes (`heading`, `paragraph`, `fenced_code_block`, etc.) become `BNBlock` objects; inline nodes (`strong`, `emphasis`, `code_span`, `link`, `note`, `inline_directive`, `escape_sequence`, `text`) become `BNInlineContent` items with stacked styles. Parsed-mode directive bodies are re-parsed via a caller-supplied `parseFn` and recursively converted. CST nodes with errors fall back to raw-text paragraphs with a `parseError` flag. Phase 4 creates `editor/src/serializer/` — the reverse transformation. A style-to-tree algorithm reconstructs ClearNotation's nested delimiters from BlockNote's flat styled-text model. A shared escaping test matrix (`fixtures/escaping-matrix.json`) covers three domains: inline content, attribute strings, and table cells.

**Tech Stack:** TypeScript 5.3+, Vitest 4+, existing `editor/src/parser/` (CSTNode, cst-utils), existing `editor/src/schema/` (block specs, inline marks, registry)

---

## File Structure

### Phase 3: Converter

| File | Responsibility |
|------|---------------|
| `editor/src/converter/types.ts` | Output types: `BNBlock`, `BNInlineContent`, `BNStyledText`, `BNLink`, `BNTableContent`, `ConvertOptions` |
| `editor/src/converter/inline-converter.ts` | Converts inline CST nodes → `BNInlineContent[]` with style stacking |
| `editor/src/converter/block-converter.ts` | Converts block-level CST nodes → `BNBlock`, including directive handling and error fallback |
| `editor/src/converter/converter.ts` | Main entry: `convertDocument(cst, options?) → Promise<BNBlock[]>` |
| `editor/src/converter/index.ts` | Barrel export |

### Phase 4: Serializer

| File | Responsibility |
|------|---------------|
| `editor/src/serializer/escaping.ts` | `escapeInline()`, `escapeAttribute()`, `escapeTableCell()`, `unescapeInline()` |
| `editor/src/serializer/inline-serializer.ts` | `serializeInline(content[]) → string` with style-to-tree reconstruction |
| `editor/src/serializer/block-serializer.ts` | `serializeBlock(block) → string` for all block types |
| `editor/src/serializer/serializer.ts` | Main entry: `serializeDocument(blocks) → string` |
| `editor/src/serializer/index.ts` | Barrel export |
| `fixtures/escaping-matrix.json` | Shared cross-language escaping test data |

---

## Phase 3: CST-to-BlockNote Converter

### Task 1: Define converter output types

**Files:**
- Create: `editor/src/converter/types.ts`
- Create: `editor/src/converter/types.test.ts`

- [ ] **Step 1: Write the type definition tests**

Create `editor/src/converter/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  BNBlock,
  BNInlineContent,
  BNStyledText,
  BNLink,
  BNTableContent,
  BNTableRow,
  ConvertOptions,
} from "./types";

describe("converter output types", () => {
  it("BNStyledText has required fields", () => {
    const text: BNStyledText = {
      type: "text",
      text: "hello",
      styles: {},
    };
    expect(text.type).toBe("text");
    expect(text.text).toBe("hello");
    expect(text.styles).toEqual({});
  });

  it("BNStyledText supports ClearNotation styles", () => {
    const text: BNStyledText = {
      type: "text",
      text: "bold code",
      styles: { clnStrong: true, clnCode: true },
    };
    expect(text.styles.clnStrong).toBe(true);
    expect(text.styles.clnCode).toBe(true);
  });

  it("BNStyledText supports ref style with string value", () => {
    const text: BNStyledText = {
      type: "text",
      text: "intro",
      styles: { clnRef: "intro" },
    };
    expect(text.styles.clnRef).toBe("intro");
  });

  it("BNLink has href and content", () => {
    const link: BNLink = {
      type: "link",
      href: "/docs",
      content: [{ type: "text", text: "docs", styles: {} }],
    };
    expect(link.type).toBe("link");
    expect(link.href).toBe("/docs");
    expect(link.content).toHaveLength(1);
  });

  it("BNInlineContent is union of BNStyledText | BNLink", () => {
    const items: BNInlineContent[] = [
      { type: "text", text: "plain", styles: {} },
      { type: "link", href: "/x", content: [{ type: "text", text: "x", styles: {} }] },
    ];
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("text");
    expect(items[1].type).toBe("link");
  });

  it("BNBlock has type, props, content, children", () => {
    const block: BNBlock = {
      type: "clnHeading",
      props: { level: 2 },
      content: [{ type: "text", text: "Title", styles: {} }],
      children: [],
    };
    expect(block.type).toBe("clnHeading");
    expect(block.props.level).toBe(2);
    expect(block.content).toHaveLength(1);
    expect(block.children).toHaveLength(0);
  });

  it("BNBlock supports parseError flag", () => {
    const block: BNBlock = {
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "broken source", styles: {} }],
      children: [],
      parseError: true,
    };
    expect(block.parseError).toBe(true);
  });

  it("BNBlock supports optional id", () => {
    const block: BNBlock = {
      id: "abc-123",
      type: "clnParagraph",
      props: {},
      content: [],
      children: [],
    };
    expect(block.id).toBe("abc-123");
  });

  it("BNTableContent has rows of cells", () => {
    const table: BNTableContent = {
      type: "tableContent",
      rows: [
        { cells: [[{ type: "text", text: "A", styles: {} }], [{ type: "text", text: "B", styles: {} }]] },
      ],
    };
    expect(table.type).toBe("tableContent");
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells).toHaveLength(2);
  });

  it("ConvertOptions accepts a parseFn", () => {
    const opts: ConvertOptions = {
      parseFn: async (source: string) => ({
        type: "document",
        text: source,
        startIndex: 0,
        endIndex: source.length,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: source.length },
        isNamed: true,
        hasError: false,
        children: [],
        fieldName: null,
      }),
    };
    expect(opts.parseFn).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/types.test.ts
```

Expected: FAIL — module `./types` not found.

- [ ] **Step 3: Write the type definitions**

Create `editor/src/converter/types.ts`:

```typescript
import type { CSTNode } from "../parser/types";

/** Styled text node in BlockNote's inline content model. */
export interface BNStyledText {
  type: "text";
  text: string;
  /** Active ClearNotation styles. Boolean for toggle marks, string for marks with values (e.g. clnRef). */
  styles: Record<string, boolean | string>;
}

/** Link node in BlockNote's inline content model. */
export interface BNLink {
  type: "link";
  href: string;
  content: BNStyledText[];
}

/** Union of all inline content types. */
export type BNInlineContent = BNStyledText | BNLink;

/** A row in table content. */
export interface BNTableRow {
  cells: BNInlineContent[][];
}

/** Table content for table blocks. */
export interface BNTableContent {
  type: "tableContent";
  rows: BNTableRow[];
}

/** A block in the BlockNote document model. */
export interface BNBlock {
  /** Optional block ID (auto-generated by BlockNote if omitted). */
  id?: string;
  /** Block type name (e.g. "clnHeading", "clnCallout"). */
  type: string;
  /** Block properties (e.g. { level: 2 } for headings). */
  props: Record<string, string | number | boolean>;
  /** Inline content (for blocks with content: "inline"). */
  content: BNInlineContent[];
  /** Child blocks (for blocks with nested content). */
  children: BNBlock[];
  /** Set when the CST node had a parse error. Renders as read-only raw text. */
  parseError?: boolean;
}

/** Options for the document converter. */
export interface ConvertOptions {
  /**
   * Parse function for re-parsing parsed-mode directive bodies.
   * Called with the raw body text; must return the root CSTNode of the parsed result.
   * If not provided, parsed-mode bodies are treated as raw text in a paragraph.
   */
  parseFn?: (source: string) => Promise<CSTNode>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/types.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/types.ts editor/src/converter/types.test.ts && git commit -m "feat(converter): add BlockNote document model output types"
```

---

### Task 2: Inline converter — text, styles, code, escapes

**Files:**
- Create: `editor/src/converter/inline-converter.ts`
- Create: `editor/src/converter/inline-converter.test.ts`

**Context:** The inline converter walks CST inline nodes and produces `BNInlineContent[]`. It uses a "style stacking" approach: when entering a `strong` node, it adds `clnStrong: true` to the active styles, then recurses into children. Text nodes inherit whatever styles are active. This naturally handles nesting.

CST inline node types and their child structure:
- `inline_content` → contains `text`, `strong`, `emphasis`, `code_span`, `note`, `link`, `inline_directive`, `escape_sequence`
- `strong` → contains `strong_open`, `styled_text`/`code_span`/`escape_sequence`, `styled_close`
- `emphasis` → contains `emphasis_open`, `styled_text`/`code_span`/`escape_sequence`, `styled_close`
- `code_span` → contains `code_span_content` (optional)
- `escape_sequence` → text like `\{`, `\}`, `\\`

This task covers: text, strong, emphasis, code_span, escape_sequence. Links, refs, and notes are in Task 3.

- [ ] **Step 1: Write the tests for basic inline conversion**

Create `editor/src/converter/inline-converter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { convertInline } from "./inline-converter";
import type { CSTNode } from "../parser/types";
import type { BNInlineContent } from "./types";

/** Helper: build a minimal CSTNode. */
function node(type: string, text: string, children: CSTNode[] = []): CSTNode {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    isNamed: true,
    hasError: false,
    children,
    fieldName: null,
  };
}

describe("convertInline", () => {
  it("converts plain text", () => {
    const cst = node("inline_content", "hello", [
      node("text", "hello"),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "hello", styles: {} },
    ]);
  });

  it("converts strong text", () => {
    const cst = node("inline_content", "+{bold}", [
      node("strong", "+{bold}", [
        node("strong_open", "+{"),
        node("styled_text", "bold"),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "bold", styles: { clnStrong: true } },
    ]);
  });

  it("converts emphasis text", () => {
    const cst = node("inline_content", "*{italic}", [
      node("emphasis", "*{italic}", [
        node("emphasis_open", "*{"),
        node("styled_text", "italic"),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "italic", styles: { clnEmphasis: true } },
    ]);
  });

  it("converts code span", () => {
    const cst = node("inline_content", "`code`", [
      node("code_span", "`code`", [
        node("code_span_content", "code"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "code", styles: { clnCode: true } },
    ]);
  });

  it("converts empty code span", () => {
    const cst = node("inline_content", "``", [
      node("code_span", "``", []),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "", styles: { clnCode: true } },
    ]);
  });

  it("converts escape sequences", () => {
    const cst = node("inline_content", "a\\{b", [
      node("text", "a"),
      node("escape_sequence", "\\{"),
      node("text", "b"),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "a", styles: {} },
      { type: "text", text: "{", styles: {} },
      { type: "text", text: "b", styles: {} },
    ]);
  });

  it("converts code inside strong (nested styles)", () => {
    const cst = node("inline_content", "+{bold `code`}", [
      node("strong", "+{bold `code`}", [
        node("strong_open", "+{"),
        node("styled_text", "bold "),
        node("code_span", "`code`", [
          node("code_span_content", "code"),
        ]),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "bold ", styles: { clnStrong: true } },
      { type: "text", text: "code", styles: { clnStrong: true, clnCode: true } },
    ]);
  });

  it("converts mixed inline content", () => {
    const cst = node("inline_content", "plain +{bold} more", [
      node("text", "plain "),
      node("strong", "+{bold}", [
        node("strong_open", "+{"),
        node("styled_text", "bold"),
        node("styled_close", "}"),
      ]),
      node("text", " more"),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "plain ", styles: {} },
      { type: "text", text: "bold", styles: { clnStrong: true } },
      { type: "text", text: " more", styles: {} },
    ]);
  });

  it("passes active styles to children", () => {
    // This tests the style stacking mechanism directly
    const cst = node("inline_content", "text", [
      node("text", "text"),
    ]);
    const result = convertInline(cst, { clnNote: true });
    expect(result).toEqual([
      { type: "text", text: "text", styles: { clnNote: true } },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/inline-converter.test.ts
```

Expected: FAIL — module `./inline-converter` not found.

- [ ] **Step 3: Implement the inline converter (text, styles, code, escapes)**

Create `editor/src/converter/inline-converter.ts`:

```typescript
import type { CSTNode } from "../parser/types";
import type { BNInlineContent, BNStyledText, BNLink } from "./types";
import { findChildByType, getDirectiveName, getAttributeMap } from "../parser/cst-utils";

/**
 * Convert a CST inline_content node (or similar container) to BlockNote inline content.
 *
 * @param node - A CST node whose children are inline elements (text, strong, emphasis, etc.)
 * @param activeStyles - Styles inherited from parent marks (for recursive calls)
 * @returns Array of BNInlineContent items
 */
export function convertInline(
  node: CSTNode,
  activeStyles: Record<string, boolean | string> = {}
): BNInlineContent[] {
  const result: BNInlineContent[] = [];

  for (const child of node.children) {
    const items = convertInlineNode(child, activeStyles);
    result.push(...items);
  }

  return result;
}

/**
 * Convert a single inline CST node to BNInlineContent items.
 */
function convertInlineNode(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNInlineContent[] {
  switch (node.type) {
    case "text":
    case "styled_text":
    case "note_text":
    case "link_text":
      return [styledText(node.text, activeStyles)];

    case "escape_sequence":
      // Remove the leading backslash: "\{" -> "{"
      return [styledText(node.text.slice(1), activeStyles)];

    case "strong":
      return convertMarkChildren(node, { ...activeStyles, clnStrong: true });

    case "emphasis":
      return convertMarkChildren(node, { ...activeStyles, clnEmphasis: true });

    case "code_span": {
      const content = findChildByType(node, "code_span_content");
      return [styledText(content ? content.text : "", { ...activeStyles, clnCode: true })];
    }

    case "note":
      return convertMarkChildren(node, { ...activeStyles, clnNote: true });

    case "link":
      return convertLink(node, activeStyles);

    case "inline_directive":
      return convertInlineDirective(node, activeStyles);

    // Skip delimiter nodes (strong_open, styled_close, note_open, etc.)
    case "strong_open":
    case "emphasis_open":
    case "note_open":
    case "styled_close":
    case "link_separator":
      return [];

    default:
      // Unknown inline node — render as plain text
      return [styledText(node.text, activeStyles)];
  }
}

/**
 * Convert children of a mark node (strong, emphasis, note), skipping delimiters.
 */
function convertMarkChildren(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNInlineContent[] {
  const result: BNInlineContent[] = [];
  for (const child of node.children) {
    const items = convertInlineNode(child, activeStyles);
    result.push(...items);
  }
  return result;
}

/**
 * Convert a CST link node to a BNLink.
 *
 * CST structure: link → link_label, link_separator, link_target
 * link_label contains: link_text, strong, emphasis, code_span, escape_sequence
 */
function convertLink(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNInlineContent[] {
  const labelNode = findChildByType(node, "link_label");
  const targetNode = findChildByType(node, "link_target");
  if (!labelNode || !targetNode) {
    // Malformed link — render as text
    return [styledText(node.text, activeStyles)];
  }

  // Convert label children to styled text (links can contain strong, emphasis, code)
  const labelContent: BNStyledText[] = [];
  for (const child of labelNode.children) {
    const items = convertInlineNode(child, activeStyles);
    for (const item of items) {
      if (item.type === "text") {
        labelContent.push(item);
      }
      // Links inside link labels shouldn't happen (grammar prevents it),
      // but if they do, flatten to text
      if (item.type === "link") {
        labelContent.push(...item.content);
      }
    }
  }

  const link: BNLink = {
    type: "link",
    href: targetNode.text,
    content: labelContent,
  };

  return [link];
}

/**
 * Convert a CST inline_directive to BNInlineContent.
 *
 * Currently the only inline directive is ::ref[target="..."].
 * Represented as a styled text node with clnRef style set to the target value.
 */
function convertInlineDirective(
  node: CSTNode,
  activeStyles: Record<string, boolean | string>
): BNInlineContent[] {
  const name = getDirectiveName(node);
  if (name === "ref") {
    const attrs = getAttributeMap(node);
    const target = typeof attrs.target === "string" ? attrs.target : "";
    return [styledText(target, { ...activeStyles, clnRef: target })];
  }

  // Unknown inline directive — render as plain text
  return [styledText(node.text, activeStyles)];
}

/** Helper: create a BNStyledText node. */
function styledText(
  text: string,
  styles: Record<string, boolean | string>
): BNStyledText {
  return { type: "text", text, styles: { ...styles } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/inline-converter.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/inline-converter.ts editor/src/converter/inline-converter.test.ts && git commit -m "feat(converter): inline converter with style stacking for text, strong, emphasis, code, escapes"
```

---

### Task 3: Inline converter — links, refs, notes

**Files:**
- Modify: `editor/src/converter/inline-converter.test.ts`

**Context:** This task adds test coverage for links, inline refs, and notes — the more complex inline constructs that involve attributes, nested content, and special style values. The implementation already handles these (Task 2 included the full inline converter), so this task is purely about verifying correctness.

- [ ] **Step 1: Add tests for links, refs, and notes**

Append to `editor/src/converter/inline-converter.test.ts`:

```typescript
describe("convertInline — links", () => {
  it("converts a simple link", () => {
    const cst = node("inline_content", "[docs -> /docs]", [
      node("link", "[docs -> /docs]", [
        node("link_label", "docs", [
          node("link_text", "docs"),
        ]),
        node("link_separator", " -> "),
        node("link_target", "/docs"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      {
        type: "link",
        href: "/docs",
        content: [{ type: "text", text: "docs", styles: {} }],
      },
    ]);
  });

  it("converts a link with styled label", () => {
    const cst = node("inline_content", "[+{API} ref -> /api]", [
      node("link", "[+{API} ref -> /api]", [
        node("link_label", "+{API} ref", [
          node("strong", "+{API}", [
            node("strong_open", "+{"),
            node("styled_text", "API"),
            node("styled_close", "}"),
          ]),
          node("link_text", " ref"),
        ]),
        node("link_separator", " -> "),
        node("link_target", "/api"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      {
        type: "link",
        href: "/api",
        content: [
          { type: "text", text: "API", styles: { clnStrong: true } },
          { type: "text", text: " ref", styles: {} },
        ],
      },
    ]);
  });

  it("preserves parent styles on link content", () => {
    const cst = node("inline_content", "[go -> /x]", [
      node("link", "[go -> /x]", [
        node("link_label", "go", [
          node("link_text", "go"),
        ]),
        node("link_separator", " -> "),
        node("link_target", "/x"),
      ]),
    ]);
    // Simulate being inside a note
    const result = convertInline(cst, { clnNote: true });
    expect(result).toEqual([
      {
        type: "link",
        href: "/x",
        content: [{ type: "text", text: "go", styles: { clnNote: true } }],
      },
    ]);
  });
});

describe("convertInline — refs", () => {
  it("converts an inline ref directive", () => {
    const cst = node("inline_content", '::ref[target="intro"]', [
      node("inline_directive", '::ref[target="intro"]', [
        node("directive_marker", "::"),
        node("directive_name", "ref"),
        node("attribute_list", '[target="intro"]', [
          node("attribute", 'target="intro"', [
            node("attribute_key", "target"),
            node("value", '"intro"', [
              node("string", '"intro"', [
                node("string_content", "intro"),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "intro", styles: { clnRef: "intro" } },
    ]);
  });
});

describe("convertInline — notes", () => {
  it("converts a simple note", () => {
    const cst = node("inline_content", "^{a note}", [
      node("note", "^{a note}", [
        node("note_open", "^{"),
        node("note_text", "a note"),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "a note", styles: { clnNote: true } },
    ]);
  });

  it("converts a note with nested link", () => {
    const cst = node("inline_content", "^{See [guide -> /g].}", [
      node("note", "^{See [guide -> /g].}", [
        node("note_open", "^{"),
        node("note_text", "See "),
        node("link", "[guide -> /g]", [
          node("link_label", "guide", [
            node("link_text", "guide"),
          ]),
          node("link_separator", " -> "),
          node("link_target", "/g"),
        ]),
        node("note_text", "."),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "See ", styles: { clnNote: true } },
      {
        type: "link",
        href: "/g",
        content: [{ type: "text", text: "guide", styles: { clnNote: true } }],
      },
      { type: "text", text: ".", styles: { clnNote: true } },
    ]);
  });

  it("converts a note with strong and code", () => {
    const cst = node("inline_content", "^{+{key} is `val`}", [
      node("note", "^{+{key} is `val`}", [
        node("note_open", "^{"),
        node("strong", "+{key}", [
          node("strong_open", "+{"),
          node("styled_text", "key"),
          node("styled_close", "}"),
        ]),
        node("note_text", " is "),
        node("code_span", "`val`", [
          node("code_span_content", "val"),
        ]),
        node("styled_close", "}"),
      ]),
    ]);
    const result = convertInline(cst);
    expect(result).toEqual([
      { type: "text", text: "key", styles: { clnNote: true, clnStrong: true } },
      { type: "text", text: " is ", styles: { clnNote: true } },
      { type: "text", text: "val", styles: { clnNote: true, clnCode: true } },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/inline-converter.test.ts
```

Expected: all 17 tests PASS (9 from Task 2 + 8 new).

- [ ] **Step 3: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/inline-converter.test.ts && git commit -m "test(converter): add link, ref, and note inline conversion tests"
```

---

### Task 4: Block converter — headings, paragraphs, code blocks, thematic breaks

**Files:**
- Create: `editor/src/converter/block-converter.ts`
- Create: `editor/src/converter/block-converter.test.ts`

**Context:** The block converter maps each block-level CST node to a `BNBlock`. For blocks with inline content (headings, paragraphs, blockquotes), it delegates to `convertInline`. For void blocks (thematic break) and prop-based blocks (code block), it extracts the relevant data into props.

Multi-line paragraphs: a `paragraph` CST node contains multiple `paragraph_line` children, each with `inline_content`. The converter joins lines with a `\n` text node between them for roundtrip fidelity.

- [ ] **Step 1: Write the tests**

Create `editor/src/converter/block-converter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { convertBlock } from "./block-converter";
import type { CSTNode } from "../parser/types";
import type { BNBlock } from "./types";

/** Helper: build a minimal CSTNode. */
function node(type: string, text: string, children: CSTNode[] = []): CSTNode {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    isNamed: true,
    hasError: false,
    children,
    fieldName: null,
  };
}

describe("convertBlock — headings", () => {
  it("converts a level-1 heading", async () => {
    const cst = node("heading", "# Title", [
      node("heading_marker", "#"),
      node("inline_content", "Title", [
        node("text", "Title"),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnHeading",
      props: { level: 1 },
      content: [{ type: "text", text: "Title", styles: {} }],
      children: [],
    }]);
  });

  it("converts a level-3 heading", async () => {
    const cst = node("heading", "### Sub", [
      node("heading_marker", "###"),
      node("inline_content", "Sub", [
        node("text", "Sub"),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnHeading",
      props: { level: 3 },
      content: [{ type: "text", text: "Sub", styles: {} }],
      children: [],
    }]);
  });

  it("converts a heading with inline formatting", async () => {
    const cst = node("heading", "# +{Bold} title", [
      node("heading_marker", "#"),
      node("inline_content", "+{Bold} title", [
        node("strong", "+{Bold}", [
          node("strong_open", "+{"),
          node("styled_text", "Bold"),
          node("styled_close", "}"),
        ]),
        node("text", " title"),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnHeading");
    expect(result[0].content).toEqual([
      { type: "text", text: "Bold", styles: { clnStrong: true } },
      { type: "text", text: " title", styles: {} },
    ]);
  });
});

describe("convertBlock — paragraphs", () => {
  it("converts a single-line paragraph", async () => {
    const cst = node("paragraph", "Hello world.", [
      node("paragraph_line", "Hello world.", [
        node("inline_content", "Hello world.", [
          node("text", "Hello world."),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "Hello world.", styles: {} }],
      children: [],
    }]);
  });

  it("joins multi-line paragraph with newline", async () => {
    const cst = node("paragraph", "Line 1.\nLine 2.", [
      node("paragraph_line", "Line 1.", [
        node("inline_content", "Line 1.", [
          node("text", "Line 1."),
        ]),
      ]),
      node("paragraph_line", "Line 2.", [
        node("inline_content", "Line 2.", [
          node("text", "Line 2."),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual([
      { type: "text", text: "Line 1.", styles: {} },
      { type: "text", text: "\n", styles: {} },
      { type: "text", text: "Line 2.", styles: {} },
    ]);
  });
});

describe("convertBlock — code blocks", () => {
  it("converts a fenced code block", async () => {
    const cst = node("fenced_code_block", '```python\nprint("hi")\n```', [
      node("code_fence_open", "```"),
      node("language_tag", "python"),
      node("code_block_content", 'print("hi")\n'),
      node("code_fence_close", "```"),
    ]);
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnCodeBlock",
      props: { language: "python", code: 'print("hi")\n' },
      content: [],
      children: [],
    }]);
  });

  it("converts a code block with empty content", async () => {
    const cst = node("fenced_code_block", "```text\n```", [
      node("code_fence_open", "```"),
      node("language_tag", "text"),
      node("code_fence_close", "```"),
    ]);
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnCodeBlock",
      props: { language: "text", code: "" },
      content: [],
      children: [],
    }]);
  });
});

describe("convertBlock — thematic break", () => {
  it("converts a thematic break", async () => {
    const cst = node("thematic_break", "---");
    const result = await convertBlock(cst);
    expect(result).toEqual([{
      type: "clnThematicBreak",
      props: {},
      content: [],
      children: [],
    }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/block-converter.test.ts
```

Expected: FAIL — module `./block-converter` not found.

- [ ] **Step 3: Implement the block converter**

Create `editor/src/converter/block-converter.ts`:

```typescript
import type { CSTNode } from "../parser/types";
import type { BNBlock, BNInlineContent, ConvertOptions } from "./types";
import { convertInline } from "./inline-converter";
import {
  findChildByType,
  findChildrenByType,
  getDirectiveName,
  getHeadingLevel,
  getAttributeMap,
  getBodyText,
  hasErrorDescendant,
} from "../parser/cst-utils";
import { getDirectiveSpecByName } from "../schema";

/**
 * Convert a block-level CST node to one or more BNBlocks.
 *
 * Most nodes produce a single block. Lists produce one block per item.
 * Returns an array to handle both cases uniformly.
 */
export async function convertBlock(
  node: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock[]> {
  // Error nodes fall back to raw text
  if (node.hasError) {
    return [errorBlock(node)];
  }

  switch (node.type) {
    case "heading":
      return [convertHeading(node)];

    case "paragraph":
      return [convertParagraph(node)];

    case "fenced_code_block":
      return [convertCodeBlock(node)];

    case "thematic_break":
      return [{ type: "clnThematicBreak", props: {}, content: [], children: [] }];

    case "unordered_list":
      return convertUnorderedList(node);

    case "ordered_list":
      return convertOrderedList(node);

    case "blockquote":
      return [convertBlockquote(node)];

    case "meta_block":
      return [convertMetaBlock(node)];

    case "block_directive_self_closing":
      return [convertSelfClosingDirective(node)];

    case "block_directive_with_body":
      return [await convertDirectiveWithBody(node, options)];

    default:
      // Unknown block node — render as paragraph with raw text
      return [errorBlock(node)];
  }
}

function convertHeading(node: CSTNode): BNBlock {
  const level = getHeadingLevel(node);
  const inlineNode = findChildByType(node, "inline_content");
  const content = inlineNode ? convertInline(inlineNode) : [];
  return {
    type: "clnHeading",
    props: { level },
    content,
    children: [],
  };
}

function convertParagraph(node: CSTNode): BNBlock {
  const lines = findChildrenByType(node, "paragraph_line");
  const content: BNInlineContent[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      content.push({ type: "text", text: "\n", styles: {} });
    }
    const inlineNode = findChildByType(lines[i], "inline_content");
    if (inlineNode) {
      content.push(...convertInline(inlineNode));
    }
  }

  return {
    type: "clnParagraph",
    props: {},
    content,
    children: [],
  };
}

function convertCodeBlock(node: CSTNode): BNBlock {
  const langNode = findChildByType(node, "language_tag");
  const contentNode = findChildByType(node, "code_block_content");
  return {
    type: "clnCodeBlock",
    props: {
      language: langNode ? langNode.text : "",
      code: contentNode ? contentNode.text : "",
    },
    content: [],
    children: [],
  };
}

function convertUnorderedList(node: CSTNode): BNBlock[] {
  const items = findChildrenByType(node, "unordered_list_item");
  return items.map((item) => {
    const inlineNode = findChildByType(item, "inline_content");
    return {
      type: "clnUnorderedList",
      props: {},
      content: inlineNode ? convertInline(inlineNode) : [],
      children: [],
    };
  });
}

function convertOrderedList(node: CSTNode): BNBlock[] {
  const items = findChildrenByType(node, "ordered_list_item");
  return items.map((item, index) => {
    const markerNode = findChildByType(item, "ordered_list_marker");
    const startNumber = markerNode ? parseInt(markerNode.text, 10) : index + 1;
    const inlineNode = findChildByType(item, "inline_content");
    return {
      type: "clnOrderedList",
      props: { startNumber },
      content: inlineNode ? convertInline(inlineNode) : [],
      children: [],
    };
  });
}

function convertBlockquote(node: CSTNode): BNBlock {
  const lines = findChildrenByType(node, "blockquote_line");
  const content: BNInlineContent[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      content.push({ type: "text", text: "\n", styles: {} });
    }
    const inlineNode = findChildByType(lines[i], "inline_content");
    if (inlineNode) {
      content.push(...convertInline(inlineNode));
    }
  }

  return {
    type: "clnBlockquote",
    props: {},
    content,
    children: [],
  };
}

function convertMetaBlock(node: CSTNode): BNBlock {
  const entries: Record<string, unknown> = {};
  const metaEntries = findChildrenByType(node, "meta_entry");
  for (const entry of metaEntries) {
    const keyNode = findChildByType(entry, "meta_key");
    const valueNode = findChildByType(entry, "value");
    if (keyNode && valueNode) {
      entries[keyNode.text] = parseMetaValue(valueNode);
    }
  }
  return {
    type: "clnMeta",
    props: { entries: JSON.stringify(entries) },
    content: [],
    children: [],
  };
}

function parseMetaValue(valueNode: CSTNode): unknown {
  const stringNode = findChildByType(valueNode, "string");
  if (stringNode) {
    const content = findChildByType(stringNode, "string_content");
    return content ? content.text : "";
  }
  const boolNode = findChildByType(valueNode, "boolean");
  if (boolNode) return boolNode.text === "true";
  const intNode = findChildByType(valueNode, "integer");
  if (intNode) return parseInt(intNode.text, 10);
  const arrayNode = findChildByType(valueNode, "array");
  if (arrayNode) {
    const elements: string[] = [];
    for (const child of arrayNode.children) {
      if (child.type === "string") {
        const content = findChildByType(child, "string_content");
        elements.push(content ? content.text : "");
      }
    }
    return elements;
  }
  return null;
}

function convertSelfClosingDirective(node: CSTNode): BNBlock {
  const name = getDirectiveName(node);
  if (!name) return errorBlock(node);

  const spec = getDirectiveSpecByName(name);
  const type = spec ? spec.type : `cln${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const attrs = getAttributeMap(node);

  const props: Record<string, string | number | boolean> = {};
  if (spec) {
    for (const [key, def] of Object.entries(spec.propSchema)) {
      props[key] = key in attrs ? coerceProp(attrs[key], def.type) : def.default;
    }
  } else {
    for (const [key, val] of Object.entries(attrs)) {
      props[key] = coerceProp(val, "string");
    }
  }

  return {
    type,
    props,
    content: [],
    children: [],
  };
}

async function convertDirectiveWithBody(
  node: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock> {
  const name = getDirectiveName(node);
  if (!name) return errorBlock(node);

  const spec = getDirectiveSpecByName(name);
  const type = spec ? spec.type : `cln${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const attrs = getAttributeMap(node);
  const bodyText = getBodyText(node);

  const props: Record<string, string | number | boolean> = {};
  if (spec) {
    for (const [key, def] of Object.entries(spec.propSchema)) {
      if (key === "rawContent" || key === "tableData") continue;
      props[key] = key in attrs ? coerceProp(attrs[key], def.type) : def.default;
    }
  } else {
    for (const [key, val] of Object.entries(attrs)) {
      props[key] = coerceProp(val, "string");
    }
  }

  const bodyMode = spec?.bodyMode ?? "raw";

  if (bodyMode === "raw") {
    if (name === "table") {
      props.tableData = JSON.stringify(parseTableData(bodyText));
    } else {
      props.rawContent = bodyText;
    }
    return { type, props, content: [], children: [] };
  }

  if (bodyMode === "parsed") {
    // Re-parse the body text to get nested blocks
    if (options?.parseFn && bodyText.trim()) {
      const bodyCst = await options.parseFn(bodyText);
      const { convertDocument } = await import("./converter");
      const children = await convertDocument(bodyCst, options);
      return { type, props, content: [], children };
    }
    // No parseFn or empty body — render body as paragraph text
    const content: BNInlineContent[] = bodyText.trim()
      ? [{ type: "text" as const, text: bodyText.trim(), styles: {} }]
      : [];
    return { type, props, content, children: [] };
  }

  // bodyMode === "none" — shouldn't have a body, but handle gracefully
  return { type, props, content: [], children: [] };
}

/** Parse raw table text into structured rows/cells. */
function parseTableData(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

/** Coerce a CST attribute value to a BlockNote prop type. */
function coerceProp(
  value: string | boolean | number | string[],
  targetType: string
): string | number | boolean {
  if (targetType === "boolean") {
    return typeof value === "boolean" ? value : value === "true";
  }
  if (targetType === "number") {
    return typeof value === "number" ? value : parseInt(String(value), 10) || 0;
  }
  // string — arrays get JSON-stringified
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

/** Create an error fallback block from a CST node. */
function errorBlock(node: CSTNode): BNBlock {
  return {
    type: "clnParagraph",
    props: {},
    content: [{ type: "text", text: node.text, styles: {} }],
    children: [],
    parseError: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/block-converter.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/block-converter.ts editor/src/converter/block-converter.test.ts && git commit -m "feat(converter): block converter for headings, paragraphs, code blocks, thematic breaks"
```

---

### Task 5: Block converter — lists, blockquotes, meta

**Files:**
- Modify: `editor/src/converter/block-converter.test.ts`

**Context:** Tests for list, blockquote, and meta block conversion. The implementation is already in block-converter.ts from Task 4.

- [ ] **Step 1: Add tests for lists, blockquotes, meta**

Append to `editor/src/converter/block-converter.test.ts`:

```typescript
describe("convertBlock — unordered lists", () => {
  it("converts an unordered list to multiple blocks", async () => {
    const cst = node("unordered_list", "- A\n- B", [
      node("unordered_list_item", "- A", [
        node("unordered_list_marker", "- "),
        node("inline_content", "A", [
          node("text", "A"),
        ]),
      ]),
      node("unordered_list_item", "- B", [
        node("unordered_list_marker", "- "),
        node("inline_content", "B", [
          node("text", "B"),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "A", styles: {} }],
      children: [],
    });
    expect(result[1]).toEqual({
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "B", styles: {} }],
      children: [],
    });
  });
});

describe("convertBlock — ordered lists", () => {
  it("converts an ordered list with start numbers", async () => {
    const cst = node("ordered_list", "1. First\n2. Second", [
      node("ordered_list_item", "1. First", [
        node("ordered_list_marker", "1. "),
        node("inline_content", "First", [
          node("text", "First"),
        ]),
      ]),
      node("ordered_list_item", "2. Second", [
        node("ordered_list_marker", "2. "),
        node("inline_content", "Second", [
          node("text", "Second"),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(2);
    expect(result[0].props.startNumber).toBe(1);
    expect(result[1].props.startNumber).toBe(2);
  });
});

describe("convertBlock — blockquotes", () => {
  it("converts a blockquote with multiple lines", async () => {
    const cst = node("blockquote", "> Line 1\n> Line 2", [
      node("blockquote_line", "> Line 1", [
        node("blockquote_marker", "> "),
        node("inline_content", "Line 1", [
          node("text", "Line 1"),
        ]),
      ]),
      node("blockquote_line", "> Line 2", [
        node("blockquote_marker", "> "),
        node("inline_content", "Line 2", [
          node("text", "Line 2"),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnBlockquote");
    expect(result[0].content).toEqual([
      { type: "text", text: "Line 1", styles: {} },
      { type: "text", text: "\n", styles: {} },
      { type: "text", text: "Line 2", styles: {} },
    ]);
  });
});

describe("convertBlock — meta block", () => {
  it("converts a meta block to JSON-encoded entries", async () => {
    const cst = node("meta_block", '::meta{\ntitle = "Doc"\ndraft = true\n}', [
      node("meta_block_open", "::meta{"),
      node("meta_entry", 'title = "Doc"', [
        node("meta_key", "title"),
        node("value", '"Doc"', [
          node("string", '"Doc"', [
            node("string_content", "Doc"),
          ]),
        ]),
      ]),
      node("meta_entry", "draft = true", [
        node("meta_key", "draft"),
        node("value", "true", [
          node("boolean", "true"),
        ]),
      ]),
      node("block_close", "}"),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnMeta");
    const entries = JSON.parse(result[0].props.entries as string);
    expect(entries).toEqual({ title: "Doc", draft: true });
  });

  it("handles meta block with array values", async () => {
    const cst = node("meta_block", '::meta{\nauthors = ["A", "B"]\n}', [
      node("meta_block_open", "::meta{"),
      node("meta_entry", 'authors = ["A", "B"]', [
        node("meta_key", "authors"),
        node("value", '["A", "B"]', [
          node("array", '["A", "B"]', [
            node("string", '"A"', [node("string_content", "A")]),
            node("string", '"B"', [node("string_content", "B")]),
          ]),
        ]),
      ]),
      node("block_close", "}"),
    ]);
    const result = await convertBlock(cst);
    const entries = JSON.parse(result[0].props.entries as string);
    expect(entries).toEqual({ authors: ["A", "B"] });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/block-converter.test.ts
```

Expected: all 14 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/block-converter.test.ts && git commit -m "test(converter): add list, blockquote, and meta block conversion tests"
```

---

### Task 6: Block converter — directives (self-closing, raw-body, parsed-body)

**Files:**
- Modify: `editor/src/converter/block-converter.test.ts`

**Context:** Tests for directive blocks. Self-closing directives (toc, anchor) produce void blocks. Raw-body directives (math, source, table) store body text in props. Parsed-mode directives (callout, figure) re-parse the body via `parseFn` to get nested blocks.

- [ ] **Step 1: Add tests for directive conversion**

Append to `editor/src/converter/block-converter.test.ts`:

```typescript
describe("convertBlock — self-closing directives", () => {
  it("converts ::toc", async () => {
    const cst = node("block_directive_self_closing", "::toc", [
      node("directive_marker", "::"),
      node("directive_name", "toc"),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnToc");
    expect(result[0].content).toEqual([]);
    expect(result[0].children).toEqual([]);
  });

  it("converts ::anchor with id attribute", async () => {
    const cst = node("block_directive_self_closing", '::anchor[id="top"]', [
      node("directive_marker", "::"),
      node("directive_name", "anchor"),
      node("attribute_list", '[id="top"]', [
        node("attribute", 'id="top"', [
          node("attribute_key", "id"),
          node("value", '"top"', [
            node("string", '"top"', [node("string_content", "top")]),
          ]),
        ]),
      ]),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnAnchor");
    expect(result[0].props.id).toBe("top");
  });
});

describe("convertBlock — raw-body directives", () => {
  it("converts ::math with raw content", async () => {
    const cst = node("block_directive_with_body", "::math{\n\\int_0^1 x^2 dx\n}", [
      node("directive_marker", "::"),
      node("directive_name", "math"),
      node("directive_body_open", "{"),
      node("directive_body_content", "\\int_0^1 x^2 dx\n"),
      node("block_close", "}"),
    ]);
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnMath");
    expect(result[0].props.rawContent).toBe("\\int_0^1 x^2 dx\n");
  });

  it("converts ::source with language and raw content", async () => {
    const cst = node("block_directive_with_body", '::source[language="js"]{\nconsole.log("hi");\n}', [
      node("directive_marker", "::"),
      node("directive_name", "source"),
      node("attribute_list", '[language="js"]', [
        node("attribute", 'language="js"', [
          node("attribute_key", "language"),
          node("value", '"js"', [
            node("string", '"js"', [node("string_content", "js")]),
          ]),
        ]),
      ]),
      node("directive_body_open", "{"),
      node("directive_body_content", 'console.log("hi");\n'),
      node("block_close", "}"),
    ]);
    const result = await convertBlock(cst);
    expect(result[0].type).toBe("clnSource");
    expect(result[0].props.language).toBe("js");
    expect(result[0].props.rawContent).toBe('console.log("hi");\n');
  });

  it("converts ::table with structured tableData", async () => {
    const cst = node("block_directive_with_body", "::table[header=true]{\nName | Value\nA | B\n}", [
      node("directive_marker", "::"),
      node("directive_name", "table"),
      node("attribute_list", "[header=true]", [
        node("attribute", "header=true", [
          node("attribute_key", "header"),
          node("value", "true", [node("boolean", "true")]),
        ]),
      ]),
      node("directive_body_open", "{"),
      node("directive_body_content", "Name | Value\nA | B\n"),
      node("block_close", "}"),
    ]);
    const result = await convertBlock(cst);
    expect(result[0].type).toBe("clnTable");
    expect(result[0].props.header).toBe(true);
    const tableData = JSON.parse(result[0].props.tableData as string);
    expect(tableData).toEqual([
      ["Name", "Value"],
      ["A", "B"],
    ]);
  });
});

describe("convertBlock — parsed-mode directives", () => {
  it("converts ::callout without parseFn as raw text", async () => {
    const cst = node("block_directive_with_body", '::callout[kind="info"]{\nBody text.\n}', [
      node("directive_marker", "::"),
      node("directive_name", "callout"),
      node("attribute_list", '[kind="info"]', [
        node("attribute", 'kind="info"', [
          node("attribute_key", "kind"),
          node("value", '"info"', [
            node("string", '"info"', [node("string_content", "info")]),
          ]),
        ]),
      ]),
      node("directive_body_open", "{"),
      node("directive_body_content", "Body text.\n"),
      node("block_close", "}"),
    ]);
    // No parseFn — fallback to text content
    const result = await convertBlock(cst);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.kind).toBe("info");
    expect(result[0].content).toEqual([
      { type: "text", text: "Body text.", styles: {} },
    ]);
  });

  it("converts ::callout with parseFn producing nested blocks", async () => {
    const bodyParagraph = node("paragraph", "Body text.", [
      node("paragraph_line", "Body text.", [
        node("inline_content", "Body text.", [
          node("text", "Body text."),
        ]),
      ]),
    ]);
    const mockParseFn = async (source: string) =>
      node("document", source, [bodyParagraph]);

    const cst = node("block_directive_with_body", '::callout[kind="warning"]{\nBody text.\n}', [
      node("directive_marker", "::"),
      node("directive_name", "callout"),
      node("attribute_list", '[kind="warning"]', [
        node("attribute", 'kind="warning"', [
          node("attribute_key", "kind"),
          node("value", '"warning"', [
            node("string", '"warning"', [node("string_content", "warning")]),
          ]),
        ]),
      ]),
      node("directive_body_open", "{"),
      node("directive_body_content", "Body text.\n"),
      node("block_close", "}"),
    ]);

    const result = await convertBlock(cst, { parseFn: mockParseFn });
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].props.kind).toBe("warning");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].type).toBe("clnParagraph");
    expect(result[0].children[0].content).toEqual([
      { type: "text", text: "Body text.", styles: {} },
    ]);
  });
});

describe("convertBlock — error handling", () => {
  it("converts error nodes to parseError blocks", async () => {
    const cst = node("heading", "# broken");
    cst.hasError = true;
    const result = await convertBlock(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnParagraph");
    expect(result[0].parseError).toBe(true);
    expect(result[0].content).toEqual([
      { type: "text", text: "# broken", styles: {} },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/block-converter.test.ts
```

Expected: all 24 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/block-converter.test.ts && git commit -m "test(converter): add directive and error handling block conversion tests"
```

---

### Task 7: Document converter + barrel export

**Files:**
- Create: `editor/src/converter/converter.ts`
- Create: `editor/src/converter/converter.test.ts`
- Create: `editor/src/converter/index.ts`

**Context:** The document converter is the main entry point. It walks the top-level `document` CST node's children and delegates to `convertBlock`. It also filters out non-block nodes (like `bom`).

- [ ] **Step 1: Write the tests**

Create `editor/src/converter/converter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { convertDocument } from "./converter";
import type { CSTNode } from "../parser/types";

/** Helper: build a minimal CSTNode. */
function node(type: string, text: string, children: CSTNode[] = []): CSTNode {
  return {
    type,
    text,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    isNamed: true,
    hasError: false,
    children,
    fieldName: null,
  };
}

describe("convertDocument", () => {
  it("converts an empty document", async () => {
    const cst = node("document", "");
    const result = await convertDocument(cst);
    expect(result).toEqual([]);
  });

  it("converts a document with a heading and paragraph", async () => {
    const cst = node("document", "# Title\n\nHello.", [
      node("heading", "# Title", [
        node("heading_marker", "#"),
        node("inline_content", "Title", [
          node("text", "Title"),
        ]),
      ]),
      node("paragraph", "Hello.", [
        node("paragraph_line", "Hello.", [
          node("inline_content", "Hello.", [
            node("text", "Hello."),
          ]),
        ]),
      ]),
    ]);
    const result = await convertDocument(cst);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("clnHeading");
    expect(result[1].type).toBe("clnParagraph");
  });

  it("skips bom nodes", async () => {
    const cst = node("document", "\uFEFF# Title", [
      node("bom", "\uFEFF"),
      node("heading", "# Title", [
        node("heading_marker", "#"),
        node("inline_content", "Title", [
          node("text", "Title"),
        ]),
      ]),
    ]);
    const result = await convertDocument(cst);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnHeading");
  });

  it("expands lists into multiple blocks", async () => {
    const cst = node("document", "- A\n- B\n- C", [
      node("unordered_list", "- A\n- B\n- C", [
        node("unordered_list_item", "- A", [
          node("unordered_list_marker", "- "),
          node("inline_content", "A", [node("text", "A")]),
        ]),
        node("unordered_list_item", "- B", [
          node("unordered_list_marker", "- "),
          node("inline_content", "B", [node("text", "B")]),
        ]),
        node("unordered_list_item", "- C", [
          node("unordered_list_marker", "- "),
          node("inline_content", "C", [node("text", "C")]),
        ]),
      ]),
    ]);
    const result = await convertDocument(cst);
    expect(result).toHaveLength(3);
    expect(result.every((b) => b.type === "clnUnorderedList")).toBe(true);
  });

  it("passes options through to block converter", async () => {
    const bodyDoc = node("document", "Inner.", [
      node("paragraph", "Inner.", [
        node("paragraph_line", "Inner.", [
          node("inline_content", "Inner.", [node("text", "Inner.")]),
        ]),
      ]),
    ]);
    const mockParseFn = async (_source: string) => bodyDoc;

    const cst = node("document", '::callout[kind="info"]{\nInner.\n}', [
      node("block_directive_with_body", '::callout[kind="info"]{\nInner.\n}', [
        node("directive_marker", "::"),
        node("directive_name", "callout"),
        node("attribute_list", '[kind="info"]', [
          node("attribute", 'kind="info"', [
            node("attribute_key", "kind"),
            node("value", '"info"', [
              node("string", '"info"', [node("string_content", "info")]),
            ]),
          ]),
        ]),
        node("directive_body_open", "{"),
        node("directive_body_content", "Inner.\n"),
        node("block_close", "}"),
      ]),
    ]);

    const result = await convertDocument(cst, { parseFn: mockParseFn });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("clnCallout");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].type).toBe("clnParagraph");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/converter.test.ts
```

Expected: FAIL — module `./converter` not found.

- [ ] **Step 3: Implement the document converter**

Create `editor/src/converter/converter.ts`:

```typescript
import type { CSTNode } from "../parser/types";
import type { BNBlock, ConvertOptions } from "./types";
import { convertBlock } from "./block-converter";

/** CST node types to skip at the document level. */
const SKIP_TYPES = new Set(["bom", "block_close", "meta_block_open"]);

/**
 * Convert a tree-sitter CST document node to an array of BlockNote blocks.
 *
 * @param cst - The root "document" CSTNode from tree-sitter
 * @param options - Optional config (parseFn for parsed-mode directive bodies)
 * @returns Array of BNBlock objects ready for BlockNote's document model
 */
export async function convertDocument(
  cst: CSTNode,
  options?: ConvertOptions
): Promise<BNBlock[]> {
  const blocks: BNBlock[] = [];

  for (const child of cst.children) {
    if (SKIP_TYPES.has(child.type)) continue;
    if (!child.isNamed) continue;

    const converted = await convertBlock(child, options);
    blocks.push(...converted);
  }

  return blocks;
}
```

- [ ] **Step 4: Create the barrel export**

Create `editor/src/converter/index.ts`:

```typescript
export { convertDocument } from "./converter";
export { convertBlock } from "./block-converter";
export { convertInline } from "./inline-converter";
export type {
  BNBlock,
  BNInlineContent,
  BNStyledText,
  BNLink,
  BNTableContent,
  BNTableRow,
  ConvertOptions,
} from "./types";
```

- [ ] **Step 5: Run all converter tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/converter/
```

Expected: all tests PASS across all converter test files.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/converter/converter.ts editor/src/converter/converter.test.ts editor/src/converter/index.ts && git commit -m "feat(converter): document converter entry point and barrel export"
```

---

## Phase 4: BlockNote-to-CLN Serializer

### Task 8: Escaping utilities + shared test matrix

**Files:**
- Create: `fixtures/escaping-matrix.json`
- Create: `editor/src/serializer/escaping.ts`
- Create: `editor/src/serializer/escaping.test.ts`

**Context:** ClearNotation has three escaping domains:
1. **Inline content**: `\{`, `\}`, `\[`, `\]`, `\\`, `\+`, `\*`, `\^`, `` \` ``, `\:` — characters that have syntactic meaning in inline text
2. **Attribute strings**: `\\`, `\"` — inside quoted attribute values
3. **Table cells**: `\|`, `\\` — pipe separates cells, backslash escapes

The shared matrix is a JSON file that both JS and Python tests can consume for cross-language parity testing.

- [ ] **Step 1: Create the shared escaping test matrix**

Create `fixtures/escaping-matrix.json`:

```json
{
  "version": "0.1",
  "description": "Shared cross-language escaping test matrix for ClearNotation",
  "domains": {
    "inline": {
      "description": "Characters with syntactic meaning in inline content",
      "cases": [
        { "raw": "{", "escaped": "\\{", "note": "opens strong/emphasis/note" },
        { "raw": "}", "escaped": "\\}", "note": "closes strong/emphasis/note" },
        { "raw": "[", "escaped": "\\[", "note": "opens link" },
        { "raw": "]", "escaped": "\\]", "note": "closes link" },
        { "raw": "\\", "escaped": "\\\\", "note": "escape character itself" },
        { "raw": "`", "escaped": "\\`", "note": "code span delimiter" },
        { "raw": "+{", "escaped": "\\+{", "note": "strong open (escape the +)" },
        { "raw": "*{", "escaped": "\\*{", "note": "emphasis open (escape the *)" },
        { "raw": "^{", "escaped": "\\^{", "note": "note open (escape the ^)" },
        { "raw": "::", "escaped": "\\::", "note": "directive marker (escape first :)" },
        { "raw": "hello world", "escaped": "hello world", "note": "no escaping needed" },
        { "raw": "a { b", "escaped": "a \\{ b", "note": "brace in text" },
        { "raw": "100% done", "escaped": "100% done", "note": "percent is not special" },
        { "raw": "a -> b", "escaped": "a -> b", "note": "arrow outside link is literal" }
      ]
    },
    "attribute": {
      "description": "Characters needing escaping inside quoted attribute strings",
      "cases": [
        { "raw": "hello", "escaped": "hello", "note": "no escaping needed" },
        { "raw": "say \"hi\"", "escaped": "say \\\"hi\\\"", "note": "double quotes" },
        { "raw": "back\\slash", "escaped": "back\\\\slash", "note": "backslash" },
        { "raw": "line\nbreak", "escaped": "line\\nbreak", "note": "newline" },
        { "raw": "tab\there", "escaped": "tab\\there", "note": "tab" }
      ]
    },
    "table": {
      "description": "Characters needing escaping inside table cells",
      "cases": [
        { "raw": "hello", "escaped": "hello", "note": "no escaping needed" },
        { "raw": "a | b", "escaped": "a \\| b", "note": "pipe is cell separator" },
        { "raw": "back\\slash", "escaped": "back\\\\slash", "note": "backslash" },
        { "raw": "a | b | c", "escaped": "a \\| b \\| c", "note": "multiple pipes" }
      ]
    }
  }
}
```

- [ ] **Step 2: Write the escaping tests**

Create `editor/src/serializer/escaping.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  escapeInline,
  unescapeInline,
  escapeAttribute,
  escapeTableCell,
} from "./escaping";
import matrix from "../../../fixtures/escaping-matrix.json";

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

  it("is the inverse of escapeInline", () => {
    const inputs = ["hello {world}", "+{strong} `code`", "a\\b [x -> y]"];
    for (const input of inputs) {
      expect(unescapeInline(escapeInline(input))).toBe(input);
    }
  });
});

describe("escapeAttribute", () => {
  for (const tc of matrix.domains.attribute.cases) {
    it(`escapes: ${tc.note}`, () => {
      expect(escapeAttribute(tc.raw)).toBe(tc.escaped);
    });
  }
});

describe("escapeTableCell", () => {
  for (const tc of matrix.domains.table.cases) {
    it(`escapes: ${tc.note}`, () => {
      expect(escapeTableCell(tc.raw)).toBe(tc.escaped);
    });
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/escaping.test.ts
```

Expected: FAIL — module `./escaping` not found.

- [ ] **Step 4: Implement the escaping utilities**

Create `editor/src/serializer/escaping.ts`:

```typescript
/**
 * ClearNotation escaping utilities.
 *
 * Three escaping domains:
 *   1. Inline content: characters with syntactic meaning in inline text
 *   2. Attribute strings: inside quoted attribute values
 *   3. Table cells: pipe and backslash
 */

/**
 * Escape a raw string for use in ClearNotation inline content.
 * Must escape: { } [ ] \ ` and the two-char sequences +{ *{ ^{ ::
 */
export function escapeInline(raw: string): string {
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    // Two-char sequences: +{ *{ ^{ ::
    if ((ch === "+" || ch === "*" || ch === "^") && next === "{") {
      result += "\\" + ch + "{";
      i++; // skip the {
      continue;
    }
    if (ch === ":" && next === ":") {
      result += "\\::";
      i++; // skip second :
      continue;
    }

    // Single-char escapes
    if (ch === "\\" || ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "`") {
      result += "\\" + ch;
      continue;
    }

    result += ch;
  }
  return result;
}

/**
 * Unescape a ClearNotation inline string back to raw text.
 * Reverses escapeInline: removes the leading backslash from escape sequences.
 */
export function unescapeInline(escaped: string): string {
  let result = "";
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === "\\" && i + 1 < escaped.length) {
      result += escaped[i + 1];
      i++; // skip the escaped character
      continue;
    }
    result += escaped[i];
  }
  return result;
}

/**
 * Escape a raw string for use inside a quoted attribute value.
 * Must escape: \ " and control chars (\n, \t).
 */
export function escapeAttribute(raw: string): string {
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\") {
      result += "\\\\";
    } else if (ch === '"') {
      result += '\\"';
    } else if (ch === "\n") {
      result += "\\n";
    } else if (ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Escape a raw string for use inside a table cell.
 * Must escape: | and \.
 */
export function escapeTableCell(raw: string): string {
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\") {
      result += "\\\\";
    } else if (ch === "|") {
      result += "\\|";
    } else {
      result += ch;
    }
  }
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/escaping.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add fixtures/escaping-matrix.json editor/src/serializer/escaping.ts editor/src/serializer/escaping.test.ts && git commit -m "feat(serializer): escaping utilities with shared cross-language test matrix"
```

---

### Task 9: Inline serializer

**Files:**
- Create: `editor/src/serializer/inline-serializer.ts`
- Create: `editor/src/serializer/inline-serializer.test.ts`

**Context:** The inline serializer converts `BNInlineContent[]` (flat styled-text + links) back to ClearNotation inline syntax (nested delimiters). This requires a "style-to-tree" algorithm:

1. Walk the content items left to right
2. Group consecutive items that share the same outermost mark
3. Emit the opening delimiter for that mark
4. Recurse with that mark removed from all items in the group
5. Emit the closing delimiter
6. For items with no marks, emit escaped plain text
7. For links, emit `[label -> target]`

Mark priority (outermost first): clnNote > clnStrong > clnEmphasis > clnCode > clnRef

- [ ] **Step 1: Write the tests**

Create `editor/src/serializer/inline-serializer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeInline } from "./inline-serializer";
import type { BNInlineContent } from "../converter/types";

describe("serializeInline", () => {
  it("serializes plain text", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "hello", styles: {} },
    ];
    expect(serializeInline(content)).toBe("hello");
  });

  it("escapes special characters in plain text", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "a { b", styles: {} },
    ];
    expect(serializeInline(content)).toBe("a \\{ b");
  });

  it("serializes strong text", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "bold", styles: { clnStrong: true } },
    ];
    expect(serializeInline(content)).toBe("+{bold}");
  });

  it("serializes emphasis text", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "italic", styles: { clnEmphasis: true } },
    ];
    expect(serializeInline(content)).toBe("*{italic}");
  });

  it("serializes code span", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "code", styles: { clnCode: true } },
    ];
    expect(serializeInline(content)).toBe("`code`");
  });

  it("serializes code inside strong", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "code", styles: { clnStrong: true, clnCode: true } },
    ];
    expect(serializeInline(content)).toBe("+{`code`}");
  });

  it("serializes a link", () => {
    const content: BNInlineContent[] = [
      {
        type: "link",
        href: "/docs",
        content: [{ type: "text", text: "docs", styles: {} }],
      },
    ];
    expect(serializeInline(content)).toBe("[docs -> /docs]");
  });

  it("serializes a link with styled label", () => {
    const content: BNInlineContent[] = [
      {
        type: "link",
        href: "/api",
        content: [
          { type: "text", text: "API", styles: { clnStrong: true } },
          { type: "text", text: " ref", styles: {} },
        ],
      },
    ];
    expect(serializeInline(content)).toBe("[+{API} ref -> /api]");
  });

  it("serializes a ref", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "intro", styles: { clnRef: "intro" } },
    ];
    expect(serializeInline(content)).toBe('::ref[target="intro"]');
  });

  it("serializes a note", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "a note", styles: { clnNote: true } },
    ];
    expect(serializeInline(content)).toBe("^{a note}");
  });

  it("serializes a note with nested link", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "See ", styles: { clnNote: true } },
      {
        type: "link",
        href: "/g",
        content: [{ type: "text", text: "guide", styles: { clnNote: true } }],
      },
      { type: "text", text: ".", styles: { clnNote: true } },
    ];
    expect(serializeInline(content)).toBe("^{See [guide -> /g].}");
  });

  it("serializes mixed content", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "plain ", styles: {} },
      { type: "text", text: "bold", styles: { clnStrong: true } },
      { type: "text", text: " end", styles: {} },
    ];
    expect(serializeInline(content)).toBe("plain +{bold} end");
  });

  it("serializes note with strong and code", () => {
    const content: BNInlineContent[] = [
      { type: "text", text: "key", styles: { clnNote: true, clnStrong: true } },
      { type: "text", text: " is ", styles: { clnNote: true } },
      { type: "text", text: "val", styles: { clnNote: true, clnCode: true } },
    ];
    expect(serializeInline(content)).toBe("^{+{key} is `val`}");
  });

  it("serializes empty content", () => {
    expect(serializeInline([])).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/inline-serializer.test.ts
```

Expected: FAIL — module `./inline-serializer` not found.

- [ ] **Step 3: Implement the inline serializer**

Create `editor/src/serializer/inline-serializer.ts`:

```typescript
import type { BNInlineContent, BNStyledText, BNLink } from "../converter/types";
import { escapeInline } from "./escaping";

/**
 * Mark priority for style-to-tree reconstruction.
 * Higher priority marks become the outermost delimiters.
 */
const MARK_PRIORITY: string[] = ["clnNote", "clnStrong", "clnEmphasis", "clnCode", "clnRef"];

/**
 * Serialize an array of BlockNote inline content items to ClearNotation inline text.
 */
export function serializeInline(content: BNInlineContent[]): string {
  if (content.length === 0) return "";
  return serializeItems(content);
}

function serializeItems(items: BNInlineContent[]): string {
  let result = "";
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    if (item.type === "link") {
      result += serializeLink(item);
      i++;
      continue;
    }

    // Check for ref style (clnRef is a string value, not boolean)
    if (typeof item.styles.clnRef === "string") {
      result += `::ref[target="${item.styles.clnRef}"]`;
      i++;
      continue;
    }

    // Find the highest-priority active mark on this item
    const outerMark = findOuterMark(item.styles);

    if (!outerMark) {
      // No marks — emit escaped plain text
      result += escapeInline(item.text);
      i++;
      continue;
    }

    // Group consecutive items that share this mark
    const group: BNInlineContent[] = [];
    while (i < items.length && itemHasMark(items[i], outerMark)) {
      group.push(items[i]);
      i++;
    }

    // Emit the mark's delimiter and recurse with the mark removed
    result += emitMark(outerMark, group);
  }

  return result;
}

function serializeLink(link: BNLink): string {
  const label = serializeItems(link.content);
  return `[${label} -> ${link.href}]`;
}

/**
 * Find the highest-priority mark active on a styled text node.
 */
function findOuterMark(styles: Record<string, boolean | string>): string | null {
  for (const mark of MARK_PRIORITY) {
    if (styles[mark] === true) return mark;
  }
  return null;
}

/**
 * Check if an inline content item has a specific mark active.
 */
function itemHasMark(item: BNInlineContent, mark: string): boolean {
  if (item.type === "link") {
    // A link is "inside" a mark if all its content text nodes have the mark
    return item.content.every((t) => t.styles[mark] === true);
  }
  // Ref items don't participate in mark grouping
  if (typeof (item as BNStyledText).styles.clnRef === "string") return false;
  return (item as BNStyledText).styles[mark] === true;
}

/**
 * Emit a mark's delimiters around grouped content.
 * Removes the mark from all items before recursing.
 */
function emitMark(mark: string, items: BNInlineContent[]): string {
  const { open, close } = MARK_DELIMITERS[mark];

  // Strip this mark from all items for the recursive call
  const stripped = items.map((item) => stripMark(item, mark));

  return open + serializeItems(stripped) + close;
}

function stripMark(item: BNInlineContent, mark: string): BNInlineContent {
  if (item.type === "link") {
    return {
      ...item,
      content: item.content.map((t) => ({
        ...t,
        styles: withoutKey(t.styles, mark),
      })),
    };
  }
  return {
    ...item,
    styles: withoutKey((item as BNStyledText).styles, mark),
  };
}

function withoutKey(
  obj: Record<string, boolean | string>,
  key: string
): Record<string, boolean | string> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/** Mark name → ClearNotation delimiters. */
const MARK_DELIMITERS: Record<string, { open: string; close: string }> = {
  clnStrong: { open: "+{", close: "}" },
  clnEmphasis: { open: "*{", close: "}" },
  clnCode: { open: "`", close: "`" },
  clnNote: { open: "^{", close: "}" },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/inline-serializer.test.ts
```

Expected: all 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/serializer/inline-serializer.ts editor/src/serializer/inline-serializer.test.ts && git commit -m "feat(serializer): inline serializer with style-to-tree reconstruction"
```

---

### Task 10: Block serializer

**Files:**
- Create: `editor/src/serializer/block-serializer.ts`
- Create: `editor/src/serializer/block-serializer.test.ts`

**Context:** The block serializer converts a `BNBlock` to one or more lines of ClearNotation source text. Each block type has its own serialization format.

- [ ] **Step 1: Write the tests**

Create `editor/src/serializer/block-serializer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeBlock } from "./block-serializer";
import type { BNBlock } from "../converter/types";

describe("serializeBlock", () => {
  it("serializes a heading", () => {
    const block: BNBlock = {
      type: "clnHeading",
      props: { level: 2 },
      content: [{ type: "text", text: "Title", styles: {} }],
      children: [],
    };
    expect(serializeBlock(block)).toBe("## Title");
  });

  it("serializes a heading with inline formatting", () => {
    const block: BNBlock = {
      type: "clnHeading",
      props: { level: 1 },
      content: [
        { type: "text", text: "Bold", styles: { clnStrong: true } },
        { type: "text", text: " title", styles: {} },
      ],
      children: [],
    };
    expect(serializeBlock(block)).toBe("# +{Bold} title");
  });

  it("serializes a paragraph", () => {
    const block: BNBlock = {
      type: "clnParagraph",
      props: {},
      content: [{ type: "text", text: "Hello world.", styles: {} }],
      children: [],
    };
    expect(serializeBlock(block)).toBe("Hello world.");
  });

  it("serializes a multi-line paragraph", () => {
    const block: BNBlock = {
      type: "clnParagraph",
      props: {},
      content: [
        { type: "text", text: "Line 1.", styles: {} },
        { type: "text", text: "\n", styles: {} },
        { type: "text", text: "Line 2.", styles: {} },
      ],
      children: [],
    };
    expect(serializeBlock(block)).toBe("Line 1.\nLine 2.");
  });

  it("serializes a code block", () => {
    const block: BNBlock = {
      type: "clnCodeBlock",
      props: { language: "python", code: 'print("hi")\n' },
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe('```python\nprint("hi")\n```');
  });

  it("serializes a thematic break", () => {
    const block: BNBlock = {
      type: "clnThematicBreak",
      props: {},
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe("---");
  });

  it("serializes an unordered list item", () => {
    const block: BNBlock = {
      type: "clnUnorderedList",
      props: {},
      content: [{ type: "text", text: "Item", styles: {} }],
      children: [],
    };
    expect(serializeBlock(block)).toBe("- Item");
  });

  it("serializes an ordered list item", () => {
    const block: BNBlock = {
      type: "clnOrderedList",
      props: { startNumber: 3 },
      content: [{ type: "text", text: "Third", styles: {} }],
      children: [],
    };
    expect(serializeBlock(block)).toBe("3. Third");
  });

  it("serializes a blockquote", () => {
    const block: BNBlock = {
      type: "clnBlockquote",
      props: {},
      content: [
        { type: "text", text: "Line 1", styles: {} },
        { type: "text", text: "\n", styles: {} },
        { type: "text", text: "Line 2", styles: {} },
      ],
      children: [],
    };
    expect(serializeBlock(block)).toBe("> Line 1\n> Line 2");
  });

  it("serializes a meta block", () => {
    const block: BNBlock = {
      type: "clnMeta",
      props: { entries: '{"title":"Doc","draft":true}' },
      content: [],
      children: [],
    };
    const result = serializeBlock(block);
    expect(result).toContain("::meta{");
    expect(result).toContain('title = "Doc"');
    expect(result).toContain("draft = true");
    expect(result).toContain("}");
  });

  it("serializes ::toc", () => {
    const block: BNBlock = {
      type: "clnToc",
      props: {},
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe("::toc");
  });

  it("serializes ::anchor with id", () => {
    const block: BNBlock = {
      type: "clnAnchor",
      props: { id: "top" },
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe('::anchor[id="top"]');
  });

  it("serializes ::math with raw content", () => {
    const block: BNBlock = {
      type: "clnMath",
      props: { rawContent: "x^2 + y^2" },
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe("::math{\nx^2 + y^2\n}");
  });

  it("serializes ::source with language", () => {
    const block: BNBlock = {
      type: "clnSource",
      props: { language: "js", rawContent: "console.log();\n" },
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe('::source[language="js"]{\nconsole.log();\n\n}');
  });

  it("serializes ::table with tableData", () => {
    const block: BNBlock = {
      type: "clnTable",
      props: { header: true, tableData: '[["Name","Value"],["A","B"]]' },
      content: [],
      children: [],
    };
    expect(serializeBlock(block)).toBe("::table[header=true]{\nName | Value\nA | B\n}");
  });

  it("serializes ::callout with children", () => {
    const block: BNBlock = {
      type: "clnCallout",
      props: { kind: "info", title: "" },
      content: [],
      children: [
        {
          type: "clnParagraph",
          props: {},
          content: [{ type: "text", text: "Body text.", styles: {} }],
          children: [],
        },
      ],
    };
    expect(serializeBlock(block)).toBe('::callout[kind="info"]{\nBody text.\n}');
  });

  it("serializes ::callout with title and children", () => {
    const block: BNBlock = {
      type: "clnCallout",
      props: { kind: "warning", title: "Heads up" },
      content: [],
      children: [
        {
          type: "clnParagraph",
          props: {},
          content: [{ type: "text", text: "Be careful.", styles: {} }],
          children: [],
        },
      ],
    };
    expect(serializeBlock(block)).toBe('::callout[kind="warning", title="Heads up"]{\nBe careful.\n}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/block-serializer.test.ts
```

Expected: FAIL — module `./block-serializer` not found.

- [ ] **Step 3: Implement the block serializer**

Create `editor/src/serializer/block-serializer.ts`:

```typescript
import type { BNBlock } from "../converter/types";
import { serializeInline } from "./inline-serializer";
import { escapeAttribute, escapeTableCell } from "./escaping";
import { getDirectiveSpecByName } from "../schema";

/**
 * Serialize a BNBlock to ClearNotation source text (without trailing newline).
 */
export function serializeBlock(block: BNBlock): string {
  switch (block.type) {
    case "clnHeading":
      return serializeHeading(block);
    case "clnParagraph":
      return serializeParagraph(block);
    case "clnCodeBlock":
      return serializeCodeBlock(block);
    case "clnThematicBreak":
      return "---";
    case "clnUnorderedList":
      return `- ${serializeInline(block.content)}`;
    case "clnOrderedList":
      return `${block.props.startNumber ?? 1}. ${serializeInline(block.content)}`;
    case "clnBlockquote":
      return serializeBlockquote(block);
    case "clnMeta":
      return serializeMetaBlock(block);
    default:
      return serializeDirective(block);
  }
}

function serializeHeading(block: BNBlock): string {
  const level = (block.props.level as number) || 1;
  const marker = "#".repeat(level);
  return `${marker} ${serializeInline(block.content)}`;
}

function serializeParagraph(block: BNBlock): string {
  return serializeInline(block.content);
}

function serializeCodeBlock(block: BNBlock): string {
  const lang = block.props.language as string || "";
  const code = block.props.code as string || "";
  return `\`\`\`${lang}\n${code}\`\`\``;
}

function serializeBlockquote(block: BNBlock): string {
  const text = serializeInline(block.content);
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function serializeMetaBlock(block: BNBlock): string {
  const entries = JSON.parse((block.props.entries as string) || "{}");
  const lines = ["::meta{"];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key} = ${formatMetaValue(value)}`);
  }
  lines.push("}");
  return lines.join("\n");
}

function formatMetaValue(value: unknown): string {
  if (typeof value === "string") return `"${escapeAttribute(value)}"`;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((v) =>
      typeof v === "string" ? `"${escapeAttribute(v)}"` : String(v)
    );
    return `[${items.join(", ")}]`;
  }
  return String(value);
}

function serializeDirective(block: BNBlock): string {
  // Derive directive name from block type: "clnCallout" -> "callout"
  const directiveName = block.type.replace(/^cln/, "");
  const name = directiveName.charAt(0).toLowerCase() + directiveName.slice(1);

  const spec = getDirectiveSpecByName(name);
  const bodyMode = spec?.bodyMode ?? "none";

  // Build attribute list
  const attrStr = serializeAttributes(block, name);
  const attrPart = attrStr ? `[${attrStr}]` : "";

  if (bodyMode === "none") {
    return `::${name}${attrPart}`;
  }

  if (bodyMode === "raw") {
    if (name === "table") {
      return serializeTable(block, attrPart);
    }
    const rawContent = (block.props.rawContent as string) || "";
    // Ensure body ends with newline for clean formatting
    const body = rawContent.endsWith("\n") ? rawContent + "\n" : rawContent + "\n";
    return `::${name}${attrPart}{\n${body}}`;
  }

  // bodyMode === "parsed" — serialize children as body
  if (block.children.length === 0) {
    return `::${name}${attrPart}{\n}`;
  }

  const bodyLines = block.children.map((child) => serializeBlock(child));
  return `::${name}${attrPart}{\n${bodyLines.join("\n\n")}\n}`;
}

function serializeAttributes(block: BNBlock, directiveName: string): string {
  const spec = getDirectiveSpecByName(directiveName);
  const parts: string[] = [];

  for (const [key, value] of Object.entries(block.props)) {
    // Skip internal props
    if (key === "rawContent" || key === "tableData") continue;

    // Skip props at their default value (unless they're required)
    if (spec) {
      const attrSpec = spec.registryAttributes.find((a) => a.name === key);
      const propDef = spec.propSchema[key];
      if (propDef && value === propDef.default && attrSpec && !attrSpec.required) {
        continue;
      }
    }

    if (typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (typeof value === "number") {
      parts.push(`${key}=${value}`);
    } else {
      parts.push(`${key}="${escapeAttribute(String(value))}"`);
    }
  }

  return parts.join(", ");
}

function serializeTable(block: BNBlock, attrPart: string): string {
  const tableData: string[][] = JSON.parse(
    (block.props.tableData as string) || "[]"
  );
  const rows = tableData
    .map((row) => row.map((cell) => escapeTableCell(cell)).join(" | "))
    .join("\n");
  return `::${block.type === "clnTable" ? "table" : "table"}${attrPart}{\n${rows}\n}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/block-serializer.test.ts
```

Expected: all 17 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/serializer/block-serializer.ts editor/src/serializer/block-serializer.test.ts && git commit -m "feat(serializer): block serializer for all ClearNotation block types"
```

---

### Task 11: Document serializer + roundtrip tests + barrel export

**Files:**
- Create: `editor/src/serializer/serializer.ts`
- Create: `editor/src/serializer/serializer.test.ts`
- Create: `editor/src/serializer/index.ts`

**Context:** The document serializer joins blocks with blank lines. Consecutive list items of the same type are joined with single newlines (not blank lines) since they form a single list. Roundtrip tests verify: parse fixture → convert to BNBlock[] → serialize → compare against original source.

- [ ] **Step 1: Write the tests**

Create `editor/src/serializer/serializer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeDocument } from "./serializer";
import type { BNBlock } from "../converter/types";

describe("serializeDocument", () => {
  it("serializes an empty document", () => {
    expect(serializeDocument([])).toBe("");
  });

  it("serializes a single paragraph", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "Hello.", styles: {} }],
        children: [],
      },
    ];
    expect(serializeDocument(blocks)).toBe("Hello.\n");
  });

  it("separates blocks with blank lines", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnHeading",
        props: { level: 1 },
        content: [{ type: "text", text: "Title", styles: {} }],
        children: [],
      },
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "Body.", styles: {} }],
        children: [],
      },
    ];
    expect(serializeDocument(blocks)).toBe("# Title\n\nBody.\n");
  });

  it("joins consecutive list items with single newlines", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnUnorderedList",
        props: {},
        content: [{ type: "text", text: "A", styles: {} }],
        children: [],
      },
      {
        type: "clnUnorderedList",
        props: {},
        content: [{ type: "text", text: "B", styles: {} }],
        children: [],
      },
      {
        type: "clnUnorderedList",
        props: {},
        content: [{ type: "text", text: "C", styles: {} }],
        children: [],
      },
    ];
    expect(serializeDocument(blocks)).toBe("- A\n- B\n- C\n");
  });

  it("joins consecutive ordered list items with single newlines", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnOrderedList",
        props: { startNumber: 1 },
        content: [{ type: "text", text: "First", styles: {} }],
        children: [],
      },
      {
        type: "clnOrderedList",
        props: { startNumber: 2 },
        content: [{ type: "text", text: "Second", styles: {} }],
        children: [],
      },
    ];
    expect(serializeDocument(blocks)).toBe("1. First\n2. Second\n");
  });

  it("separates different block types with blank lines", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnUnorderedList",
        props: {},
        content: [{ type: "text", text: "A", styles: {} }],
        children: [],
      },
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "Text.", styles: {} }],
        children: [],
      },
    ];
    expect(serializeDocument(blocks)).toBe("- A\n\nText.\n");
  });

  it("skips parseError blocks", () => {
    const blocks: BNBlock[] = [
      {
        type: "clnHeading",
        props: { level: 1 },
        content: [{ type: "text", text: "Title", styles: {} }],
        children: [],
      },
      {
        type: "clnParagraph",
        props: {},
        content: [{ type: "text", text: "broken", styles: {} }],
        children: [],
        parseError: true,
      },
    ];
    // parseError blocks emit their raw text as-is
    expect(serializeDocument(blocks)).toBe("# Title\n\nbroken\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/serializer.test.ts
```

Expected: FAIL — module `./serializer` not found.

- [ ] **Step 3: Implement the document serializer**

Create `editor/src/serializer/serializer.ts`:

```typescript
import type { BNBlock } from "../converter/types";
import { serializeBlock } from "./block-serializer";

/** List block types that should be joined with single newlines. */
const LIST_TYPES = new Set(["clnUnorderedList", "clnOrderedList"]);

/**
 * Serialize an array of BNBlocks to ClearNotation source text.
 *
 * Blocks are separated by blank lines, except consecutive list items
 * of the same type which are separated by single newlines.
 */
export function serializeDocument(blocks: BNBlock[]): string {
  if (blocks.length === 0) return "";

  const parts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const serialized = serializeBlock(block);

    if (i > 0) {
      const prev = blocks[i - 1];
      // Consecutive list items of the same type get single newlines
      if (LIST_TYPES.has(block.type) && block.type === prev.type) {
        parts.push("\n");
      } else {
        parts.push("\n\n");
      }
    }

    parts.push(serialized);
  }

  // Trailing newline
  parts.push("\n");

  return parts.join("");
}
```

- [ ] **Step 4: Create the barrel export**

Create `editor/src/serializer/index.ts`:

```typescript
export { serializeDocument } from "./serializer";
export { serializeBlock } from "./block-serializer";
export { serializeInline } from "./inline-serializer";
export {
  escapeInline,
  unescapeInline,
  escapeAttribute,
  escapeTableCell,
} from "./escaping";
```

- [ ] **Step 5: Run all serializer tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test -- src/serializer/
```

Expected: all tests PASS across all serializer test files.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryan/projects/clear-notation && git add editor/src/serializer/serializer.ts editor/src/serializer/serializer.test.ts editor/src/serializer/index.ts && git commit -m "feat(serializer): document serializer with list grouping and barrel export"
```

---

### Task 12: Full test suite verification + final integration

**Files:**
- No new files — verification only

**Context:** Run all editor tests to verify the converter and serializer modules integrate correctly with the existing parser and schema modules. No new code — just a verification checkpoint.

- [ ] **Step 1: Run all editor tests**

```bash
cd /Users/ryan/projects/clear-notation/editor && pnpm test
```

Expected: all tests PASS. Total should be ~140+ tests (111 existing + ~30 new).

- [ ] **Step 2: Run TypeScript type check**

```bash
cd /Users/ryan/projects/clear-notation/editor && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Verify the existing Python tests still pass**

```bash
cd /Users/ryan/projects/clear-notation && python3 -m unittest discover -s tests -v
```

Expected: all Python tests PASS (no regressions).

- [ ] **Step 4: Verify the fixture harness still passes**

```bash
cd /Users/ryan/projects/clear-notation && python3 -m clearnotation_harness --manifest fixtures/manifest.toml --adapter clearnotation_reference.adapter:create_adapter
```

Expected: 41 pass, 3 fail (the same 3 tree-sitter grammar failures noted in TODOS.md).

- [ ] **Step 5: Commit verification note (no changes expected)**

If any fixes were needed, commit them:

```bash
cd /Users/ryan/projects/clear-notation && git add -A && git commit -m "fix: address integration issues from Phase 3-4 verification"
```

Otherwise, this step is a no-op. Phase 3-4 is complete.

---

## Appendix: CST-to-BlockNote Mapping Reference

| CST Node Type | BlockNote Block Type | Content Source |
|---|---|---|
| `heading` | `clnHeading` | `inline_content` child |
| `paragraph` | `clnParagraph` | `paragraph_line` → `inline_content` |
| `fenced_code_block` | `clnCodeBlock` | `language_tag` + `code_block_content` → props |
| `thematic_break` | `clnThematicBreak` | (void) |
| `unordered_list` | `clnUnorderedList` × N | One block per `unordered_list_item` |
| `ordered_list` | `clnOrderedList` × N | One block per `ordered_list_item` |
| `blockquote` | `clnBlockquote` | `blockquote_line` → `inline_content` |
| `meta_block` | `clnMeta` | `meta_entry` → JSON-encoded props |
| `block_directive_self_closing` | `cln{Name}` | attrs → props |
| `block_directive_with_body` (raw) | `cln{Name}` | body → `rawContent`/`tableData` prop |
| `block_directive_with_body` (parsed) | `cln{Name}` | body re-parsed → children |
| ERROR node | `clnParagraph` (parseError) | raw text |

| CST Inline Node | BlockNote Representation |
|---|---|
| `text` / `styled_text` / `note_text` / `link_text` | `BNStyledText` with active styles |
| `strong` | Adds `clnStrong: true` to child styles |
| `emphasis` | Adds `clnEmphasis: true` to child styles |
| `code_span` | `BNStyledText` with `clnCode: true` |
| `note` | Adds `clnNote: true` to child styles |
| `link` | `BNLink` with href from `link_target` |
| `inline_directive` (ref) | `BNStyledText` with `clnRef: "target"` |
| `escape_sequence` | `BNStyledText` with unescaped char |
