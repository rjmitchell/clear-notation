# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the landing page from dark tech-blue to paper+ink aesthetic, fix bugs, rewrite copy in plain English, and add an infographic stats row.

**Architecture:** Two files: `landing/style.css` (theme change) and `landing/index.html` (structure, copy, new stats section). CSS changes first so the HTML edits render correctly as they're made.

**Tech Stack:** Static HTML, CSS, no build step

---

### Task 1: Restyle CSS to paper+ink theme

**Files:**
- Modify: `landing/style.css`

- [ ] **Step 1: Replace CSS variables and remove dark mode**

In `landing/style.css`, replace the `:root` block (lines 3-18) with:

```css
:root {
  --cn-bg: #fefdf5;
  --cn-fg: #111;
  --cn-accent: #111;
  --cn-accent-hover: #333;
  --cn-surface: #f5f5f0;
  --cn-border: #d6d3d1;
  --cn-muted: #78716c;
  --cn-code-bg: #f5f5f0;

  --cn-radius-sm: 4px;
  --cn-radius-md: 8px;
  --cn-radius-lg: 12px;

  --cn-max-width: 1024px;
}
```

Delete the entire `@media (prefers-color-scheme: dark)` block (lines 20-31).

- [ ] **Step 2: Update nav logo to monospace**

Replace the `.nav-logo` rule:

```css
.nav-logo {
  font-family: "Geist Mono", monospace;
  font-weight: 600;
  font-size: 15px;
  color: var(--cn-fg);
  text-decoration: none;
  letter-spacing: 0;
}
```

- [ ] **Step 3: Update section labels to monospace**

Replace the `.section-label` rule:

```css
.section-label {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--cn-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
```

- [ ] **Step 4: Update token colors for paper+ink**

Replace the token color rules (lines 311-314):

```css
.token-key     { color: #111; }
.token-string  { color: #92400e; }
.token-comment { color: #a8a29e; font-style: italic; }
.token-punct   { color: #78716c; }
```

- [ ] **Step 5: Add stats row CSS**

Add before the `/* -- Footer */` comment:

```css
/* -- Stats Row ─────────────────────────────────────────── */

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--cn-surface);
  border: 1px solid var(--cn-border);
  border-radius: 6px;
  padding: 24px;
}

.stat-label {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  color: var(--cn-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.stat-headline {
  font-family: "Geist Sans", sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--cn-fg);
  margin-bottom: 16px;
}

.stat-desc {
  font-size: 12px;
  color: #57534e;
  line-height: 1.5;
  margin-top: 16px;
}

.stat-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.stat-bar-label {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  width: 32px;
  flex-shrink: 0;
}

.stat-bar-track {
  flex: 1;
  background: #e7e5e4;
  border-radius: 2px;
  height: 22px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  color: #fefdf5;
}

.stat-bar-fill.primary { background: #111; }
.stat-bar-fill.muted   { background: #a8a29e; }

.stat-tally {
  display: flex;
  justify-content: space-around;
  text-align: center;
}

.stat-tally-num {
  font-family: "Geist Mono", monospace;
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
}

.stat-tally-caption {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  margin-top: 4px;
}

.stat-tally-divider {
  width: 1px;
  background: var(--cn-border);
}

.stat-impl-grid {
  display: flex;
  gap: 12px;
}

.stat-impl-col {
  flex: 1;
  text-align: center;
}

.stat-impl-col-label {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  margin-bottom: 6px;
  font-weight: 600;
}

.stat-impl-pills {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}

.stat-impl-pill {
  padding: 5px 4px;
  border-radius: 2px;
  font-family: "Geist Mono", monospace;
  font-size: 9px;
}

.stat-impl-pill.primary { background: #111; color: #fefdf5; }
.stat-impl-pill.muted   { background: #d6d3d1; color: #57534e; }

.stat-impl-footer {
  font-family: "Geist Mono", monospace;
  font-size: 9px;
  color: var(--cn-muted);
  margin-top: 4px;
}
```

- [ ] **Step 6: Add stats row to responsive breakpoint**

In the `@media (max-width: 768px)` block, add:

```css
  .stats-row {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 7: Verify CSS renders without errors**

Open `landing/index.html` in a browser. The page should render with the warm white background, black text, and warm gray borders. Code blocks should use amber/brown strings instead of green. The overall look should be "paper + ink".

Run: `cd /Users/ryan/projects/clear-notation && python3 -m http.server 8080 --directory landing &` then check http://localhost:8080

- [ ] **Step 8: Commit**

```bash
git add landing/style.css
git commit -m "style: retheme landing page to paper+ink aesthetic"
```

---

### Task 2: Fix bugs and rewrite HTML copy

**Files:**
- Modify: `landing/index.html`

- [ ] **Step 1: Fix the hero description**

Replace the hero description paragraph (line 48-50):

```html
      <p class="hero-description">
        A markup language with a formal grammar, strict parsing,
        and one way to write each thing.
      </p>
