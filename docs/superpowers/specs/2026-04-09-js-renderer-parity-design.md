# JS Renderer Parity — Design Spec

**Date:** 2026-04-09
**Scope:** Close 17+ conformance gaps between the JS renderer and Python reference (option B — quick wins + NListItem model, no new dependencies)

## Problem

The JS renderer in `clearnotation-js/` diverges from the Python reference in 12 known-gap fixtures and 10 skipped fixtures. The gaps fall into four categories, of which this spec covers three:

1. **Math block wrapper** — JS renders `<pre class="math">`, Python wraps in `<div class="math">`
2. **Source/code trailing newline** — Python adds `\n` before `</code></pre>`, JS doesn't
3. **NListItem model** — Python uses `NListItem(content, blocks)` for list items supporting nested blocks; JS uses flat `NormalizedInline[][]`

Out of scope: syntax highlighting (Pygments/Prism.js), LaTeX-to-MathML conversion, include resolution.

## Changes

### 1. types.ts

Add `NListItem`:

```typescript
export interface NListItem {
  content: NormalizedInline[];
  blocks: NormalizedBlock[];
}
```

Change `NUnorderedList`:

```typescript
export interface NUnorderedList {
  type: "unordered_list";
  items: NListItem[];  // was NormalizedInline[][]
  id?: string;
}
```

Add `blocks` to `NOrderedItem`:

```typescript
export interface NOrderedItem {
  ordinal: number;
  content: NormalizedInline[];
  blocks: NormalizedBlock[];  // new
}
```

### 2. renderer.ts

**Math block** — wrap fallback in `<div class="math">`:

```typescript
function renderMathBlock(block: NMathBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<div class="math"${attrs}><pre class="math"><code>${escHtml(block.text)}</code></pre></div>`;
}
```

**Source block** — add trailing newline:

```typescript
function renderSourceBlock(block: NSourceBlock): string {
  const attrs = block.id ? ` id="${escHtml(block.id)}"` : "";
  return `<pre${attrs}><code class="language-${escHtml(block.language)}">${escHtml(block.text)}\n</code></pre>`;
}
```

**List item helper** — match Python's `_render_list_item`:

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

**Update `renderUnorderedList`** to use `item.content` / `item.blocks` instead of treating items as `NormalizedInline[]`.

**Update `renderOrderedList`** to use `item.content` / `item.blocks` via `renderListItem`.

**Pass `headings`** to list renderers (needed for nested blocks that may contain callouts/figures).

### 3. normalizer.ts

Update list normalization to produce `NListItem` objects with `content` and `blocks` fields, matching the Python normalizer's output.

### 4. conformance.test.ts

**Update `convertAstToJsFormat`:**
- `unordered-list` items: convert from `{content: [...], blocks: [...]}` (Python AST format) to `NListItem`
- `ordered-list` items: add `blocks` field conversion

**Remove from SKIP:** v04, v19, v22, v24, v25, v26, v27, v28, v30, v31 (10 NListItem fixtures)

**Remove from KNOWN_GAPS:** v05 (trailing newline), v16/v17 (math wrapper), and any false-positive gaps (v10, v15, v32) that pass after fixes.

**Remaining KNOWN_GAPS after this work:** v07 (MathML conversion), v13 (syntax highlighting), and any footnote fixtures that still differ.

## Testing

- Run `cd clearnotation-js && pnpm test` — all conformance fixtures in scope should pass
- No new test files needed; existing conformance suite is the verification mechanism
- Fixtures that move from SKIP/KNOWN_GAPS to passing is the success metric

## Files touched

- `clearnotation-js/src/types.ts`
- `clearnotation-js/src/renderer.ts`
- `clearnotation-js/src/normalizer.ts`
- `clearnotation-js/src/conformance.test.ts`
