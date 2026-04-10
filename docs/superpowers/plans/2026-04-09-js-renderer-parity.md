# JS Renderer Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 17+ conformance gaps between the JS renderer and Python reference by fixing math/source block rendering and implementing the NListItem model.

**Architecture:** Three layers of changes — types (add NListItem, update list types), renderer (math wrapper, trailing newlines, list item helper), and conformance test converter (handle new AST format, remove SKIP/KNOWN_GAPS entries).

**Tech Stack:** TypeScript, Vitest, no new dependencies

---

### Task 1: Fix math block wrapper and source block trailing newline

**Files:**
- Modify: `clearnotation-js/src/renderer.ts:238-245`
- Test: `clearnotation-js/src/conformance.test.ts` (existing conformance suite)

- [ ] **Step 1: Run baseline tests**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1 | grep -E "known gap|FAIL|PASS|skip"`
Expected: 106 passed, 13 skipped, 0 failed

- [ ] **Step 2: Fix math block wrapper**

In `clearnotation-js/src/renderer.ts`, replace the `renderMathBlock` function:

```typescript
function renderMathBlock(block: NMathBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<div class="math"${attrs}><pre class="math"><code>${escHtml(block.text)}</code></pre></div>`;
}
```

- [ ] **Step 3: Fix source block trailing newline**

In `clearnotation-js/src/renderer.ts`, replace the `renderSourceBlock` function:

```typescript
function renderSourceBlock(block: NSourceBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<pre${attrs}><code class="language-${escHtml(block.language)}">${escHtml(block.text)}\n</code></pre>`;
}
```

- [ ] **Step 4: Remove fixed fixtures from KNOWN_GAPS**

In `clearnotation-js/src/conformance.test.ts`, remove these entries from the `KNOWN_GAPS` set:

- `"v05-fenced-code"` (trailing newline fix)
- `"v16-empty-raw-bodies"` (math wrapper fix)
- `"v17-whitespace-raw-body"` (math wrapper fix)

- [ ] **Step 5: Run tests to verify fixes**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1 | grep -E "known gap|FAIL|PASS|skip|v05|v16|v17"`
Expected: v05, v16, v17 now pass without `[known gap]` suffix. If any of them throw "now passes — remove it from KNOWN_GAPS", you missed removing it in step 4.

- [ ] **Step 6: Check for false-positive known gaps**

Run the tests. If any remaining known gap fixtures throw "now passes — remove it from KNOWN_GAPS", remove those entries too. Likely candidates: `v10-escaped-openers`, `v15-table-escaped-pipe`, `v32-inline-comment-edge-cases`.

- [ ] **Step 7: Commit**

```bash
git add clearnotation-js/src/renderer.ts clearnotation-js/src/conformance.test.ts
git commit -m "fix: math block wrapper and source block trailing newline in JS renderer"
```

---

### Task 2: Add NListItem type and update list types

**Files:**
- Modify: `clearnotation-js/src/types.ts:87-102`

- [ ] **Step 1: Add NListItem interface**

In `clearnotation-js/src/types.ts`, add the `NListItem` interface before `NUnorderedList`:

```typescript
export interface NListItem {
  content: NormalizedInline[];
  blocks: NormalizedBlock[];
}
```

- [ ] **Step 2: Update NUnorderedList to use NListItem**

Replace the existing `NUnorderedList` interface:

```typescript
export interface NUnorderedList {
  type: "unordered_list";
  items: NListItem[];
  id?: string;
}
```

- [ ] **Step 3: Add blocks field to NOrderedItem**

Replace the existing `NOrderedItem` interface:

```typescript
export interface NOrderedItem {
  ordinal: number;
  content: NormalizedInline[];
  blocks: NormalizedBlock[];
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd clearnotation-js && npx tsc --noEmit 2>&1`
Expected: Type errors in `renderer.ts` and `normalizer.ts` where they use the old list item shapes. This is expected — we'll fix those in the next tasks.

- [ ] **Step 5: Commit**

```bash
git add clearnotation-js/src/types.ts
git commit -m "feat: add NListItem type with content + blocks for nested list support"
```

---

### Task 3: Update renderer for NListItem model

**Files:**
- Modify: `clearnotation-js/src/renderer.ts:146-162`

- [ ] **Step 1: Add renderListItem helper**

In `clearnotation-js/src/renderer.ts`, add this function before `renderUnorderedList`:

