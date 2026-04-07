# Design System — ClearNotation

## Product Context
- **What this is:** A browser-based split-pane visual editor for ClearNotation (.cln) technical documentation
- **Who it's for:** Product Managers who write specs, PRDs, and documentation. Progressive syntax learning through the always-visible source pane.
- **Space/industry:** Developer tools, documentation editors (peers: Notion, Linear, Mintlify, GitBook)
- **Project type:** Web app (editor), static site deployment

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal. Typography and spacing do the work. No gradients, no shadows except for elevated elements (modals, menus, dropdowns). Borders define regions.
- **Mood:** Precision instrument. The split pane is the signature visual. The editor should feel like a tool that respects the writer's time, not a toy that demands attention.
- **Reference sites:** Linear (density, keyboard-first), Notion (content-first editing), Mintlify (clean doc tooling)

## Typography
- **Display/UI Chrome:** Geist Sans 600 — geometric, precise, designed for UI. Used for toolbar labels, menu headers, section titles. [CDN](https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.min.css)
- **Body/Content:** System font stack (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif) — fastest load, feels native, matches rendered .cln output
- **UI/Labels:** Geist Sans 500
- **Data/Tables:** Geist Sans (tabular-nums) for numeric data
- **Code/Source Pane:** Geist Mono — designed to pair with Geist Sans, good ligatures, tabular numbers. [CDN](https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.min.css)
- **Loading:** CDN via jsDelivr (Geist Sans ~20KB, Geist Mono ~20KB). System fonts require no loading.
- **Scale:**
  - 12px — label, toolbar text, status bar
  - 13px — source pane code
  - 14px — caption, menu items, UI text
  - 16px — body content (1rem)
  - 20px — h3
  - 24px — h2
  - 32px — h1, display

## Color
- **Approach:** Restrained. One accent + neutrals. Color is rare and meaningful. Shared palette between editor chrome and rendered .cln output.
- **Core palette (light):**
  - `--cn-bg: #ffffff` — page background
  - `--cn-fg: #1a1a1a` — primary text
  - `--cn-accent: #2563eb` — interactive elements, links, focus rings
  - `--cn-accent-hover: #1d4ed8` — hover state for accent
  - `--cn-surface: #f9fafb` — toolbar, panels, elevated surfaces
  - `--cn-border: #e5e7eb` — borders, dividers
  - `--cn-muted: #6b7280` — secondary text, placeholders, line numbers
  - `--cn-code-bg: #f3f4f6` — code blocks, source pane background
- **Core palette (dark):**
  - `--cn-bg: #111827`
  - `--cn-fg: #f3f4f6`
  - `--cn-accent: #60a5fa`
  - `--cn-accent-hover: #3b82f6`
  - `--cn-surface: #1f2937`
  - `--cn-border: #374151`
  - `--cn-muted: #9ca3af`
  - `--cn-code-bg: #1f2937`
- **Semantic:**
  - `--cn-success: #22c55e` (callout-tip, save confirmation)
  - `--cn-warning: #f59e0b` (callout-warning, syntax warning badge)
  - `--cn-error: #ef4444` (callout-danger, parse error badge)
  - `--cn-info: #3b82f6` (callout-info, informational messages)
- **Dark mode strategy:** CSS `prefers-color-scheme` media query. Surface colors darken, text lightens, accent shifts to lighter shade (60a5fa). Saturation reduces naturally with the darker neutrals.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2px | 4px | 8px | 12px | 16px | 24px | 32px | 48px | 64px
- **Key measurements:**
  - Toolbar height: 48px
  - Status bar height: 24px
  - Pane padding: 24px (visual), 16px (source)
  - Toolbar button padding: 4px 12px
  - Input padding: 8px 12px
  - Callout padding: 12px 16px
  - Section gap: 16px (within), 32px (between)

## Layout
- **Approach:** Grid-disciplined. The split pane IS the layout.
- **Structure:** Toolbar (top, 48px) → Split pane (visual 60% | divider | source 40%) → Status bar (bottom, 24px)
- **Pane divider:** Draggable, 1px border color, 6px invisible hit area. Position saved to localStorage.
- **Responsive breakpoints:**
  - `>= 1024px` — Split pane (default)
  - `< 1024px` — Tab switching (Visual | Source tabs, one pane visible at a time)
  - `< 768px` — Toolbar icons only (no labels), cheat sheet as modal sheet