```

- [ ] **Step 2: Fix the comparison section copy**

Replace the comparison section subtitle (lines 75-77):

```html
      <p class="section-subtitle">
        Every construct has one form. The parser either succeeds or fails with a clear error.
      </p>
```

- [ ] **Step 3: Fix the comparison column height mismatch**

The ClearNotation `<pre>` block has fewer lines than the Markdown one. Add a blank line before the closing `</code></pre>` in the ClearNotation column so both columns have equal content height. Or, add this CSS approach instead: in both `.comparison-col` elements, the grid already stretches columns to equal height. The issue is the `<pre>` not filling. Add to `style.css`:

```css
.comparison-col {
  display: flex;
  flex-direction: column;
}

pre.comparison-code {
  flex: 1;
}
```

This makes the `<pre>` fill the remaining height in each column, so both backgrounds extend equally regardless of content length.

- [ ] **Step 4: Rewrite the features section**

Replace the features section (lines 143-177) with:

```html
  <section class="section">
    <div class="container">
      <p class="section-label">Why ClearNotation</p>
      <h2 class="section-title">What you get</h2>
      <p class="section-subtitle">
        A spec you can test against, not a collection of conventions.
      </p>
      <div class="features-grid">
        <div class="feature-item">
          <span class="feature-title">Formal grammar</span>
          <p class="feature-desc">The spec is a grammar. Every valid document maps to a typed AST. No implementation guesswork.</p>
        </div>
        <div class="feature-item">
          <span class="feature-title">Strict parsing</span>
          <p class="feature-desc">Unknown directives, bad references, and missing includes all produce errors, not silent garbage.</p>
        </div>
        <div class="feature-item">
          <span class="feature-title">Typed extensions</span>
          <p class="feature-desc">Custom directives go in <code style="font-family: 'Geist Mono', monospace; font-size: 13px; background: var(--cn-code-bg); padding: 1px 4px; border-radius: 3px;">clearnotation.toml</code>. Documents stay clean.</p>
        </div>
        <div class="feature-item">
          <span class="feature-title">One way to write it</span>
          <p class="feature-desc">Bold is <code style="font-family: 'Geist Mono', monospace; font-size: 13px; background: var(--cn-code-bg); padding: 1px 4px; border-radius: 3px;">+{text}</code>. Links are <code style="font-family: 'Geist Mono', monospace; font-size: 13px; background: var(--cn-code-bg); padding: 1px 4px; border-radius: 3px;">[label -> url]</code>. No shorthand variants.</p>
        </div>
        <div class="feature-item">
          <span class="feature-title">Multiple implementations</span>
          <p class="feature-desc">Python CLI, JavaScript renderer, tree-sitter grammar, and VS Code extension, all from one spec.</p>
        </div>
        <div class="feature-item">
          <span class="feature-title">70 conformance fixtures</span>
          <p class="feature-desc">The test suite covers valid documents, parse errors, and validation errors. New implementations can check compliance on their own.</p>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 5: Rewrite the install section subtitle**

Replace the install section subtitle (lines 184-186):

```html
      <p class="section-subtitle">
        All three share the same spec.
      </p>
```

- [ ] **Step 6: Fix VS Code install command**

Replace the install command (line 200-201):

```html
            <code>ext install ClearNotation.clearnotation</code>
            <button class="copy-btn" onclick="copy(this, 'ext install ClearNotation.clearnotation')" aria-label="Copy command">
```

- [ ] **Step 7: Fix the dead footer link**

Replace the footer grammar link (line 253):

```html
        <li><a href="https://github.com/rjmitchell/clear-notation/blob/main/clearnotation-v1.0.ebnf" target="_blank" rel="noopener">Grammar</a></li>
```

- [ ] **Step 8: Commit**

```bash
git add landing/index.html landing/style.css
git commit -m "fix: landing page bugs, rewrite copy in plain English"
```

---

### Task 3: Add stats row section

**Files:**
- Modify: `landing/index.html`

- [ ] **Step 1: Add the stats section HTML**

Insert this new section between the comparison section's closing `</section>` (line 140) and the features section's opening `<section>`:

```html
  <!-- Stats -->
  <section class="section">
    <div class="container">
      <p class="section-label">By the numbers</p>
      <h2 class="section-title">What formal specification gets you</h2>

      <div class="stats-row">
        <!-- Conformance -->
        <div class="stat-card">
          <div class="stat-label">Conformance</div>
          <div class="stat-headline">Every edge case is specified</div>
          <div>
            <div class="stat-bar">
              <span class="stat-bar-label" style="color: var(--cn-fg);">CLN</span>
              <div class="stat-bar-track">
                <div class="stat-bar-fill primary" style="width: 100%;">100%</div>
              </div>
            </div>
            <div class="stat-bar">
              <span class="stat-bar-label" style="color: var(--cn-muted);">MD</span>
              <div class="stat-bar-track">
                <div class="stat-bar-fill muted" style="width: 51%;">~51%</div>
              </div>
            </div>
          </div>
          <p class="stat-desc">70 test fixtures cover every valid, parse-invalid, and validate-invalid case. CommonMark specifies roughly half its examples; the rest vary by parser.</p>
        </div>

        <!-- Syntax forms -->
        <div class="stat-card">
          <div class="stat-label">Syntax forms</div>
          <div class="stat-headline">No ambiguity, no style debates</div>
          <div class="stat-tally">
            <div>
              <div class="stat-tally-num" style="color: var(--cn-fg);">1</div>
              <div class="stat-tally-caption" style="color: var(--cn-fg); font-weight: 600;">way to write it</div>
              <div class="stat-tally-caption" style="color: var(--cn-muted);">in CLN</div>
            </div>
            <div class="stat-tally-divider"></div>
            <div>
              <div class="stat-tally-num" style="color: #a8a29e;">3-5</div>
              <div class="stat-tally-caption" style="color: var(--cn-muted);">ways to write it</div>
              <div class="stat-tally-caption" style="color: var(--cn-muted);">in Markdown</div>
            </div>
          </div>
          <p class="stat-desc">Bold is <code style="font-family: 'Geist Mono', monospace; font-size: 11px;">+{text}</code>. Links are <code style="font-family: 'Geist Mono', monospace; font-size: 11px;">[label -> url]</code>. One form per concept means every doc reads the same way.</p>
        </div>

        <!-- Implementations -->
        <div class="stat-card">
          <div class="stat-label">Implementations</div>
          <div class="stat-headline">Same output, every tool</div>
          <div class="stat-impl-grid">
            <div class="stat-impl-col">
              <div class="stat-impl-col-label" style="color: var(--cn-fg);">CLN</div>
              <div class="stat-impl-pills">
                <div class="stat-impl-pill primary">Python</div>
                <div class="stat-impl-pill primary">JS</div>
                <div class="stat-impl-pill primary">tree-sitter</div>
                <div class="stat-impl-pill primary">VS Code</div>
              </div>
              <div class="stat-impl-footer" style="color: var(--cn-fg);">1 spec, same output</div>
            </div>
            <div style="width: 1px; background: var(--cn-border);"></div>
            <div class="stat-impl-col">
              <div class="stat-impl-col-label" style="color: var(--cn-muted);">Markdown</div>
              <div class="stat-impl-pills">
                <div class="stat-impl-pill muted">GFM</div>
                <div class="stat-impl-pill muted">MDX</div>
                <div class="stat-impl-pill muted">kramdown</div>
                <div class="stat-impl-pill muted">CommonMk</div>
              </div>
              <div class="stat-impl-footer">30+ parsers, different output</div>
            </div>
          </div>
          <p class="stat-desc">Four implementations verified against one conformance suite. Switch tools and your docs still render the same way.</p>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check**

Open the page in a browser. Verify:
- Stats row appears between comparison and features
- Three cards are side-by-side on desktop
- Bar chart shows 100% vs ~51% clearly
- Big numbers (1 vs 3-5) are readable
- Implementation pills render in grid
- Responsive: cards stack on mobile (resize to <768px)

- [ ] **Step 3: Commit**

```bash
git add landing/index.html
git commit -m "feat: add CLN vs Markdown stats row to landing page"
```

---

### Task 4: Final review and visual QA

**Files:**
- Modify: `landing/index.html` (if needed)
- Modify: `landing/style.css` (if needed)

- [ ] **Step 1: Full page review**

Open the landing page in a browser and review top to bottom:
- Nav: monospace logo, plain links, warm white bg
- Hero: black badge, plain description, black primary button
- Comparison: matched column heights, warm token colors, no blue
- Stats: three cards with clear value framing
- Features: plain English copy, no jargon
- Install: correct VS Code command (`ClearNotation.clearnotation`)
- Footer: grammar link points to v1.0

- [ ] **Step 2: Check for remaining AI-isms**

Read every line of visible text in `landing/index.html`. Flag and fix any:
- Em dashes (use "," or "." instead)
- Jargon ("leverage", "harness", "empower", "seamlessly")
- Marketing voice ("revolutionize", "game-changing", "cutting-edge")
- Passive constructions that could be active

The existing `&mdash;` in the footer (line 250) should be replaced with a plain separator.

- [ ] **Step 3: Commit any fixes**

```bash
git add landing/index.html landing/style.css
git commit -m "fix: final copy and visual polish for landing page"
```