```typescript
function renderListItem(
  content: NormalizedInline[],
  blocks: NormalizedBlock[],
  headings: NHeading[],
): string {
  if (blocks.length === 0) {
    return `<li>${renderInlines(content)}</li>`;
  }
  const parts = [`<p>${renderInlines(content)}</p>`];
  for (const b of blocks) {
    parts.push(renderBlock(b, headings));
  }
  return `<li>${parts.join("")}</li>`;
}
```

- [ ] **Step 2: Update renderUnorderedList**

Replace the existing `renderUnorderedList` function:

```typescript
function renderUnorderedList(block: NUnorderedList, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const items = block.items
    .map((item) => renderListItem(item.content, item.blocks, headings))
    .join("\n");
  return `<ul${attrs}>\n${items}\n</ul>`;
}
```

- [ ] **Step 3: Update renderOrderedList**

Replace the existing `renderOrderedList` function:

```typescript
function renderOrderedList(block: NOrderedList, headings: NHeading[]): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  const start = block.items.length > 0 ? block.items[0].ordinal : 1;
  const startAttr = start !== 1 ? ` start="${start}"` : "";
  const items = block.items
    .map((item) => renderListItem(item.content, item.blocks, headings))
    .join("\n");
  return `<ol${attrs}${startAttr}>\n${items}\n</ol>`;
}
```

- [ ] **Step 4: Update renderBlock to pass headings to list renderers**

In the `renderBlock` switch statement, update the unordered_list and ordered_list cases:

```typescript
    case "unordered_list":
      return renderUnorderedList(block, headings);
    case "ordered_list":
      return renderOrderedList(block, headings);
```

- [ ] **Step 5: Add NListItem to the import statement**

At the top of `renderer.ts`, add `NListItem` to the import from `"./types"`:

```typescript
import type {
  NormalizedDocument,
  NormalizedBlock,
  NormalizedInline,
  NHeading,
  NParagraph,
  NBlockQuote,
  NUnorderedList,
  NOrderedList,
  NListItem,
  NToc,
  NCallout,
  NFigure,
  NMathBlock,
  NTable,
  NSourceBlock,
} from "./types";
```

- [ ] **Step 6: Verify types compile**

Run: `cd clearnotation-js && npx tsc --noEmit 2>&1`
Expected: Type errors only in `normalizer.ts` (still using old list format). Renderer should be clean.

- [ ] **Step 7: Commit**

```bash
git add clearnotation-js/src/renderer.ts
git commit -m "feat: update list rendering for NListItem with nested block support"
```

---

### Task 4: Update normalizer for NListItem model

**Files:**
- Modify: `clearnotation-js/src/normalizer.ts:41-67,183-211`

- [ ] **Step 1: Add NListItem to the import statement**

In `clearnotation-js/src/normalizer.ts`, add `NListItem` to the import from `"./types"`:

```typescript
import type {
  NormalizedBlock,
  NormalizedDocument,
  NormalizedInline,
  NText,
  NCodeSpan,
  NStrong,
  NEmphasis,
  NLink,
  NNote,
  NRef,
  NHeading,
  NParagraph,
  NThematicBreak,
  NBlockQuote,
  NUnorderedList,
  NListItem,
  NOrderedList,
  NOrderedItem,
  NToc,
  NCallout,
  NFigure,
  NMathBlock,
  NTable,
  NTableRow,
  NTableCell,
  NSourceBlock,
} from "./types";
```

- [ ] **Step 2: Update clnUnorderedList normalization**

In `normalizer.ts`, replace the `clnUnorderedList` case (lines ~183-193):

```typescript
      case "clnUnorderedList": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const listItem: NListItem = {
          content: normalizeInlines(blk.content, state),
          blocks: normalizeBlocks(blk.children, state, undefined),
        };
        const ul: NUnorderedList = {
          type: "unordered_list",
          items: [listItem],
        };
        if (blockId !== undefined) ul.id = blockId;
        result.push(ul);
        break;
      }
```

- [ ] **Step 3: Update clnOrderedList normalization**

In `normalizer.ts`, replace the `clnOrderedList` case (lines ~195-211):

```typescript
      case "clnOrderedList": {
        const blockId = pendingAnchor;
        pendingAnchor = undefined;
        const ordinal = (blk.props.startNumber as number) || 1;
        const ol: NOrderedList = {
          type: "ordered_list",
          items: [
            {
              ordinal,
              content: normalizeInlines(blk.content, state),
              blocks: normalizeBlocks(blk.children, state, undefined),
            },
          ],
        };
        if (blockId !== undefined) ol.id = blockId;
        result.push(ol);
        break;
      }
```

- [ ] **Step 4: Verify full compilation**

Run: `cd clearnotation-js && npx tsc --noEmit 2>&1`
Expected: No type errors.

