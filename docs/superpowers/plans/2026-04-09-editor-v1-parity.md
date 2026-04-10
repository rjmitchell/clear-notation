# Editor v1.0 Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the tree-sitter grammar to v1.0 (nested lists, multi-paragraph items, comments), update the editor converter/serializer, and fix a stored XSS vulnerability in both renderers.

**Architecture:** Extend the existing C external scanner with an indent stack that emits INDENT, DEDENT, and LIST_CONTINUATION tokens. Update grammar rules for nested lists. Update the editor converter to populate children[] from new CST nodes. Update the serializer with depth-aware indentation. Add URL scheme validation to both Python and JS renderers. Includes security fix from CSO audit finding #10.

**Tech Stack:** C (tree-sitter scanner), JavaScript/TypeScript (grammar, editor), Python (renderer security fix), WASM, Vitest

---

### Task 0: Fix stored XSS in link href and figure src (CSO Finding #10, #11)

This is a security fix that should ship before the grammar work. Both Python and JS renderers accept `javascript:` URIs in links and figure sources.

**Files:**
- Modify: `clearnotation_reference/renderer.py:217,148`
- Modify: `clearnotation-js/src/renderer.ts:334,241`
- Test: `tests/test_renderer.py` (new tests)
- Test: `clearnotation-js/src/renderer.test.ts` (new tests)

- [x] **Step 1: Write Python renderer tests for URL scheme validation**

Add to `tests/test_renderer.py`:

```python
class UrlSchemeSecurityTests(unittest.TestCase):
    """Verify dangerous URI schemes are blocked in rendered output."""

    def _render_doc(self, blocks, notes=None):
        from clearnotation_reference.models import NormalizedDocument
        from clearnotation_reference.renderer import render_html
        doc = NormalizedDocument(meta={}, blocks=blocks, notes=notes or [])
        return render_html(doc)

    def test_javascript_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="javascript:alert(1)")
            ])
        ])
        self.assertNotIn('href="javascript:', doc_html)
        self.assertIn('href="#"', doc_html)

    def test_data_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="data:text/html,<script>alert(1)</script>")
            ])
        ])
        self.assertNotIn('href="data:', doc_html)

    def test_https_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="https://example.com")
            ])
        ])
        self.assertIn('href="https://example.com"', doc_html)

    def test_relative_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("docs")], target="/docs/intro")
            ])
        ])
        self.assertIn('href="/docs/intro"', doc_html)

    def test_anchor_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("section")], target="#overview")
            ])
        ])
        self.assertIn('href="#overview"', doc_html)

    def test_javascript_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="javascript:alert(1)", blocks=[])
        ])
        self.assertNotIn('src="javascript:', doc_html)

    def test_data_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="data:image/svg+xml,<script>alert(1)</script>", blocks=[])
        ])
        self.assertNotIn('src="data:', doc_html)
```

- [x] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_renderer.py::UrlSchemeSecurityTests -v 2>&1`
Expected: Tests fail because no URL scheme validation exists.

- [x] **Step 3: Add URL sanitization to Python renderer**

In `clearnotation_reference/renderer.py`, add this function near the top of the file (after the imports):

```python
_SAFE_URL_SCHEMES = frozenset({"http", "https", "mailto", "tel"})

def _safe_url(url: str) -> str:
    """Sanitize a URL, blocking dangerous schemes like javascript: and data:."""
    stripped = url.strip()
    if stripped.startswith(("#", "/", "?")) or ":" not in stripped.split("/")[0]:
        return url  # relative URL, anchor, or query — safe
    scheme = stripped.split(":")[0].lower()
    if scheme in _SAFE_URL_SCHEMES:
        return url
    return "#"
```

Then update the two rendering locations:

In `_render_inlines` (line ~217), change the link rendering:
```python
elif isinstance(node, Link):
    parts.append(f'<a href="{_esc(_safe_url(node.target))}">{_render_inlines(node.label)}</a>')
```

In `_render_block` (line ~148), change the figure rendering:
```python
parts_list.append(f'<img src="{_esc(_safe_url(block.src))}" alt="">')
```

- [x] **Step 4: Run Python tests**

Run: `python3 -m pytest tests/test_renderer.py::UrlSchemeSecurityTests -v 2>&1`
Expected: All 8 tests pass.

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: All tests pass (no regressions).

- [x] **Step 5: Add URL sanitization to JS renderer**

In `clearnotation-js/src/renderer.ts`, add this function after the `escHtml` import:

```typescript
const SAFE_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

