# Hosted Editor Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get ClearNotation's existing tools published and discoverable — VS Code marketplace, npm, and a landing page that explains what CLN is and links to the live editor.

**Architecture:** Three independent workstreams: (1) VS Code extension polish + marketplace publish, (2) clearnotation-js npm publish, (3) static landing page at GitHub Pages root with editor moved to /editor/. Each can ship independently.

**Tech Stack:** VS Code extension (TypeScript + TextMate grammar), clearnotation-js (TypeScript + Vite), landing page (static HTML/CSS using DESIGN.md system), GitHub Pages, GitHub Actions

**Design spec:** `~/.gstack/projects/rjmitchell-clear-notation/ryan-docs/readme-v1-design-20260408-194517.md`

---

## File Map

### Task 1: VS Code Extension → Marketplace
- Create: `vscode-clearnotation/README.md`
- Create: `vscode-clearnotation/icon.png` (128x128 CLN logo)
- Create: `vscode-clearnotation/CHANGELOG.md`
- Modify: `vscode-clearnotation/package.json` (add icon, categories, keywords, repository, homepage, description)

### Task 2: clearnotation-js → npm
- Create: `clearnotation-js/README.md`
- Modify: `clearnotation-js/package.json` (remove private, add files, description, keywords, repository, license)
- Create: `.github/workflows/publish-npm.yml`

### Task 3: Landing Page + Editor URL Change
- Create: `landing/index.html` (static landing page)
- Create: `landing/style.css` (landing page styles using DESIGN.md variables)
- Modify: `editor/vite.config.ts` (change base from `/clear-notation/` to `/clear-notation/editor/`)
- Modify: `.github/workflows/deploy.yml` (build landing page + editor, deploy both)

---

## Task 1: VS Code Extension → Marketplace (branch: `feat/vscode-publish`)

### Task 1.1: Add icon, README, and metadata

**Files:**
- Create: `vscode-clearnotation/README.md`
- Create: `vscode-clearnotation/CHANGELOG.md`
- Modify: `vscode-clearnotation/package.json`

- [ ] **Step 1: Create README.md for the extension**

Create `vscode-clearnotation/README.md`:

```markdown
# ClearNotation for Visual Studio Code

Syntax highlighting for [ClearNotation](https://github.com/rjmitchell/clear-notation) (.cln) files.

## Features

- Full TextMate grammar for ClearNotation v1.0
- Highlights headings, directives, inline formatting (+{strong}, *{emphasis}), links, code spans, comments
- File association for `.cln` files
- Bracket matching and auto-closing pairs

## Installation

Search for "ClearNotation" in the VS Code extensions marketplace, or:

```
ext install clearnotation.clearnotation
```

## What is ClearNotation?

ClearNotation is a docs-first, non-Turing-complete markup language for technical documentation. Clean-sheet design with normative EBNF, fail-closed parsing, and typed extensibility.

- [Spec and reference implementation](https://github.com/rjmitchell/clear-notation)
- [Live editor](https://rjmitchell.github.io/clear-notation/)
- `pip install clearnotation` (CLI: build, check, fmt, watch, convert)
- `npm install clearnotation-js` (JS normalizer + renderer)

## Syntax Overview

```clearnotation
::meta{
title = "Example"
}

# Heading

Paragraph with +{bold} and *{italic} text.

- Unordered list item
  - Nested item

1. Ordered list
2. With numbers

> Blockquote

