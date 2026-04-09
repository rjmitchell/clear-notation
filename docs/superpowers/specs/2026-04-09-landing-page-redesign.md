# Landing Page Redesign -- Design Spec

**Date:** 2026-04-09
**Scope:** Restyle the landing page from dark tech-blue to paper+ink aesthetic, fix bugs, rewrite copy, add infographic stats row.

## Bug fixes

1. **Blank space in CLN comparison box:** The ClearNotation column is shorter than the Markdown column. Both columns should match height naturally (CSS grid already does this; the issue is likely extra whitespace in the Markdown `<pre>` block or padding differences). Equalize content so both feel balanced.
2. **Dead footer link:** `clearnotation-v0.1.ebnf` should be `clearnotation-v1.0.ebnf`.
3. **Stale conformance count:** "57 conformance fixtures" should be "70 conformance fixtures".
4. **VS Code install command:** Should be `ext install ClearNotation.clearnotation` (publisher is ClearNotation, not lowercase).

## Style: paper + ink

Replace the dark theme and blue accent with a warm, typeset aesthetic.

### CSS variables (light)

```css
--cn-bg: #fefdf5;        /* warm white */
--cn-fg: #111;            /* near-black text */
--cn-accent: #111;        /* black accent (buttons, badges) */
--cn-accent-hover: #333;
--cn-surface: #f5f5f0;    /* cards, code bg */
--cn-border: #d6d3d1;     /* warm gray borders */
--cn-muted: #78716c;      /* secondary text */
--cn-code-bg: #f5f5f0;    /* code blocks */
```

### CSS variables (dark -- remove)

Remove the `prefers-color-scheme: dark` media query entirely. This is a light-only page. The editor has its own dark mode; the landing page does not need one.

### Typography changes

- Nav logo: `font-family: 'Geist Mono', monospace` (terminal feel)
- Hero badge: black border + black text, not blue
- Section labels: `font-family: 'Geist Mono', monospace`, uppercase, black text (not blue)
- Comparison dot accent color: black (was blue)
- Token colors in comparison: `--token-key: #111` (black), `--token-string: #92400e` (amber/brown), `--token-comment: #a8a29e` (warm gray), `--token-punct: #78716c`

### Button changes

- Primary: `background: #111; color: #fefdf5` (black on cream)
- Primary hover: `background: #333`
- Secondary: same border style, no blue

## Copy rewrite

All copy should be plain English. No em dashes. No marketing jargon.

### Hero

- Tagline: "Technical documentation, clearly." (keep)
- Description: "A markup language with a formal grammar, strict parsing, and one way to write each thing." (remove "docs-first", "normative EBNF", "typed extensibility", "Not Markdown-compatible by design")

### Comparison section

- Label: "Syntax" (keep)
- Title: "Clean by design, not by accident" (keep)
- Subtitle: "Every construct has one form. The parser either succeeds or fails with a clear error." (shorter, no "explicit, unambiguous syntax")

### Features section

- Label: "Why ClearNotation" (keep)
- Title: "What you get" (replace "Built for documentation that ships")
- Subtitle: "A spec you can test against, not a collection of conventions." (replace "Markdown accumulates ambiguity...")
- Feature cards -- rewrite each for plain English:
  - "Normative EBNF grammar" -> "Formal grammar" / "The spec is a grammar. Every valid document maps to a typed AST. No implementation guesswork."
  - "Fail-closed parsing" -> "Strict parsing" / "Unknown directives, bad references, and missing includes all produce errors, not silent garbage."
  - "Typed extensibility" -> "Typed extensions" / "Custom directives go in clearnotation.toml. Documents stay clean."
  - "One syntax, one meaning" -> "One way to write it" / "Bold is +{text}. Links are [label -> url]. No shorthand variants."
  - "Multi-implementation" -> "Multiple implementations" / "Python CLI, JavaScript renderer, tree-sitter grammar, and VS Code extension, all from one spec."
  - "57 conformance fixtures" -> "70 conformance fixtures" / "The test suite covers valid documents, parse errors, and validation errors. New implementations can check compliance on their own."

### Install section

- Title: "Get started" (keep)
- Subtitle: "All three share the same spec." (shorter)

### Footer

- Fix grammar link to v1.0

## New section: stats row

Add between the code comparison and features sections. Three stat cards in a horizontal row.

### Card 1: Conformance

- Label: "Conformance"
- Headline: "Every edge case is specified"
- Visual: horizontal bar chart. CLN bar at 100% (black), Markdown bar at ~51% (warm gray)
- Description: "70 test fixtures cover every valid, parse-invalid, and validate-invalid case. CommonMark specifies roughly half its examples; the rest vary by parser."

### Card 2: Syntax forms

- Label: "Syntax forms"
- Headline: "No ambiguity, no style debates"
- Visual: big number comparison. "1 way to write it / in CLN" vs "3-5 ways to write it / in Markdown"
- Description: "Bold is +{text}. Links are [label -> url]. One form per concept means every doc reads the same way."

### Card 3: Implementations

- Label: "Implementations"
- Headline: "Same output, every tool"
- Visual: side-by-side grid. CLN shows 4 black pills (Python, JS, tree-sitter, VS Code) with "1 spec, same output". Markdown shows 4 gray pills (GFM, MDX, kramdown, CommonMark) with "30+ parsers, different output".
- Description: "Four implementations verified against one conformance suite. Switch tools and your docs still render the same way."

### Styling

- Cards: `background: #f5f5f0; border: 1px solid #d6d3d1; border-radius: 6px; padding: 24px`
- Labels: `font-family: 'Geist Mono'; font-size: 11px; uppercase; color: #78716c`
- Headlines: `font-size: 15px; font-weight: 600; color: #111`
- Description: `font-size: 12px; color: #57534e`

### Responsive

- Stats row: 3 columns on desktop, stack to 1 column on mobile (same breakpoint as features grid, 768px)

## Files touched

- `landing/index.html` -- HTML structure, copy, new stats section
- `landing/style.css` -- paper+ink theme, stats row styles, remove dark mode