function safeUrl(url: string): string {
  const stripped = url.trim();
  if (stripped.startsWith("#") || stripped.startsWith("/") || stripped.startsWith("?")) {
    return url;
  }
  const colonIndex = stripped.indexOf(":");
  if (colonIndex === -1 || stripped.indexOf("/") < colonIndex) {
    return url; // relative path, no scheme
  }
  const scheme = stripped.slice(0, colonIndex).toLowerCase();
  return SAFE_URL_SCHEMES.has(scheme) ? url : "#";
}
```

Update the link rendering (line ~334):
```typescript
        parts.push(
          `<a href="${escHtml(safeUrl(node.target))}">${renderInlines(node.label)}</a>`,
        );
```

Update the figure rendering (line ~241):
```typescript
  parts.push(`<img src="${escHtml(safeUrl(block.src))}" alt="">`);
```

- [x] **Step 6: Add JS renderer tests**

Add to `clearnotation-js/src/renderer.test.ts`:

```typescript
describe("URL scheme sanitization", () => {
  it("blocks javascript: in links", () => {
    const html = renderHtml(doc([
      { type: "paragraph", content: [
        { type: "link", label: [{ type: "text", value: "click" }], target: "javascript:alert(1)" }
      ] }
    ]));
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });

  it("blocks data: in links", () => {
    const html = renderHtml(doc([
      { type: "paragraph", content: [
        { type: "link", label: [{ type: "text", value: "click" }], target: "data:text/html,test" }
      ] }
    ]));
    expect(html).not.toContain('href="data:');
  });

  it("allows https: links", () => {
    const html = renderHtml(doc([
      { type: "paragraph", content: [
        { type: "link", label: [{ type: "text", value: "click" }], target: "https://example.com" }
      ] }
    ]));
    expect(html).toContain('href="https://example.com"');
  });

  it("allows relative links", () => {
    const html = renderHtml(doc([
      { type: "paragraph", content: [
        { type: "link", label: [{ type: "text", value: "docs" }], target: "/docs/intro" }
      ] }
    ]));
    expect(html).toContain('href="/docs/intro"');
  });

  it("allows anchor links", () => {
    const html = renderHtml(doc([
      { type: "paragraph", content: [
        { type: "link", label: [{ type: "text", value: "sec" }], target: "#overview" }
      ] }
    ]));
    expect(html).toContain('href="#overview"');
  });

  it("blocks javascript: in figure src", () => {
    const html = renderHtml(doc([
      { type: "figure", src: "javascript:alert(1)", blocks: [] }
    ]));
    expect(html).not.toContain('src="javascript:');
  });
});
```

- [x] **Step 7: Run JS tests**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1 | tail -10`
Expected: All tests pass including new URL sanitization tests.

- [x] **Step 8: Commit**

```bash
git add clearnotation_reference/renderer.py clearnotation-js/src/renderer.ts tests/test_renderer.py clearnotation-js/src/renderer.test.ts
git commit -m "security: block javascript: and data: URIs in link href and figure src"
```

---

### Task 1: Extend external scanner with indent stack

**Files:**
- Modify: `tree-sitter-clearnotation/src/scanner.c`

- [x] **Step 1: Add indent stack constants and state struct**

At the top of `scanner.c`, after the existing `#include` and `enum TokenType`, add the new token types to the enum and define the state:

```c
enum TokenType {
  CODE_BLOCK_CONTENT_RAW,
  DIRECTIVE_BODY_CONTENT_RAW,
  INDENT,
  DEDENT,
  LIST_CONTINUATION,
};

#define MAX_STACK_DEPTH 12

typedef struct {
  uint8_t stack[MAX_STACK_DEPTH];
  uint8_t depth;
  bool after_blank_line;
} ScannerState;
```

- [x] **Step 2: Update create/destroy to allocate state**

Replace the existing create/destroy functions:

```c
void *tree_sitter_clearnotation_external_scanner_create(void) {
  ScannerState *state = calloc(1, sizeof(ScannerState));
  if (state) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
  }
  return state;
}

void tree_sitter_clearnotation_external_scanner_destroy(void *payload) {
  free(payload);
}
```