[Link label -> https://example.com]

::callout[kind="info"]{
A callout block.
}
```
```

- [ ] **Step 2: Create CHANGELOG.md**

Create `vscode-clearnotation/CHANGELOG.md`:

```markdown
# Changelog

## [1.0.0] - 2026-04-08

### Added
- TextMate grammar for ClearNotation v1.0 syntax
- Syntax highlighting for headings, directives, inline formatting, links, code spans, comments
- File association for `.cln` files
- Bracket matching and auto-closing pairs
```

- [ ] **Step 3: Update package.json with marketplace metadata**

In `vscode-clearnotation/package.json`, add/update these fields:

```json
{
  "name": "clearnotation",
  "displayName": "ClearNotation",
  "description": "Syntax highlighting for ClearNotation (.cln) technical documentation files",
  "version": "1.0.0",
  "publisher": "clearnotation",
  "icon": "icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/rjmitchell/clear-notation"
  },
  "homepage": "https://github.com/rjmitchell/clear-notation",
  "categories": ["Programming Languages"],
  "keywords": ["clearnotation", "cln", "documentation", "markup", "technical writing"],
  "license": "MIT"
}
```

Keep existing `engines`, `contributes`, `scripts`, and `devDependencies` unchanged.

- [ ] **Step 4: Create a placeholder icon**

Generate a simple 128x128 PNG icon for the extension. Use a monochrome design: the letters "CLN" in Geist Sans 600 on a #2563eb background with white text. Save as `vscode-clearnotation/icon.png`.

If generating an image isn't possible, create a minimal SVG-based icon:

```bash
# Placeholder: create a simple icon with ImageMagick or skip if not available
convert -size 128x128 xc:'#2563eb' -gravity center -fill white -font Helvetica-Bold -pointsize 36 -annotate 0 'CLN' vscode-clearnotation/icon.png 2>/dev/null || echo "SKIP: create icon manually"
```

- [ ] **Step 5: Build and verify the extension packages**

```bash
cd vscode-clearnotation
npm ci
npm run compile
npx vsce package
```

Expected: produces `clearnotation-1.0.0.vsix` without errors.

- [ ] **Step 6: Commit**

```bash
git add vscode-clearnotation/README.md vscode-clearnotation/CHANGELOG.md vscode-clearnotation/package.json vscode-clearnotation/icon.png
git commit -m "chore: prepare VS Code extension for marketplace publish"
```

### Task 1.2: Publish to marketplace

- [ ] **Step 7: Verify VSCE_PAT secret exists**

```bash
gh secret list | grep VSCE_PAT
```

If missing: the user needs to create a Personal Access Token at https://dev.azure.com and add it as a repository secret named `VSCE_PAT`.

- [ ] **Step 8: Push and tag to trigger publish**

```bash
git push origin feat/vscode-publish
git tag vscode-v1.0.0
git push origin vscode-v1.0.0
```

This triggers `.github/workflows/publish-vscode.yml` which runs `vsce publish`.

- [ ] **Step 9: Verify the extension is live**

```bash
gh run list --workflow=publish-vscode.yml --limit 1
```

Expected: workflow completes successfully. Then check: https://marketplace.visualstudio.com/items?itemName=clearnotation.clearnotation

---

## Task 2: clearnotation-js → npm (branch: `feat/npm-publish`)

### Task 2.1: Prepare the package for publishing

**Files:**
- Create: `clearnotation-js/README.md`
- Modify: `clearnotation-js/package.json`

- [ ] **Step 1: Create README.md for the npm package**

Create `clearnotation-js/README.md`:

```markdown
# clearnotation-js

JavaScript/TypeScript normalizer and HTML renderer for [ClearNotation](https://github.com/rjmitchell/clear-notation) documents.

## Installation

```bash
npm install clearnotation-js
```

## Usage

```typescript
import { normalizeAst, renderHtml } from "clearnotation-js";
import type { NormalizedDocument } from "clearnotation-js";

// normalizeAst converts a raw AST (from Python's `cln ast` output) to typed nodes
const doc: NormalizedDocument = normalizeAst(rawAstJson);

// renderHtml produces a complete HTML document
const html: string = renderHtml(doc);
```

## API

### `normalizeAst(ast: object): NormalizedDocument`

Converts a raw JSON AST (as produced by `cln ast <file>`) into a typed `NormalizedDocument` with discriminated union block and inline node types.

### `renderHtml(doc: NormalizedDocument, options?: RenderOptions): string`

Renders a normalized document to a complete HTML string with `<head>`, `<body>`, and default stylesheet.

Options:
- `cssPath?: string` — path to the stylesheet (default: `"clearnotation.css"`)

## Types

The package exports full TypeScript types for the normalized AST:

- `NormalizedDocument` — root document with `meta`, `blocks`, and `notes`
- `Block` — discriminated union of all block types (heading, paragraph, list, etc.)
- `Inline` — discriminated union of all inline types (text, code, strong, emphasis, link, note, ref)

## What is ClearNotation?

A docs-first, non-Turing-complete markup language for technical documentation. Not Markdown-compatible. Clean-sheet design with normative EBNF, fail-closed parsing, and typed extensibility.

- [Spec and reference implementation](https://github.com/rjmitchell/clear-notation)
- [Live editor](https://rjmitchell.github.io/clear-notation/)
- `pip install clearnotation` (Python CLI)

## License

MIT
```

- [ ] **Step 2: Update package.json for publishing**

In `clearnotation-js/package.json`, make these changes:

1. Remove `"private": true`
2. Update the `name` to `"clearnotation-js"` (already set)
3. Add `files`, `description`, `keywords`, `repository`, `license`, `author`

Add/update these fields:

```json
{
  "description": "JavaScript normalizer and HTML renderer for ClearNotation documents",
  "keywords": ["clearnotation", "cln", "documentation", "markup", "renderer", "html"],
  "repository": {
    "type": "git",
    "url": "https://github.com/rjmitchell/clear-notation",
    "directory": "clearnotation-js"
  },
  "license": "MIT",
  "files": ["dist", "README.md"],
  "version": "1.0.0"
}
```

- [ ] **Step 3: Build and verify the package**

```bash
cd clearnotation-js
pnpm build
pnpm test
pnpm pack --dry-run
```

Expected: build succeeds, 106 tests pass, dry-run shows only dist/ files and README.md.

- [ ] **Step 4: Commit**

```bash
git add clearnotation-js/README.md clearnotation-js/package.json
git commit -m "chore: prepare clearnotation-js for npm publish"
```

### Task 2.2: Create npm publish workflow and publish

**Files:**
- Create: `.github/workflows/publish-npm.yml`

- [ ] **Step 5: Create the GitHub Actions workflow**

Create `.github/workflows/publish-npm.yml`:

```yaml
name: Publish clearnotation-js to npm

on:
  push:
    tags:
      - "npm-v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      - run: pnpm install --frozen-lockfile

      - working-directory: clearnotation-js
        run: pnpm build

      - working-directory: clearnotation-js
        run: pnpm test

      - working-directory: clearnotation-js
        run: pnpm publish --no-git-checks --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 6: Verify NPM_TOKEN secret exists**

```bash
gh secret list | grep NPM_TOKEN
```

If missing: the user needs to create an npm access token at https://www.npmjs.com/settings/tokens and add it as a repository secret named `NPM_TOKEN`.

- [ ] **Step 7: Commit, push, and tag**

```bash
git add .github/workflows/publish-npm.yml
git commit -m "ci: add npm publish workflow for clearnotation-js"
git push origin feat/npm-publish
git tag npm-v1.0.0
git push origin npm-v1.0.0
```

- [ ] **Step 8: Verify the package is live**

```bash
gh run list --workflow=publish-npm.yml --limit 1
```

Expected: workflow completes. Then check: https://www.npmjs.com/package/clearnotation-js

---

## Task 3: Landing Page + Editor URL Change (branch: `feat/landing-page`)

### Task 3.1: Create the landing page

**Files:**
- Create: `landing/index.html`
- Create: `landing/style.css`

The landing page is a static HTML page at the GitHub Pages root. It uses the design system from DESIGN.md (Geist Sans, --cn-accent #2563eb, minimal/industrial aesthetic). The editor SPA moves to `/clear-notation/editor/`.

- [ ] **Step 1: Create landing page HTML**

Create `landing/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClearNotation — Technical documentation, clearly</title>
  <meta name="description" content="A docs-first markup language for technical documentation. Non-Turing-complete, formally specified, fail-closed.">
  <meta property="og:title" content="ClearNotation">
  <meta property="og:description" content="A docs-first markup language for technical documentation. Try the live editor.">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.min.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <h1>ClearNotation</h1>
    <p class="tagline">Technical documentation, clearly.</p>
    <p class="subtitle">A docs-first markup language with normative EBNF, fail-closed parsing, and typed extensibility. Not Markdown-compatible. That's the point.</p>
    <div class="cta-row">
      <a href="editor/" class="cta-primary">Try the live editor</a>
      <a href="https://github.com/rjmitchell/clear-notation" class="cta-secondary">View on GitHub</a>
    </div>
  </header>

  <section class="comparison">
    <h2>ClearNotation vs Markdown</h2>
    <div class="comparison-grid">
      <div class="comparison-col">
        <h3>ClearNotation</h3>
        <pre><code># API Reference

+{Authentication} is required for all endpoints.

::callout[kind="warning"]{
Rate limits apply. See *{Usage Limits}.
}

- Base URL: `https://api.example.com`
  - Version: `v2`
  - Format: JSON only

[Full API docs -> https://docs.example.com]</code></pre>
      </div>
      <div class="comparison-col">
        <h3>Markdown</h3>
        <pre><code># API Reference

**Authentication** is required for all endpoints.

> ⚠️ Rate limits apply. See *Usage Limits*.

- Base URL: `https://api.example.com`
  - Version: `v2`
  - Format: JSON only

[Full API docs](https://docs.example.com)</code></pre>
      </div>
    </div>
    <p class="comparison-note">One syntax per concept. No inline HTML. Directives instead of ad-hoc conventions. Nested lists that work.</p>
  </section>

  <section class="install">
    <h2>Get started</h2>
    <div class="install-grid">
      <div class="install-card">
        <h3>VS Code</h3>
        <p>Syntax highlighting for .cln files</p>
        <code>ext install clearnotation.clearnotation</code>
      </div>
      <div class="install-card">
        <h3>Python CLI</h3>
        <p>Build, check, format, watch, convert</p>
        <code>pip install clearnotation</code>
      </div>
      <div class="install-card">
        <h3>JavaScript</h3>
        <p>Normalizer and HTML renderer</p>
        <code>npm install clearnotation-js</code>
      </div>
    </div>
  </section>

  <footer>
    <p>MIT License · <a href="https://github.com/rjmitchell/clear-notation">GitHub</a> · v1.0.0</p>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Create landing page styles**

Create `landing/style.css` using DESIGN.md variables:

```css
:root {
  --cn-bg: #ffffff;
  --cn-fg: #1a1a1a;
  --cn-accent: #2563eb;
  --cn-accent-hover: #1d4ed8;
  --cn-surface: #f9fafb;
  --cn-border: #e5e7eb;
  --cn-muted: #6b7280;
  --cn-code-bg: #f3f4f6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --cn-bg: #111827;
    --cn-fg: #f3f4f6;
    --cn-accent: #60a5fa;
    --cn-accent-hover: #3b82f6;
    --cn-surface: #1f2937;
    --cn-border: #374151;
    --cn-muted: #9ca3af;
    --cn-code-bg: #1f2937;
  }
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--cn-bg);
  color: var(--cn-fg);
  line-height: 1.6;
}

.hero {
  max-width: 720px;
  margin: 0 auto;
  padding: 80px 24px 64px;
  text-align: center;
}

.hero h1 {
  font-size: 48px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.tagline {
  font-size: 20px;
  color: var(--cn-muted);
  margin-bottom: 16px;
}

.subtitle {
  font-size: 16px;
  color: var(--cn-muted);
  max-width: 540px;
  margin: 0 auto 32px;
}

.cta-row {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.cta-primary {
  background: var(--cn-accent);
  color: white;
  padding: 10px 24px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
}

.cta-primary:hover { background: var(--cn-accent-hover); }

.cta-secondary {
  border: 1px solid var(--cn-border);
  color: var(--cn-fg);
  padding: 10px 24px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
}

.cta-secondary:hover { border-color: var(--cn-muted); }

.comparison {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 24px 64px;
}

.comparison h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  text-align: center;
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.comparison-col h3 {
  font-size: 14px;
  font-weight: 500;
  color: var(--cn-muted);
  margin-bottom: 8px;
}

.comparison-col pre {
  background: var(--cn-code-bg);
  border: 1px solid var(--cn-border);
  border-radius: 8px;
  padding: 16px;
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
}

.comparison-note {
  text-align: center;
  color: var(--cn-muted);
  font-size: 14px;
  margin-top: 16px;
}

.install {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 24px 80px;
}

.install h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  text-align: center;
}

.install-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.install-card {
  border: 1px solid var(--cn-border);
  border-radius: 8px;
  padding: 24px;
}

.install-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.install-card p {
  font-size: 14px;
  color: var(--cn-muted);
  margin-bottom: 12px;
}

.install-card code {
  display: block;
  background: var(--cn-code-bg);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
}

footer {
  text-align: center;
  padding: 24px;
  border-top: 1px solid var(--cn-border);
  font-size: 13px;
  color: var(--cn-muted);
}

footer a { color: var(--cn-accent); text-decoration: none; }

@media (max-width: 640px) {
  .hero h1 { font-size: 32px; }
  .comparison-grid { grid-template-columns: 1fr; }
  .install-grid { grid-template-columns: 1fr; }
  .cta-row { flex-direction: column; align-items: center; }
}
```

- [ ] **Step 3: Commit the landing page**

```bash
git add landing/index.html landing/style.css
git commit -m "feat: add landing page for GitHub Pages root"
```

### Task 3.2: Move editor to /editor/ subpath

**Files:**
- Modify: `editor/vite.config.ts`

- [ ] **Step 4: Update Vite base path**

In `editor/vite.config.ts`, change the base path:

```typescript
// OLD:
base: "/clear-notation/",

// NEW:
base: "/clear-notation/editor/",
```

- [ ] **Step 5: Verify editor builds**

```bash
cd editor && pnpm build
```

Expected: builds without errors. Check that `dist/index.html` references assets with `/clear-notation/editor/` prefix.

- [ ] **Step 6: Run editor tests**

```bash
cd editor && pnpm test
```

Expected: 316 tests pass.

- [ ] **Step 7: Commit**

```bash
git add editor/vite.config.ts
git commit -m "chore: move editor to /editor/ subpath for landing page"
```

### Task 3.3: Update deploy workflow

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 8: Update the deploy workflow to include both landing page and editor**

Replace `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    tags:
      - "v*"

permissions:
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Build editor
        run: cd editor && pnpm build

      - name: Assemble site
        run: |
          mkdir -p _site/editor
          cp landing/index.html _site/
          cp landing/style.css _site/
          cp -r editor/dist/* _site/editor/

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy landing page + editor to GitHub Pages"
```

- [ ] **Step 10: Push and create PR**

```bash
git push origin feat/landing-page
```

Create PR, merge, then tag to trigger deploy:

```bash
git checkout main && git pull
git tag v1.0.1
git push origin v1.0.1
```

- [ ] **Step 11: Verify deployment**

```bash
gh run list --workflow=deploy.yml --limit 1
```

Expected: workflow completes. Landing page at `https://rjmitchell.github.io/clear-notation/` and editor at `https://rjmitchell.github.io/clear-notation/editor/`.

---

## Post-Phase 1 Checklist

After all three tasks complete:

- [ ] VS Code extension live on marketplace: https://marketplace.visualstudio.com/items?itemName=clearnotation.clearnotation
- [ ] clearnotation-js live on npm: https://www.npmjs.com/package/clearnotation-js
- [ ] Landing page live at GitHub Pages root with "Try the live editor" CTA
- [ ] Editor accessible at /editor/ subpath
- [ ] All install commands work: `ext install`, `pip install`, `npm install`

**Phase gate:** Before starting Phase 2 (shareable editor), check: VS Code extension has 10+ installs OR clearnotation-js has 5+ weekly npm downloads. If neither after 4 weeks, reassess.
