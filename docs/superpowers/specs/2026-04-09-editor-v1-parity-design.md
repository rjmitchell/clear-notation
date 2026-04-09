# Editor v1.0 Parity (Sub-project A) -- Design Spec

**Date:** 2026-04-09
**Scope:** Upgrade tree-sitter grammar from v0.1 to v1.0 (nested lists, multi-paragraph items, comments), update editor converter and serializer to handle the new CST structure. Four phases.

**Eng review findings incorporated:** scanner serialize/deserialize, LIST_CONTINUATION token, clnComment block preservation, depth parameter threading, three-layer test coverage, benchmark test, scanner safety bounds.

## Problem

The visual editor's tree-sitter grammar is v0.1. It parses lists as flat sequences of single-line items. The v1.0 spec defines indentation-based nesting, multi-paragraph items, and tab rejection in lists. Block comments parse correctly but the converter drops them (they become error paragraphs). These gaps mean the editor cannot round-trip documents that use nested lists, multi-paragraph items, or comments.

## Phase 1: Tree-sitter grammar v1.0

### External scanner (`src/scanner.c`)

Extend the existing scanner (which already handles code block and directive body content) with indent-sensitive list tokens. The scanner:

- Maintains an indent stack (array of indent levels, starting with 0)
- Bounds-checks the stack depth (max 6 levels per spec, plus a safety margin)
- Implements `serialize`/`deserialize` to persist the indent stack across tree-sitter parse attempts and incremental re-parses. Serialize writes the stack depth + each level as bytes. Deserialize validates the buffer length before reading.
- Emits three token types for list context:
  - `INDENT` -- line indent deeper than stack top, signals nested sub-list. Push new level.
  - `DEDENT` -- line indent shallower than stack top, signals end of nesting. Pop stack, emit one DEDENT per popped level.
  - `LIST_CONTINUATION` -- blank line followed by a line at the same indent as the parent item's content. Signals a multi-paragraph list item. Does NOT use INDENT.
- Rejects tabs in list indentation context (does not match, grammar falls through to error)
- Outside list context (headings, paragraphs, directives), these tokens are never valid in the grammar, so the scanner is effectively inactive

```
Scanner token emission flow:

  line start
      |
      +-- count leading spaces -> new_indent
      |
      +-- tab found in leading whitespace?
      |   +-- YES -> reject (no token emitted)
      |
      +-- new_indent > stack_top?
      |   +-- YES -> push(new_indent), emit INDENT
      |
      +-- new_indent < stack_top?
      |   +-- YES -> pop until stack_top <= new_indent
      |             emit DEDENT for each pop
      |
      +-- new_indent == stack_top AND preceded by blank line?
      |   +-- YES -> emit LIST_CONTINUATION
      |
      +-- new_indent == stack_top (normal)
          +-- no list token emitted, grammar handles as next item
```

### Grammar rule changes (`grammar.js`)

Add `INDENT`, `DEDENT`, and `LIST_CONTINUATION` to the externals array alongside the existing `_code_block_content_raw` and `_directive_body_content_raw`.

Replace the current flat list rules with:

```
unordered_list = repeat1(unordered_item)
unordered_item = "- " inline_content line_end [list_item_body]

ordered_list = repeat1(ordered_item)
ordered_item = /[0-9]+\. / inline_content line_end [list_item_body]

list_item_body = repeat1(list_item_continuation | nested_list)
list_item_continuation = LIST_CONTINUATION inline_content line_end
nested_list = INDENT (unordered_list | ordered_list) DEDENT
```

The INDENT, DEDENT, and LIST_CONTINUATION tokens come from the external scanner. They are only valid inside `list_item_body` and `nested_list` rules, so the scanner is only invoked in list context.

### WASM build

The external scanner compiles alongside the grammar into WASM via `tree-sitter build --wasm`. The existing WASM build pipeline in `tree-sitter-clearnotation/` handles this. The C scanner with the indent stack (including serialize/deserialize) compiles to WASM without issues -- tree-sitter's WASM support handles scanner state automatically.

### Test corpus

New file `tree-sitter-clearnotation/test/corpus/lists.txt` with cases:
- Flat unordered list (2-3 items) -- regression test
- Flat ordered list -- regression test
- Nested unordered (2 levels)
- Nested ordered inside unordered
- Mixed nesting (3 levels)
- Multi-paragraph item (blank line + continuation at item content indent)
- Multi-paragraph + nested list in same item
- Tab in list indent (should not match as list, grammar falls through)
- Empty list item (marker + empty inline content)
- 6-level deep nesting (max per spec)
- Multiple DEDENT on large de-indent (3 levels -> 1)