- [x] **Step 3: Implement serialize/deserialize with bounds checking**

Replace the existing serialize/deserialize:

```c
unsigned tree_sitter_clearnotation_external_scanner_serialize(
    void *payload, char *buffer) {
  ScannerState *state = (ScannerState *)payload;
  if (!state || state->depth > MAX_STACK_DEPTH) return 0;
  unsigned size = 2 + state->depth;  // 1 byte depth + 1 byte flags + N bytes stack
  if (size > 1024) return 0;  // tree-sitter buffer limit
  buffer[0] = (char)state->depth;
  buffer[1] = state->after_blank_line ? 1 : 0;
  for (uint8_t i = 0; i < state->depth; i++) {
    buffer[2 + i] = (char)state->stack[i];
  }
  return size;
}

void tree_sitter_clearnotation_external_scanner_deserialize(
    void *payload, const char *buffer, unsigned length) {
  ScannerState *state = (ScannerState *)payload;
  if (!state) return;
  if (length == 0) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  if (length < 2) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  uint8_t depth = (uint8_t)buffer[0];
  if (depth > MAX_STACK_DEPTH || length < 2 + depth) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  state->depth = depth;
  state->after_blank_line = buffer[1] != 0;
  for (uint8_t i = 0; i < depth; i++) {
    state->stack[i] = (uint8_t)buffer[2 + i];
  }
}
```

- [x] **Step 4: Add indent scanning logic to the scan function**

Add this before the existing `CODE_BLOCK_CONTENT_RAW` check in `tree_sitter_clearnotation_external_scanner_scan`:

```c
  ScannerState *state = (ScannerState *)payload;

  // Handle INDENT/DEDENT/LIST_CONTINUATION tokens
  if (valid_symbols[INDENT] || valid_symbols[DEDENT] || valid_symbols[LIST_CONTINUATION]) {
    // Count leading spaces (reject tabs)
    uint8_t indent = 0;
    while (lexer->lookahead == ' ') {
      indent++;
      lexer->advance(lexer, true);
    }
    if (lexer->lookahead == '\t') {
      return false;  // tabs rejected in list context
    }

    uint8_t current = state->depth > 0 ? state->stack[state->depth - 1] : 0;

    if (indent > current && valid_symbols[INDENT]) {
      if (state->depth < MAX_STACK_DEPTH) {
        state->stack[state->depth] = indent;
        state->depth++;
        state->after_blank_line = false;
        lexer->result_symbol = INDENT;
        return true;
      }
      return false;  // max depth exceeded
    }

    if (indent < current && valid_symbols[DEDENT]) {
      state->depth--;
      state->after_blank_line = false;
      lexer->result_symbol = DEDENT;
      return true;
    }

    if (indent == current && state->after_blank_line && valid_symbols[LIST_CONTINUATION]) {
      state->after_blank_line = false;
      lexer->result_symbol = LIST_CONTINUATION;
      return true;
    }

    return false;
  }
```

Also add blank line tracking: when scanning raw content or at line boundaries, set `state->after_blank_line = true` when a blank line is encountered. This requires adding a check in the existing scan flow. Add before the indent check:

```c
  // Track blank lines for LIST_CONTINUATION detection
  if (lexer->lookahead == '\n') {
    if (state) state->after_blank_line = true;
  }
```

- [x] **Step 5: Verify scanner compiles**