- [ ] **Step 5: Run all tests**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1`
Expected: All previously-passing tests still pass. The normalizer unit tests should pass with the new list item shape.

- [ ] **Step 6: Commit**

```bash
git add clearnotation-js/src/normalizer.ts
git commit -m "feat: update normalizer to produce NListItem with nested blocks"
```

---

### Task 5: Update conformance test converter and remove SKIP/KNOWN_GAPS

**Files:**
- Modify: `clearnotation-js/src/conformance.test.ts:28-134,174-207`

- [ ] **Step 1: Update unordered list conversion in convertAstToJsFormat**

In `conformance.test.ts`, replace the `unordered-list` case in `convertBlock` (lines ~77-79):

```typescript
    if (t === "unordered-list") {
      return {
        type: t,
        items: (block.items || []).map((i: any) => ({
          content: (i.content || []).map(convertInline),
          blocks: (i.blocks || []).map(convertBlock),
        })),
        id: block.id || undefined,
      };
    }
```

- [ ] **Step 2: Update ordered list conversion to include blocks**

In `conformance.test.ts`, replace the `ordered-list` case in `convertBlock` (lines ~80-89):

```typescript
    if (t === "ordered-list") {
      return {
        type: t,
        items: (block.items || []).map((i: any) => ({
          ordinal: i.ordinal,
          content: (i.content || []).map(convertInline),
          blocks: (i.blocks || []).map(convertBlock),
        })),
        id: block.id || undefined,
      };
    }
```

- [ ] **Step 3: Remove NListItem fixtures from SKIP set**

In `conformance.test.ts`, remove these 10 entries from the `SKIP` set:

```typescript
    "v04-lists-and-blockquote",
    "v19-adjacent-blocks",
    "v22-inline-comments",
    "v24-nested-lists",
    "v25-multi-paragraph-items",
    "v26-three-level-nested-list",
    "v27-mixed-nested-list-types",
    "v28-multi-paragraph-ordered",
    "v30-nested-list-with-inline-styles",
    "v31-callout-with-nested-list",
```

Keep the 3 include-resolution entries in SKIP.

- [ ] **Step 4: Run conformance tests**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1 | grep -E "v04|v19|v22|v24|v25|v26|v27|v28|v30|v31|FAIL|known gap"`
Expected: All 10 previously-skipped fixtures now run. They should either pass or show up as `[known gap]`. If any fail outright, debug the converter or renderer.

- [ ] **Step 5: Remove any newly-passing KNOWN_GAPS**

Run tests. If any known gap fixture throws "now passes — remove it from KNOWN_GAPS", remove that entry. Check `v02-meta-and-inline`, `v03-link-and-note`, `v14-anchor-paragraph`, `v18-deep-inline-nesting` — the footnote fixtures may now pass since the `parts.join("\n")` produces the expected newlines.

Also check if any of the newly-un-skipped list fixtures (`v04`, `v19`, `v22`, `v32`) need to be added to KNOWN_GAPS if they fail the exact-match comparison.

- [ ] **Step 6: Run full test suite**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1`
Expected: All tests pass, no failures. Skipped count should drop from 13 to 3 (only include fixtures). Known gaps should be reduced.

- [ ] **Step 7: Commit**

```bash
git add clearnotation-js/src/conformance.test.ts
git commit -m "feat: update conformance converter for NListItem, enable 10 list fixtures"
```

---

### Task 6: Final verification and cleanup

**Files:**
- Modify: `clearnotation-js/src/conformance.test.ts` (if needed)
- Modify: `TODOS.md`

- [ ] **Step 1: Run full test suite across all packages**

Run: `cd /Users/ryan/projects/clear-notation && cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1`
Expected: All tests pass. Note the final counts: passed, skipped, total.

- [ ] **Step 2: Run editor tests to check for regressions**

Run: `cd /Users/ryan/projects/clear-notation/editor && pnpm test 2>&1 | tail -5`
Expected: All 316 editor tests pass (the editor uses the normalizer types).

- [ ] **Step 3: Run Python tests for baseline**

Run: `cd /Users/ryan/projects/clear-notation && python3 -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: All 336 Python tests pass (no Python changes, just verifying baseline).

- [ ] **Step 4: Update TODOS.md**

Move "JS renderer parity gaps" from Open to Completed with a summary of what was fixed. Update the description to note remaining gaps (v07 MathML, v13 syntax highlighting, 3 include fixtures).

- [ ] **Step 5: Commit**

```bash
git add TODOS.md
git commit -m "docs: update TODOS for JS renderer parity progress"
```