- **Max content width:** None for the editor. The content fills the visual pane. The rendered output preview uses `--cn-max-width: 48rem` from clearnotation.css.
- **Border radius:**
  - `--cn-radius-sm: 4px` — buttons, inputs, code spans, inline elements
  - `--cn-radius-md: 8px` — cards, menus, dropdowns, panels
  - `--cn-radius-lg: 12px` — editor container, modals, welcome card

## Motion
- **Approach:** Minimal-functional. Only transitions that aid comprehension.
- **Easing:** enter(ease-out), exit(ease-in), move(ease-in-out)
- **Duration:**
  - Micro: 50-100ms (hover states, button press)
  - Short: 150ms (menu open/close, panel toggle, tooltip)
  - Medium: 300ms (source pane diff-highlight fade, theme transition)
- **Specific animations:**
  - Slash menu: 150ms ease-out slide-down from cursor
  - Cheat sheet panel: 150ms ease-out slide-in from right
  - Source pane sync: changed lines highlight with 300ms fade (--cn-accent at 10% opacity)
  - Theme toggle: 200ms transition on background-color and color
  - No entrance animations. No scroll-driven animations. No parallax.

## Icon System
- **Library:** Lucide Icons (https://lucide.dev). MIT licensed, consistent stroke width, pairs well with Geist Sans.
- **Size:** 16px for toolbar icons, 20px for feature icons
- **Stroke width:** 1.5px (Lucide default)
- **Color:** `--cn-muted` default, `--cn-fg` on hover, `--cn-accent` for active state

## Component Patterns

### Buttons
- **Primary:** `--cn-accent` bg, white text, `--cn-radius-sm`. Hover: `--cn-accent-hover`.
- **Secondary:** `--cn-bg` bg, `--cn-fg` text, 1px `--cn-border`. Hover: border becomes `--cn-accent`.
- **Ghost:** transparent bg, `--cn-fg` text. Hover: `--cn-surface` bg. Used for toolbar buttons.
- **Font:** Geist Sans 500, 14px.
- **Padding:** 8px 16px (standard), 4px 12px (compact/toolbar).

### Inputs
- **Border:** 1px `--cn-border`, `--cn-radius-sm`.
- **Focus:** border becomes `--cn-accent`, 2px `--cn-accent` ring at 15% opacity.
- **Placeholder:** `--cn-muted`.
- **Font:** Geist Sans, 14px.

### Menus & Dropdowns
- **Background:** `--cn-bg`, 1px `--cn-border`, `--cn-radius-md`.
- **Shadow:** `0 4px 12px rgba(0,0,0,0.08)` (light), `0 4px 12px rgba(0,0,0,0.3)` (dark). Only elevated element with shadow.
- **Item hover:** `--cn-surface` bg.
- **Keyboard indicator:** current item has `--cn-accent` left border (2px).

### Callout Blocks (in editor)
- **Style:** matches rendered output. 4px left border, `--cn-code-bg` background, `--cn-radius-sm` on right corners.
- **Colors:** info (#3b82f6), warning (#f59e0b), danger (#ef4444), tip (#22c55e).
- **Title:** Geist Sans 600, 14px.

### Alerts / Toasts
- **Position:** bottom-right, stacked.
- **Style:** 3px left border (semantic color), `--cn-code-bg` bg, `--cn-radius-sm`.
- **Duration:** 4 seconds, dismissable.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-07 | Initial design system created | Created by /design-consultation based on product context (visual editor for PMs), competitive research (Linear, Notion, Mintlify), and existing clearnotation.css palette |
| 2026-04-07 | Geist Sans for UI chrome | Geometric precision distinguishes editor chrome from content. Pairs with Geist Mono for source pane. ~20KB CDN load. |
| 2026-04-07 | System fonts for content | Matches rendered .cln output (clearnotation.css uses system stack). Zero load time. Content feels native. |
| 2026-04-07 | Shared palette with clearnotation.css | Editor and rendered output use the same CSS variables. PM's document looks the same in both views. |
| 2026-04-07 | No shadows except elevated elements | Industrial aesthetic. Borders define regions. Shadows reserved for menus and modals only. |
| 2026-04-07 | Lucide Icons | MIT licensed, consistent 1.5px stroke, pairs with Geist Sans. 16px toolbar, 20px feature. |