Run: `cd tree-sitter-clearnotation && tree-sitter generate 2>&1`
Expected: No errors (grammar.js hasn't been updated yet, so the new token types are in the enum but not referenced).

- [x] **Step 6: Commit**

```bash
git add tree-sitter-clearnotation/src/scanner.c
git commit -m "feat: add indent stack to tree-sitter scanner for nested list support"
```

---

### Task 2: Update grammar rules for nested lists

**Files:**
- Modify: `tree-sitter-clearnotation/grammar.js:26-29,144-167`
- Create: `tree-sitter-clearnotation/test/corpus/lists.txt`

- [x] **Step 1: Add new externals to grammar.js**

In `grammar.js`, update the `externals` array (line 26-29) to include the three new tokens:

```javascript
  externals: ($) => [
    $._code_block_content_raw,
    $._directive_body_content_raw,
    $._indent,
    $._dedent,
    $._list_continuation,
  ],
```

- [x] **Step 2: Replace flat list rules with nested list rules**

Replace the entire Lists section (lines 141-167) with:

```javascript
    // ═══════════════════════════════════════════════════════════════════
    // Lists
    // ═══════════════════════════════════════════════════════════════════

    unordered_list: ($) => prec.left(repeat1($.unordered_list_item)),

    unordered_list_item: ($) =>
      prec(6, seq(
        $.unordered_list_marker,
        $.inline_content,
        $._line_ending,
        optional($.list_item_body),
      )),

    unordered_list_marker: (_) => token(prec(7, "- ")),

    ordered_list: ($) => prec.left(repeat1($.ordered_list_item)),

    ordered_list_item: ($) =>
      prec(6, seq(
        $.ordered_list_marker,
        $.inline_content,
        $._line_ending,
        optional($.list_item_body),
      )),

    ordered_list_marker: (_) =>
      token(prec(7, seq(/[0-9]+/, ". "))),

    list_item_body: ($) =>
      prec.left(repeat1(choice(
        $.list_item_continuation,
        $.nested_list,
      ))),

    list_item_continuation: ($) =>
      seq(
        $._list_continuation,
        $.inline_content,
        $._line_ending,
      ),

    nested_list: ($) =>
      seq(
        $._indent,
        choice($.unordered_list, $.ordered_list),
        $._dedent,
      ),
```

- [x] **Step 3: Update scanner.c enum to match grammar externals order**

The enum in `scanner.c` must match the order of the `externals` array in `grammar.js`. Update:

```c
enum TokenType {
  CODE_BLOCK_CONTENT_RAW,
  DIRECTIVE_BODY_CONTENT_RAW,
  INDENT,
  DEDENT,
  LIST_CONTINUATION,
};
```

This already matches. Verify the order is correct.

- [x] **Step 4: Generate and test grammar**

Run: `cd tree-sitter-clearnotation && tree-sitter generate 2>&1`
Expected: Grammar generates successfully.

Run: `cd tree-sitter-clearnotation && tree-sitter test 2>&1`
Expected: Existing tests pass (comments, basics, directives, inline, edge-cases). List tests will be added next.

- [x] **Step 5: Create list test corpus**

Create `tree-sitter-clearnotation/test/corpus/lists.txt`:

```
================
Flat unordered list
================

- Alpha
- Beta
- Gamma

---

(document
  (unordered_list
    (unordered_list_item (unordered_list_marker) (inline_content (text)))
    (unordered_list_item (unordered_list_marker) (inline_content (text)))
    (unordered_list_item (unordered_list_marker) (inline_content (text)))))

================
Flat ordered list
================

1. First
2. Second
3. Third

---

(document
  (ordered_list
    (ordered_list_item (ordered_list_marker) (inline_content (text)))
    (ordered_list_item (ordered_list_marker) (inline_content (text)))
    (ordered_list_item (ordered_list_marker) (inline_content (text)))))

================
Nested unordered list
================

- Top item
  - Nested one
  - Nested two
- Another top

---

(document
  (unordered_list
    (unordered_list_item
      (unordered_list_marker)
      (inline_content (text))
      (list_item_body
        (nested_list
          (unordered_list
            (unordered_list_item (unordered_list_marker) (inline_content (text)))
            (unordered_list_item (unordered_list_marker) (inline_content (text)))))))
    (unordered_list_item (unordered_list_marker) (inline_content (text)))))
```

- [x] **Step 6: Run tree-sitter tests**

Run: `cd tree-sitter-clearnotation && tree-sitter test 2>&1`
Expected: All tests pass including new list corpus tests. If nested list tests fail, debug the scanner indent logic.

- [x] **Step 7: Build WASM**

Run: `cd tree-sitter-clearnotation && tree-sitter build --wasm 2>&1`
Expected: WASM binary generated successfully at `tree-sitter-clearnotation.wasm`.

- [x] **Step 8: Copy WASM to editor**

Run: `cp tree-sitter-clearnotation/tree-sitter-clearnotation.wasm editor/public/tree-sitter-clearnotation.wasm`

- [x] **Step 9: Commit**

```bash
git add tree-sitter-clearnotation/grammar.js tree-sitter-clearnotation/src/scanner.c tree-sitter-clearnotation/test/corpus/lists.txt editor/public/tree-sitter-clearnotation.wasm
git commit -m "feat: tree-sitter grammar v1.0 with nested lists and multi-paragraph items"
```

---

### Task 3: Add clnComment block type and update converter

**Files:**
- Modify: `editor/src/schema/core-blocks.ts`
- Modify: `editor/src/converter/block-converter.ts:50-54,141-175`
- Test: existing converter tests

- [x] **Step 1: Add clnComment block spec**

In `editor/src/schema/core-blocks.ts`, add after the `clnMetaBlockSpec`:

```typescript
// ═══════════════════════════════════════════════════════════════════
// Comment: // ...
// ═══════════════════════════════════════════════════════════════════

export const clnCommentBlockSpec: CLNBlockSpec = {
  type: "clnComment",
  propSchema: {
    text: { type: "string", default: "" },
  },
  content: "none",
};
```

Export it from `editor/src/schema/index.ts` if needed.

- [x] **Step 2: Add comment case to block converter**

In `editor/src/converter/block-converter.ts`, add before the `default:` case:

```typescript
    case "comment":
      return [{
        type: "clnComment",
        props: { text: node.text.replace(/^[ \t]*\/\/\s?/, "") },
        content: [],
        children: [],
      }];
```

- [x] **Step 3: Update list conversion for nested children**

Replace `convertUnorderedList` in `block-converter.ts`:

```typescript
function convertUnorderedList(node: CSTNode, options?: ConvertOptions): BNBlock[] {
  const items = findChildrenByType(node, "unordered_list_item");
  return items.map((item) => {
    const inlineNode = findChildByType(item, "inline_content");
    const content = inlineNode ? convertInline(inlineNode) : [];

    const bodyNode = findChildByType(item, "list_item_body");
    const children: BNBlock[] = [];
    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === "nested_list") {
          const innerList = child.children.find(
            (c: CSTNode) => c.type === "unordered_list" || c.type === "ordered_list"
          );
          if (innerList) {
            const converted = innerList.type === "unordered_list"
              ? convertUnorderedList(innerList, options)
              : convertOrderedList(innerList, options);
            children.push(...converted);
          }
        } else if (child.type === "list_item_continuation") {
          const contInline = findChildByType(child, "inline_content");
          if (contInline) {
            children.push({
              type: "clnParagraph",
              props: {},
              content: convertInline(contInline),
              children: [],
            });
          }
        }
      }
    }

    return {
      type: "clnUnorderedList",
      props: {},
      content,
      children,
    };
  });
}
```

Replace `convertOrderedList` similarly:

```typescript
function convertOrderedList(node: CSTNode, options?: ConvertOptions): BNBlock[] {
  const items = findChildrenByType(node, "ordered_list_item");
  return items.map((item) => {
    const markerNode = findChildByType(item, "ordered_list_marker");
    const startNumber = markerNode
      ? parseInt(markerNode.text.replace(/\D/g, ""), 10) || 1
      : 1;

    const inlineNode = findChildByType(item, "inline_content");
    const content = inlineNode ? convertInline(inlineNode) : [];

    const bodyNode = findChildByType(item, "list_item_body");
    const children: BNBlock[] = [];
    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === "nested_list") {
          const innerList = child.children.find(
            (c: CSTNode) => c.type === "unordered_list" || c.type === "ordered_list"
          );
          if (innerList) {
            const converted = innerList.type === "unordered_list"
              ? convertUnorderedList(innerList, options)
              : convertOrderedList(innerList, options);
            children.push(...converted);
          }
        } else if (child.type === "list_item_continuation") {
          const contInline = findChildByType(child, "inline_content");
          if (contInline) {
            children.push({
              type: "clnParagraph",
              props: {},
              content: convertInline(contInline),
              children: [],
            });
          }
        }
      }
    }

    return {
      type: "clnOrderedList",
      props: { startNumber },
      content,
      children,
    };
  });
}
```

- [x] **Step 4: Run editor tests**

Run: `cd editor && pnpm test 2>&1 | tail -5`
Expected: All tests pass. Flat list conversion should still work (regression).

- [x] **Step 5: Commit**

```bash
git add editor/src/schema/core-blocks.ts editor/src/converter/block-converter.ts
git commit -m "feat: add clnComment block, update converter for nested lists"
```

---

### Task 4: Update serializer with depth-aware indentation

**Files:**
- Modify: `editor/src/serializer/block-serializer.ts:17-43,66-75`

- [x] **Step 1: Add depth parameter to serializeBlock**

Update the `serializeBlock` function signature and list cases:

```typescript
export function serializeBlock(block: BNBlock, depth: number = 0): string {
  if (block.parseError && block.props.rawContent) {
    return String(block.props.rawContent);
  }

  switch (block.type) {
    case "clnHeading":
      return serializeHeading(block);
    case "clnParagraph":
      return depth > 0 ? serializeParagraph(block, depth) : serializeParagraph(block);
    case "clnCodeBlock":
      return serializeCodeBlock(block);
    case "clnThematicBreak":
      return "---";
    case "clnUnorderedList":
      return serializeUnorderedList(block, depth);
    case "clnOrderedList":
      return serializeOrderedList(block, depth);
    case "clnBlockquote":
      return serializeBlockquote(block);
    case "clnMeta":
      return serializeMeta(block);
    case "clnComment":
      return `// ${block.props.text || ""}`;
    default:
      return serializeDirective(block);
  }
}
```

- [x] **Step 2: Update list serializers for nesting**

Replace `serializeUnorderedList`:

```typescript
function serializeUnorderedList(block: BNBlock, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const inline = serializeInline(block.content);
  const lines = [`${indent}- ${inline}`];

  for (const child of block.children) {
    if (child.type === "clnUnorderedList" || child.type === "clnOrderedList") {
      lines.push(serializeBlock(child, depth + 1));
    } else if (child.type === "clnParagraph") {
      const childIndent = indent + "  ";
      lines.push("");  // blank line before continuation
      lines.push(`${childIndent}${serializeInline(child.content)}`);
    }
  }

  return lines.join("\n");
}
```

Replace `serializeOrderedList`:

```typescript
function serializeOrderedList(block: BNBlock, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const num = typeof block.props.startNumber === "number" ? block.props.startNumber : 1;
  const marker = `${num}. `;
  const inline = serializeInline(block.content);
  const lines = [`${indent}${marker}${inline}`];

  for (const child of block.children) {
    if (child.type === "clnUnorderedList" || child.type === "clnOrderedList") {
      lines.push(serializeBlock(child, depth + 1));
    } else if (child.type === "clnParagraph") {
      const childIndent = indent + " ".repeat(marker.length);
      lines.push("");  // blank line before continuation
      lines.push(`${childIndent}${serializeInline(child.content)}`);
    }
  }

  return lines.join("\n");
}
```

- [x] **Step 3: Run editor tests**

Run: `cd editor && pnpm test 2>&1 | tail -5`
Expected: All tests pass.

- [x] **Step 4: Commit**

```bash
git add editor/src/serializer/block-serializer.ts
git commit -m "feat: depth-aware list serialization with nesting and continuation support"
```

---

### Task 5: Round-trip integration tests and benchmark

**Files:**
- Create or modify: editor round-trip test file
- Verify: conformance fixtures

- [x] **Step 1: Run the full editor test suite**

Run: `cd editor && pnpm test -- --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass.