### Comment handling

The grammar already parses comments correctly. No grammar changes needed. The fix is in Phase 2 (converter).

## Phase 2: Editor converter updates

**Files:**
- `editor/src/converter/block-converter.ts`
- `editor/src/schema/` (add clnComment block spec)

### List conversion

Update `convertUnorderedList` and `convertOrderedList` to:
- Walk `list_item_body` children of each item node
- For `nested_list` children: recursively convert the inner `unordered_list` or `ordered_list` and add to `children[]`
- For `list_item_continuation` children: convert inline content and add as `clnParagraph` blocks in `children[]`

The existing `BNBlock.children` field is already defined and ready.

### Comment preservation

Add a `clnComment` block type to the BlockNote schema:
- Props: `text` (string, the comment content after `//`)
- Renders as a gray, read-only block in the visual editor
- No inline content (void block, like thematic break)

Add to `block-converter.ts`:
```typescript
case "comment":
  return [{
    type: "clnComment",
    props: { text: node.text.replace(/^[ \t]*\/\/\s?/, "") },
    content: [],
    children: [],
  }];
```

### Unit tests

Converter unit tests for:
- Nested list CST -> children[] populated correctly
- list_item_continuation -> clnParagraph children
- Comment CST node -> clnComment block (not error paragraph)
- Flat list regression (still works as before)

## Phase 3: Editor serializer updates

**File:** `editor/src/serializer/block-serializer.ts`

### Indentation tracking

Add a `depth` parameter to `serializeBlock` and list-specific functions. Default is 0. Each nesting level adds 2 spaces for unordered items, marker width for ordered items.

### List serialization

```
serializeUnorderedList(block, depth):
  indent = " ".repeat(depth * 2)
  line = indent + "- " + serializeInline(block.content)
  for child in block.children:
    if child is list block:
      line += "\n" + serializeBlock(child, depth + 1)
    if child is paragraph:
      line += "\n\n" + indent + "  " + serializeInline(child.content)
  return line
```

Similar for ordered lists, using marker width instead of 2 for the indent increment.

### Comment serialization

```typescript
case "clnComment":
  return `// ${block.props.text}`;
```

### Unit tests

Serializer unit tests for:
- Nested unordered list with correct indentation
- Nested ordered list with marker-width indent
- Multi-paragraph item (blank line + indented continuation)
- clnComment -> `// text`
- Flat list regression (still works)

## Phase 4: Integration testing and benchmarks

**Files:** editor test files for round-trip verification

### Round-trip tests

- Parse CLN with nested lists, convert to BlockNote, serialize back to CLN, compare
- Verify comments round-trip (// text -> clnComment -> // text)
- Verify flat lists still round-trip correctly (regression)
- Test against v1.0 conformance fixtures with lists: v04, v24, v25, v26, v27, v28, v30, v31

### Benchmark test

Create a stress test with a 500+ line document containing deeply nested lists (6 levels). Measure parse time in the WASM worker. Baseline for regression detection. Failure threshold: parse should complete in <100ms on modern hardware.

## Safety requirements

### Scanner bounds checking

- Indent stack depth capped at 12 (6 nesting levels * 2 space safety margin). If exceeded, scanner returns false (no token emitted, grammar falls through).
- `deserialize` validates buffer length before reading. If buffer is shorter than expected, reset to empty stack (safe default).
- No heap allocation in scanner -- use a fixed-size array for the indent stack.

## Files touched

### Phase 1
- Modify: `tree-sitter-clearnotation/src/scanner.c` (add indent stack + 3 new tokens)
- Modify: `tree-sitter-clearnotation/grammar.js` (new list rules + externals)
- Create: `tree-sitter-clearnotation/test/corpus/lists.txt`
- Rebuild: `tree-sitter-clearnotation/tree-sitter-clearnotation.wasm`

### Phase 2
- Modify: `editor/src/converter/block-converter.ts`
- Create or modify: `editor/src/schema/` (clnComment block spec)
- Create or modify: converter test file

### Phase 3
- Modify: `editor/src/serializer/block-serializer.ts`
- Create or modify: serializer test file

### Phase 4
- Create or modify: round-trip integration test file
- Create: benchmark test file

## Out of scope

- Notes/refs UI in BlockNote (Sub-project B, separate spec)
- Include inlining in browser (no file system access)
- Inline comment parsing (stripped by Python parser before CST, not represented in tree)
- VS Code LSP improvements (separate TODO, but unblocked by this grammar upgrade)
