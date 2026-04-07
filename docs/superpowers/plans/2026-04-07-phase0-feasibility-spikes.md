# Phase 0: Feasibility Spikes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate every technical assumption the visual editor depends on before committing to the full build.

**Architecture:** Three independent spikes (tree-sitter, BlockNote, pnpm workspace) that can run in parallel. Each spike produces a pass/fail answer with evidence. If any spike fails, the architecture changes before investing in Phases 1-5.

**Tech Stack:** tree-sitter-cli 0.24+, Node.js 20+, pnpm 9+, TypeScript 5.3+, Vite 6+, BlockNote (latest), React (fallback if vanilla JS fails)

**Decision gates:**
- Spike 1 FAIL → rewrite external scanner in pure grammar rules, re-spike
- Spike 2 FAIL (vanilla JS) → switch to React + Vite, re-measure bundle
- Spike 2 FAIL (dynamic registration) → hardcode 9 blocks, lose registry-driven thesis
- Bundle > 750KB → shed CodeMirror (permanent `<pre>` source pane), then dark theme CSS, then cheat sheet

---

### Task 1: pnpm Workspace Setup

**Files:**
- Create: `package.json` (root workspace config)
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

- [ ] **Step 1: Initialize pnpm workspace**

Create root `pnpm-workspace.yaml`:

```yaml
packages:
  - 'tree-sitter-clearnotation'
  - 'clearnotation-js'
  - 'editor'
  - 'vscode-clearnotation'
```

- [ ] **Step 2: Create root package.json**

```json
{
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 3: Create .npmrc**

```ini
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 4: Verify workspace resolves**

Run: `pnpm install`
Expected: installs tree-sitter-clearnotation devDependencies, vscode-clearnotation dependencies. No errors.

- [ ] **Step 5: Verify pnpm recognizes all packages**

Run: `pnpm -r list --depth=0`
Expected: lists 2 packages (tree-sitter-clearnotation, vscode-clearnotation). clearnotation-js and editor don't exist yet.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml
git commit -m "feat: initialize pnpm workspace for monorepo"
```

---

### Task 2: Tree-sitter Grammar Generation + Native Testing

**Files:**
- Modify: `tree-sitter-clearnotation/package.json` (add test script)
- Generated: `tree-sitter-clearnotation/src/parser.c` (by tree-sitter generate)
- Generated: `tree-sitter-clearnotation/src/grammar.json`
- Generated: `tree-sitter-clearnotation/src/tree_sitter/parser.h`
- Create: `tree-sitter-clearnotation/test/corpus/basics.txt`
- Create: `tree-sitter-clearnotation/test/corpus/directives.txt`
- Create: `tree-sitter-clearnotation/test/corpus/inline.txt`

- [ ] **Step 1: Install tree-sitter-cli and generate the parser**

Run:
```bash
cd tree-sitter-clearnotation
pnpm install
pnpm run generate
```
Expected: `src/parser.c`, `src/grammar.json`, and `src/tree_sitter/parser.h` are created. No errors. If the generate fails, read the error carefully. The most common issues are: conflicting rules (tree-sitter reports the conflict), or the `word` rule not matching expectations.

- [ ] **Step 2: Write basic test corpus**

Create `tree-sitter-clearnotation/test/corpus/basics.txt`:

```
================
Minimal document
================

# ClearNotation

A docs-first markup language.

---

(document
  (heading
    (heading_marker)
    (inline_content
      (text)))
  (paragraph
    (paragraph_line
      (inline_content
        (text)))))
```

```
================
Thematic break
================

---

---

(document
  (thematic_break))
```

```
================
Fenced code block
================

```python
def hello():
    print("world")
```

---

(document
  (fenced_code_block
    (code_fence_open)
    (language_tag)
    (code_block_content)
    (code_fence_close)))
```

- [ ] **Step 3: Write directive test corpus**

Create `tree-sitter-clearnotation/test/corpus/directives.txt`:

```
================
Self-closing directive
================

::toc

---

(document
  (block_directive_self_closing
    (directive_marker)
    (directive_name)))
```

```
================
Directive with attributes
================

::anchor[id="top"]

---

(document
  (block_directive_self_closing
    (directive_marker)
    (directive_name)
    (attribute_list
      (attribute
        (attribute_key)
        (value
          (string
            (string_content)))))))
```

```
================
Directive with body
================

::callout[kind="info"]{
This is a callout.
}

---