- [x] **Step 2: Run the JS renderer tests**

Run: `cd clearnotation-js && pnpm test -- --reporter=verbose 2>&1 | tail -10`
Expected: All tests pass (including new URL sanitization tests).

- [x] **Step 3: Run full Python test suite**

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: All tests pass (including new URL security tests).

- [x] **Step 4: Run conformance fixture harness**

Run: `python3 -m clearnotation_harness --manifest fixtures/manifest.toml --adapter clearnotation_reference.adapter:create_adapter 2>&1 | tail -5`
Expected: All 70 fixtures pass.

- [x] **Step 5: Update CLAUDE.md test counts**

Update the test counts in CLAUDE.md to reflect new tests added.

- [x] **Step 6: Update TODOS.md**

Add to the Completed section:

```markdown
### Editor v1.0 parity (Phase 1: grammar + converter + serializer)
- **Tree-sitter grammar v1.0:** external scanner with indent stack, nested list support, multi-paragraph items
- **Converter updates:** nested list children populated, clnComment block type
- **Serializer updates:** depth-aware indentation for nested lists and continuations
- **Security fix:** URL scheme validation blocks javascript: and data: URIs in rendered links and figures
```

- [x] **Step 7: Commit**

```bash
git add CLAUDE.md TODOS.md
git commit -m "docs: update test counts and TODOS for editor v1.0 parity"
```