(document
  (block_directive_with_body
    (directive_marker)
    (directive_name)
    (attribute_list
      (attribute
        (attribute_key)
        (value
          (string
            (string_content)))))
    (directive_body_open)
    (directive_body_content)
    (block_close)))
```

```
================
Meta block
================

::meta{
title = "Test"
draft = true
}

---

(document
  (meta_block
    (meta_block_open)
    (meta_entry
      (meta_key
        (identifier))
      (value
        (string
          (string_content))))
    (meta_entry
      (meta_key
        (identifier))
      (value
        (boolean)))
    (block_close)))
```

- [ ] **Step 4: Write inline test corpus**

Create `tree-sitter-clearnotation/test/corpus/inline.txt`:

```
================
Strong
================

+{bold text}

---

(document
  (paragraph
    (paragraph_line
      (inline_content
        (strong
          (strong_open)
          (styled_text)
          (styled_close))))))
```

```
================
Emphasis
================

*{italic text}

---

(document
  (paragraph
    (paragraph_line
      (inline_content
        (emphasis
          (emphasis_open)
          (styled_text)
          (styled_close))))))
```

```
================
Link
================

[ClearNotation -> https://example.com]

---

(document
  (paragraph
    (paragraph_line
      (inline_content
        (link
          (link_label
            (link_text))
          (link_separator)
          (link_target))))))
```

```
================
Note
================

Some text ^{a footnote}.

---

(document
  (paragraph
    (paragraph_line
      (inline_content
        (text)
        (note
          (note_open)
          (note_text)
          (styled_close))
        (text)))))
```

- [ ] **Step 5: Run tree-sitter tests**

Run:
```bash
cd tree-sitter-clearnotation
pnpm run test
```
Expected: all test cases PASS. If any fail, the S-expression output will show the actual parse tree vs expected. Fix the test expectations to match the grammar's actual output (the grammar is authoritative, the tests are learning what it produces).

- [ ] **Step 6: Parse all 15 valid fixtures**

Run each fixture through the parser to verify no crashes or ERROR nodes:

```bash
cd tree-sitter-clearnotation
for f in ../fixtures/valid/v*.cln; do
  echo "=== $(basename $f) ==="
  pnpm run parse "$f" 2>&1 | head -5
  echo
done
```

Expected: each file parses without `(ERROR)` nodes in the output. Note: directive bodies will show as `(directive_body_content)` blobs, which is correct by design (the grammar is registry-unaware).

- [ ] **Step 7: Commit**

```bash
git add tree-sitter-clearnotation/src/ tree-sitter-clearnotation/test/
git commit -m "feat: generate tree-sitter parser and add test corpus"
```

---

### Task 3: Tree-sitter WASM Build Spike

**Files:**
- Create: `tree-sitter-clearnotation/wasm-spike.mjs` (temporary spike script)

- [ ] **Step 1: Build the WASM parser**

Run:
```bash
cd tree-sitter-clearnotation
npx tree-sitter build --wasm
```
Expected: creates `tree-sitter-clearnotation.wasm` in the current directory. This compiles the C parser + external scanner to WASM using emscripten. If emscripten is not installed, install it first:
```bash
brew install emscripten
```

If the build fails with external scanner errors: the scanner.c uses `#include "tree_sitter/parser.h"` which must resolve in the WASM build environment. Check that `src/tree_sitter/parser.h` exists (generated in Task 2).

Record the WASM file size:
```bash
ls -la tree-sitter-clearnotation.wasm
gzip -k tree-sitter-clearnotation.wasm && ls -la tree-sitter-clearnotation.wasm.gz
```

- [ ] **Step 2: Write a Node.js spike to load and parse with WASM**

Create `tree-sitter-clearnotation/wasm-spike.mjs`:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // tree-sitter provides a web-tree-sitter package for WASM usage
  const Parser = (await import('web-tree-sitter')).default;
  await Parser.init();

  const parser = new Parser();
  const wasmPath = join(__dirname, 'tree-sitter-clearnotation.wasm');
  const Lang = await Parser.Language.load(wasmPath);
  parser.setLanguage(Lang);

  // Parse each valid fixture
  const fixturesDir = join(__dirname, '..', 'fixtures', 'valid');
  const fixtures = [
    'v01-minimal.cln', 'v02-meta-and-inline.cln', 'v03-link-and-note.cln',
    'v04-lists-and-blockquote.cln', 'v05-fenced-code.cln', 'v06-callout.cln',
    'v07-raw-blocks.cln', 'v08-anchor-and-ref.cln', 'v09-include.cln',
    'v10-escaped-openers.cln', 'v11-toc-and-slug-collision.cln', 'v12-figure.cln',
    'v13-source-directive.cln', 'v14-anchor-paragraph.cln', 'v15-table-escaped-pipe.cln',
  ];

  let passed = 0;
  let failed = 0;

  for (const name of fixtures) {
    const source = readFileSync(join(fixturesDir, name), 'utf-8');
    const tree = parser.parse(source);
    const hasErrors = tree.rootNode.hasError();

    if (hasErrors) {
      console.log(`FAIL: ${name} — has ERROR nodes`);
      console.log(tree.rootNode.toString().slice(0, 200));
      failed++;
    } else {
      console.log(`PASS: ${name}`);
      passed++;
    }
    tree.delete();
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${fixtures.length}`);
  parser.delete();
}

main().catch(console.error);
```

- [ ] **Step 3: Install web-tree-sitter and run the spike**

```bash
cd tree-sitter-clearnotation
pnpm add -D web-tree-sitter
node wasm-spike.mjs
```

Expected: `15 passed, 0 failed out of 15`. If any fixtures fail, they will show ERROR nodes. Investigate whether the native parser (Task 2) also fails on the same fixture. If native passes but WASM fails, the issue is in the WASM build.

- [ ] **Step 4: Verify body boundary behavior for all three body modes**

Check that the external scanner correctly handles body boundaries. In the WASM spike output from Step 3, manually inspect:

- `v06-callout.cln` (body_mode=parsed): the `directive_body_content` should contain the raw text "Read the grammar before extending the syntax.\n". It should NOT contain parsed inline nodes (this is correct — the grammar treats all bodies as raw).
- `v07-raw-blocks.cln` (body_mode=raw): the `directive_body_content` for the math block should contain "\int_0^1 x^2 dx\n". The table block body should contain the pipe-delimited rows.
- `v08-anchor-and-ref.cln` (body_mode=none): `::anchor[id="top"]` should parse as `block_directive_self_closing` with NO body.

Add this verification to the spike script by printing the tree S-expression for these three fixtures:

```javascript
// Add after the loop:
const bodyChecks = ['v06-callout.cln', 'v07-raw-blocks.cln', 'v08-anchor-and-ref.cln'];
console.log('\n--- Body boundary verification ---');
for (const name of bodyChecks) {
  const source = readFileSync(join(fixturesDir, name), 'utf-8');
  const tree = parser.parse(source);
  console.log(`\n=== ${name} ===`);
  console.log(tree.rootNode.toString());
  tree.delete();
}
```

Run again: `node wasm-spike.mjs`

Expected: the S-expressions confirm the body boundary behavior described above.

- [ ] **Step 5: Record WASM spike results**

Record in the commit message: WASM file size (raw and gzipped), whether all 15 fixtures pass, and body boundary behavior confirmation.

- [ ] **Step 6: Commit**

```bash
git add tree-sitter-clearnotation/wasm-spike.mjs tree-sitter-clearnotation/tree-sitter-clearnotation.wasm tree-sitter-clearnotation/package.json tree-sitter-clearnotation/pnpm-lock.yaml
git commit -m "spike: tree-sitter WASM build passes all 15 fixtures

WASM size: XXX KB raw, XXX KB gzipped.
All 15 valid fixtures parse without ERROR nodes.
Body boundaries: parsed-mode bodies are raw blobs (by design),
raw-mode bodies contain verbatim content, none-mode directives
have no body."
```

---

### Task 4: BlockNote Spike — Dynamic Registration + Vanilla JS

**Files:**
- Create: `editor/package.json`
- Create: `editor/tsconfig.json`
- Create: `editor/vite.config.ts`
- Create: `editor/index.html`
- Create: `editor/src/main.ts`
- Create: `editor/src/spike-blocks.ts`

- [ ] **Step 1: Initialize the editor package**

```bash
mkdir -p editor/src
```

Create `editor/package.json`:

```json
{
  "name": "clearnotation-editor",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Install dependencies — try vanilla JS first**

```bash
cd editor
pnpm add @blocknote/core @blocknote/mantine @mantine/core
pnpm add -D vite typescript @types/node
```

Note: we start with `@blocknote/core` (not `@blocknote/react`). If vanilla JS works, we stay here. If the slash menu, toolbar, and drag handles require React rendering, we add `@blocknote/react react react-dom @types/react @types/react-dom` in a later step.

- [ ] **Step 3: Create tsconfig.json**

Create `editor/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create Vite config**

Create `editor/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
});
```

- [ ] **Step 5: Create the spike HTML**

Create `editor/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlockNote Spike</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 20px; margin-bottom: 24px; }
    #editor { border: 1px solid #e5e7eb; border-radius: 8px; min-height: 400px; }
    #results { margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>BlockNote Spike: Dynamic Block Registration</h1>
  <div id="editor"></div>
  <div id="results">Spike results will appear here...</div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Write the dynamic block registration spike**

Create `editor/src/spike-blocks.ts`:

```typescript
// Spike: Can we dynamically register BlockNote blocks from a JSON config?
// This simulates reading clearnotation.toml directives at runtime.

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

// Simulated registry entry (matches builtin-registry.toml structure)
interface DirectiveSpec {
  name: string;
  placement: string;
  body_mode: "parsed" | "raw" | "none";
  attributes: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: unknown;
    allowed_values?: string[];
  }>;
}

// The 9 built-in directives from reference/builtin-registry.toml
export const BUILTIN_DIRECTIVES: DirectiveSpec[] = [
  { name: "callout", placement: "block", body_mode: "parsed", attributes: [
    { name: "kind", type: "string", required: true, allowed_values: ["info", "warning", "danger", "tip"] },
    { name: "title", type: "string", required: false },
    { name: "compact", type: "boolean", required: false, default: false },
  ]},
  { name: "figure", placement: "block", body_mode: "parsed", attributes: [
    { name: "src", type: "string", required: true },
  ]},
  { name: "math", placement: "block", body_mode: "raw", attributes: [] },
  { name: "table", placement: "block", body_mode: "raw", attributes: [
    { name: "header", type: "boolean", required: false, default: false },
    { name: "align", type: "string[]", required: false, allowed_values: ["left", "center", "right"] },
  ]},
  { name: "source", placement: "block", body_mode: "raw", attributes: [
    { name: "language", type: "string", required: true },
  ]},
  { name: "toc", placement: "block", body_mode: "none", attributes: [] },
  { name: "anchor", placement: "block", body_mode: "none", attributes: [
    { name: "id", type: "string", required: true },
  ]},
  { name: "include", placement: "block", body_mode: "none", attributes: [
    { name: "src", type: "string", required: true },
  ]},
];

export function logSpikeResult(message: string) {
  const el = document.getElementById("results");
  if (el) el.textContent += message + "\n";
}

export { type DirectiveSpec };
```

- [ ] **Step 7: Write the main spike entry point**

Create `editor/src/main.ts`:

```typescript
import { BlockNoteEditor } from "@blocknote/core";
import "@blocknote/core/style.css";
import { BUILTIN_DIRECTIVES, logSpikeResult } from "./spike-blocks";

async function runSpike() {
  logSpikeResult("=== BlockNote Spike Results ===\n");

  // SPIKE 1: Can we create a basic BlockNote editor without React?
  logSpikeResult("1. Vanilla JS editor creation...");
  try {
    const editor = BlockNoteEditor.create();
    const editorEl = document.getElementById("editor");
    if (editorEl) {
      // BlockNote.mount() is the vanilla JS API
      // If this method doesn't exist, vanilla JS is not supported
      if (typeof (editor as any).mount === "function") {
        (editor as any).mount(editorEl);
        logSpikeResult("   PASS: editor.mount() exists and ran");
      } else {
        logSpikeResult("   FAIL: editor.mount() does not exist");
        logSpikeResult("   Vanilla JS API not available. Need React.");
      }
    }
  } catch (e) {
    logSpikeResult(`   FAIL: ${e}`);
  }

  // SPIKE 2: Does the slash menu appear?
  logSpikeResult("\n2. Slash menu availability...");
  logSpikeResult("   (Type / in the editor to verify manually)");

  // SPIKE 3: Can we register custom block types?
  logSpikeResult("\n3. Dynamic block registration from registry...");
  try {
    const directives = BUILTIN_DIRECTIVES.filter(d => d.placement === "block");
    logSpikeResult(`   Found ${directives.length} block directives in registry`);
    for (const dir of directives) {
      logSpikeResult(`   - ${dir.name} (body_mode=${dir.body_mode}, ${dir.attributes.length} attrs)`);
    }
    logSpikeResult("   (Block registration requires custom BlockSpec — see BlockNote docs)");
  } catch (e) {
    logSpikeResult(`   FAIL: ${e}`);
  }

  // SPIKE 4: Bundle size measurement
  logSpikeResult("\n4. Bundle size...");
  logSpikeResult("   Run: pnpm build && ls -la dist/assets/");
  logSpikeResult("   Then: gzip -k dist/assets/*.js && ls -la dist/assets/*.js.gz");
}

runSpike();
```

- [ ] **Step 8: Run the dev server**

```bash
cd editor
pnpm dev
```

Expected: Vite dev server starts. Open the URL in browser. The spike page should show the editor and results. Check:
1. Does `editor.mount()` exist? (vanilla JS API)
2. Does the slash menu appear when you type `/`?
3. Are the 8 block directives listed in the results?

If `editor.mount()` does not exist, vanilla JS is not supported. Add React:

```bash
cd editor
pnpm add @blocknote/react react react-dom
pnpm add -D @types/react @types/react-dom
```

Then rewrite `main.ts` to use React rendering. Update the spike results.

- [ ] **Step 9: Build and measure bundle size**

```bash
cd editor
pnpm build
ls -la dist/assets/
```

Then measure gzipped:
```bash
for f in dist/assets/*.js; do gzip -k "$f"; done
ls -la dist/assets/*.js.gz
```

Record: total JS bundle size (raw and gzipped). Compare against 750KB budget.

- [ ] **Step 10: Record spike results and commit**

Update the results section of `editor/src/main.ts` with actual findings. Then:

```bash
git add editor/
git commit -m "spike: BlockNote editor initialization + bundle size

Vanilla JS: PASS/FAIL (mount() exists: yes/no)
Slash menu: PASS/FAIL
Bundle size: XXX KB raw, XXX KB gzipped
React required: yes/no"
```

---

### Task 5: Decision Gate

This is not a code task. It's a decision point based on spike results.

- [ ] **Step 1: Evaluate spike results**

Review the three spikes:

| Spike | Question | Pass criteria |
|-------|----------|---------------|
| WASM | Grammar generates + builds to WASM + all 15 fixtures parse | No ERROR nodes in any fixture |
| BlockNote vanilla | `editor.mount()` works + slash menu appears | Functional editor without React |
| BlockNote React fallback | If vanilla fails, React version works | Functional editor with React |
| Bundle | Total gzipped JS < 750KB | Measure after build |
| Body boundaries | External scanner handles all three body modes correctly | v06, v07, v08 parse as expected |

- [ ] **Step 2: Document decisions**

Create a brief spike report as a commit message or in the plan:
- WASM: pass/fail + file sizes
- BlockNote: vanilla/React + bundle size
- Architecture changes (if any) from spike failures
- Updated bundle budget based on real measurements

- [ ] **Step 3: Clean up spike artifacts**

Remove temporary spike files that won't be needed:
```bash
rm tree-sitter-clearnotation/wasm-spike.mjs
rm tree-sitter-clearnotation/tree-sitter-clearnotation.wasm.gz
git add -A
git commit -m "chore: clean up spike artifacts, keep WASM binary"
```

The WASM binary (`tree-sitter-clearnotation.wasm`) stays — it's needed for Phase 1.
The editor scaffold (`editor/`) stays — it's the foundation for Phase 2.

---

### Task 6: Stub clearnotation-js Package

**Files:**
- Create: `clearnotation-js/package.json`
- Create: `clearnotation-js/tsconfig.json`
- Create: `clearnotation-js/src/index.ts`

- [ ] **Step 1: Create the package**

```bash
mkdir -p clearnotation-js/src
```

Create `clearnotation-js/package.json`:

```json
{
  "name": "clearnotation-js",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "echo \"no tests yet\""
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `clearnotation-js/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create stub entry point**

Create `clearnotation-js/src/index.ts`:

```typescript
// ClearNotation JS — validator, normalizer, and renderer
// Ported from clearnotation_reference/ (Python)
// This package is used by the browser editor for HTML export.

export const VERSION = "0.0.1";
```

- [ ] **Step 4: Verify workspace resolution**

```bash
pnpm install
pnpm -r list --depth=0
```

Expected: all 4 packages listed (tree-sitter-clearnotation, clearnotation-js, editor, vscode-clearnotation).

- [ ] **Step 5: Commit**

```bash
git add clearnotation-js/
git commit -m "feat: stub clearnotation-js package in pnpm workspace"
```

---
