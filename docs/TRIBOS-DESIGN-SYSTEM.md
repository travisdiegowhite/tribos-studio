# TRIBOS Design System — Implementation Spec

**Document:** TB-001 · Visual Direction v1.0
**Purpose:** Complete design system specification for restyling the Tribos cycling app. This document contains everything needed to audit the current codebase and implement the new visual identity across all components.
**Brand concept:** "Department of Cycling Intelligence" — retro-futuristic government manual aesthetic meets cartographic survey style. Think NASA technical manuals crossed with vintage USGS topographic maps. Warm, authoritative, precise.

---

## Table of Contents

1. [Pre-Implementation: Codebase Audit](#1-pre-implementation-codebase-audit)
2. [Design Tokens — Light Theme](#2-design-tokens--light-theme)
3. [Design Tokens — Dark Theme](#3-design-tokens--dark-theme)
4. [Typography System](#4-typography-system)
5. [Spacing & Layout](#5-spacing--layout)
6. [Component Specifications](#6-component-specifications)
7. [Data Visualization](#7-data-visualization)
8. [Visual Texture & Atmosphere](#8-visual-texture--atmosphere)
9. [Dark Mode Implementation](#9-dark-mode-implementation)
10. [Iconography](#10-iconography)
11. [Mapbox Map Theming](#11-mapbox-map-theming)
12. [Responsive Design & Breakpoints](#12-responsive-design--breakpoints)
13. [Implementation Phases](#13-implementation-phases)
14. [Reference: Full CSS Variable Sheet](#14-reference-full-css-variable-sheet)

---

## 1. Pre-Implementation: Codebase Audit

Before making any changes, audit the current codebase and document findings. This is critical for planning the migration path.

### What to gather:

**Styling Architecture**
- What styling approach is used? (CSS modules, Tailwind, styled-components, global CSS, CSS-in-JS)
- Is there an existing theme file, CSS variables root, or Tailwind config with custom values?
- Where do colors, fonts, and spacing values currently live?
- How many unique color values are in use across the app?

**Component Inventory**
- List all reusable UI components (cards, buttons, inputs, nav, modals, tooltips, etc.)
- For each: does it use hardcoded styles or reference shared theme values?
- Which components are most frequently used / highest visual impact?

**Dark Mode Status**
- Is there any existing dark/light theme infrastructure? (next-themes, CSS custom properties, Tailwind dark: classes)
- Does the app currently respect system color scheme preference?

**Font Loading**
- How are fonts currently loaded? (next/font, Google Fonts link, local files)
- What fonts are currently in use and where?

**Layout Structure**
- What is the app shell structure? (sidebar, top nav, main content area)
- Are there wrapper/layout components that would need theme-level changes?
- What does the responsive breakpoint strategy look like?

**Third-Party UI**
- Are any component libraries in use? (shadcn/ui, Radix, MUI, etc.)
- Are there any charting/visualization libraries? (recharts, d3, chart.js)
- Map integration details (Mapbox GL JS config, style URL, custom layers)

### Deliver findings as a structured report before proceeding to implementation.

---

## 2. Design Tokens — Light Theme

The light theme is the primary theme. It should feel like a printed field guide — warm cream paper, dark ink, earthy muted accents.

### Color Palette

```css
:root[data-mantine-color-scheme="light"] {
  /* === Backgrounds === */
  --bg-base: #F5F0E8;          /* Cream — main page background */
  --bg-surface: #FAF7F2;       /* Warm white — cards, panels */
  --bg-elevated: #FFFFFF;       /* Pure white — modals, popovers, inputs */
  --bg-sunken: #E8DDD3;        /* Pale earth — secondary areas, map backgrounds */

  /* === Text === */
  --text-primary: #1A1A1A;      /* Ink — headings, primary content */
  --text-secondary: #3A3A3A;    /* Charcoal — body text */
  --text-tertiary: #6B6B6B;     /* Slate — labels, captions, metadata */
  --text-disabled: #A09888;     /* Muted — disabled states */

  /* === Borders & Lines === */
  --border-default: #D0C8BE;    /* Warm gray — card borders, dividers */
  --border-strong: #1A1A1A;     /* Ink — emphasis borders, selected states */
  --border-subtle: #E8DDD3;     /* Pale earth — subtle separators */

  /* === Accent Colors === */
  --accent-mauve: #C4A0B9;      /* Primary brand accent — VO2/Z5, illustration backgrounds */
  --accent-teal: #7BA9A0;       /* Secondary accent — endurance/Z2, data highlights */
  --accent-terracotta: #C4785C; /* Route lines, threshold/Z4, CTAs */
  --accent-gold: #D4A843;       /* Badges, favorites, achievements */
  --accent-sage: #A8BFA8;       /* Recovery/Z1, success states */
  --accent-sky: #B8CDD9;        /* Informational, cartographic backgrounds */

  /* === Training Zone Colors (7-zone model) === */
  --zone-1: #A8BFA8;            /* Recovery — sage */
  --zone-2: #7BA9A0;            /* Endurance — teal */
  --zone-3: #D4A843;            /* Tempo — gold */
  --zone-4: #C4785C;            /* Threshold — terracotta */
  --zone-5: #C4A0B9;            /* VO2max — mauve */
  --zone-6: #9B7DBF;            /* Anaerobic — purple */
  --zone-7: #C4708C;            /* Neuromuscular — rose */
  --zone-rest: #D0C8BE;         /* Rest/recovery blocks */

  /* === Semantic Colors === */
  /* IMPORTANT: These must be visually distinct from accent/zone colors.
     --warning is NOT --accent-gold; --error is NOT --accent-terracotta.
     Semantic colors are reserved for system feedback (toasts, form validation,
     banners). Accent/zone colors are for data and brand. */
  --success: #5A8A5A;           /* Darker green — distinct from sage/zone-1 */
  --warning: #C08800;           /* Deeper amber — distinct from gold accent */
  --error: #B5453A;             /* True red — distinct from terracotta accent */
  --info: #4A8FA0;              /* Deeper teal — distinct from teal accent */

  /* === Shadows === */
  --shadow-sm: 0 1px 2px rgba(26, 26, 26, 0.06);
  --shadow-md: 0 2px 8px rgba(26, 26, 26, 0.08);
  --shadow-lg: 0 4px 16px rgba(26, 26, 26, 0.1);
}
```

### Usage Guidelines — Light Theme

- **Page backgrounds** use `--bg-base` (cream). Never pure white for full page backgrounds.
- **Cards and panels** use `--bg-surface` with a `1px solid var(--border-default)` border.
- **Selected/active cards** upgrade border to `--border-strong` (ink).
- **Text hierarchy** is enforced through the three text tiers, not through size alone.
- **Accent colors are not backgrounds** — they are used for data, route lines, badges, and small UI highlights. The app should feel predominantly cream/white/ink with color used purposefully.

### Accessibility & Contrast Notes

All text must meet **WCAG 2.1 AA** (4.5:1 for body text, 3:1 for large text/UI elements):

| Pair | On Background | Ratio | Status |
|------|--------------|-------|--------|
| `--text-primary` (#1A1A1A) | `--bg-base` (#F5F0E8) | ~13:1 | Pass |
| `--text-secondary` (#3A3A3A) | `--bg-base` (#F5F0E8) | ~7.5:1 | Pass |
| `--text-tertiary` (#6B6B6B) | `--bg-base` (#F5F0E8) | ~3.8:1 | Pass for large text only |
| `--text-tertiary` (#6B6B6B) | `--bg-surface` (#FAF7F2) | ~3.5:1 | Caution — use at 11px+ only |
| `--accent-gold` (#D4A843) | `--bg-base` (#F5F0E8) | ~2.5:1 | Fail for text — pair with `--text-primary` label |
| `--accent-sage` (#A8BFA8) | `--bg-base` (#F5F0E8) | ~2.2:1 | Fail for text — data viz only |

**Rules:**
- Never use accent/zone colors as the sole text color for readable content. Always pair with a high-contrast label.
- Zone bar fills don't need text contrast (they are decorative), but zone *labels* next to bars must use `--text-tertiary` or darker.
- For small text (9px labels, 8px micro), ensure the background provides at least 4.5:1 contrast.
- `--text-disabled` is intentionally low-contrast — use only for truly disabled/inactive states.

---

## 3. Design Tokens — Dark Theme

The dark theme should feel like a night ride — familiar terrain made mysterious, data glowing like instrument panels. Critically, the blacks are **warm** (brown-tinted), not blue or neutral.

### Color Palette

```css
:root,
:root[data-mantine-color-scheme="dark"] {
  /* === Backgrounds — warm blacks, layered === */
  --bg-base: #111010;           /* Deep warm black — main page background */
  --bg-surface: #1A1917;        /* Surface — cards, panels */
  --bg-elevated: #232220;       /* Elevated — modals, popovers, dropdowns */
  --bg-sunken: #0D0C0B;         /* Deepest — inset areas, map backgrounds */

  /* === Text — warm off-white hierarchy === */
  --text-primary: #E8E2D8;      /* Warm off-white — headings */
  --text-secondary: #A09888;    /* Muted warm — body text */
  --text-tertiary: #6B6360;     /* Dim warm — labels, metadata */
  --text-disabled: #4A4542;     /* Very dim — disabled states */

  /* === Borders & Lines === */
  --border-default: #2E2C28;    /* Subtle warm — card borders */
  --border-strong: #E8E2D8;     /* Light — emphasis borders (inverted from light theme) */
  --border-subtle: #252320;     /* Very subtle — inner separators */

  /* === Accent Colors — slightly desaturated to glow without harshness === */
  --accent-mauve: #B08DA5;
  --accent-teal: #6E9B92;
  --accent-terracotta: #C4785C;  /* Stays vibrant — route lines are the hero */
  --accent-gold: #D4A843;        /* Stays vibrant — badges glow */
  --accent-sage: #8BA88B;
  --accent-sky: #5C7A8A;

  /* === Training Zone Colors — same hues, slightly muted (7-zone model) === */
  --zone-1: #8BA88B;
  --zone-2: #6E9B92;
  --zone-3: #D4A843;
  --zone-4: #C4785C;
  --zone-5: #B08DA5;
  --zone-6: #8A6EAD;            /* Anaerobic — purple (muted) */
  --zone-7: #B0607A;            /* Neuromuscular — rose (muted) */
  --zone-rest: #2E2C28;

  /* === Semantic — distinct from accent/zone colors === */
  --success: #6EA86E;
  --warning: #D4A030;
  --error: #D05045;
  --info: #5A9AB0;

  /* === Shadows — more diffuse, lighter === */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 10px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.5);
}
```

### Usage Guidelines — Dark Theme

- **Three surface layers** (base → surface → elevated) create depth through luminance. Rely less on borders, more on background differentiation.
- **Accent colors glow** — terracotta route lines and gold badges become the visual focal points on dark backgrounds.
- **Zone colors** are slightly desaturated so they don't vibrate against the dark ground.
- **Avoid pure black** (#000000) anywhere. The warmest dark should be `--bg-sunken` (#0D0C0B).
- **Avoid pure white** (#FFFFFF) for text. Use `--text-primary` (#E8E2D8) for the brightest text.

---

## 4. Typography System

Three typefaces, each with a specific role. This is non-negotiable for the brand feel.

### Font Stack

```css
:root {
  /* Display — headlines, route names, workout titles */
  --font-display: 'Anybody', 'Arial Black', sans-serif;

  /* Body — descriptions, paragraphs, longer text */
  --font-body: 'Familjen Grotesk', 'Helvetica Neue', sans-serif;

  /* Data — metrics, labels, metadata, monospaced data */
  --font-data: 'DM Mono', 'Courier New', monospace;
}
```

### Font Loading

This project uses **Vite + React** (not Next.js). Load fonts via Google Fonts `<link>` tags in `index.html`:

```html
<!-- index.html <head> — replace the existing DM Sans / JetBrains Mono link -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@75..100,400..800&family=Familjen+Grotesk:wght@400;600;700&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
```

Then reference the fonts in CSS variables (see Section 12) and in the Mantine theme config (`src/theme.js`):

```javascript
// src/theme.js — update fontFamily fields
fontFamily: "'Familjen Grotesk', 'Helvetica Neue', sans-serif",
fontFamilyMonospace: "'DM Mono', 'Courier New', monospace",
headings: {
  fontFamily: "'Anybody', 'Arial Black', sans-serif",
  // ...
},
```

### Anybody Variable Font — Width Axis

Anybody is a variable font with a **width axis** (`wdth: 75–100`). Use the condensed end for compact data displays and the normal width for headlines:

| Context | `font-stretch` / `wdth` | Example |
|---------|------------------------|---------|
| Hero headlines | `100` (normal) | Page titles, splash text |
| Card titles (h2, h3) | `90` | Route names, workout titles |
| Stat values (`--text-data-lg`) | `80` | "64.2 KM", "1,247 M" |
| Compact tables | `75` (condensed) | Dense data grids |

```css
/* Example usage */
.stat-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-stretch: 80%;  /* OR font-variation-settings: 'wdth' 80; */
}
```

### Type Scale

| Token | Size | Weight | Font | Use |
|-------|------|--------|------|-----|
| `--text-hero` | 48–96px (clamp) | 800 | Display | Page headers, splash |
| `--text-h1` | 28px | 800 | Display | Section headers |
| `--text-h2` | 22px | 800 | Display | Card titles, route names |
| `--text-h3` | 18px | 800 | Display | Workout titles, sub-headers |
| `--text-body` | 15px | 400 | Body | Descriptions, paragraphs |
| `--text-body-sm` | 13px | 400 | Body | Secondary descriptions |
| `--text-data-lg` | 20px | 600 | Display* | Stat values (distance, elevation) |
| `--text-data` | 11px | 400 | Data | Metric values, timestamps |
| `--text-label` | 9px | 400 | Data | All-caps labels, metadata |
| `--text-micro` | 8px | 400 | Data | Tiny annotations, chart labels |

*Note: Stat values use the Display font at data sizes for visual impact.

### Typography Rules

- **Display font is ALWAYS uppercase** with `text-transform: uppercase` and negative letter-spacing (`-0.5px` to `-2px` depending on size).
- **Data font is ALWAYS uppercase** with `text-transform: uppercase` and positive letter-spacing (`1px` to `3px`).
- **Body font is normal case** — never uppercase the body font.
- **Never use the display font for body text** or vice versa.
- **Stat values** (numbers like "64.2" or "1,247") use the Display font at `--text-data-lg` size for visual weight.
- **Labels below stat values** use `--text-label` (Data font, 9px, uppercase, letter-spacing 2px).
- **Dot separators** between inline data: use ` · ` (middle dot with spaces) in Data font.

---

## 5. Spacing & Layout

### Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;
  --space-9: 48px;
  --space-10: 60px;
}
```

### Border Radius

```css
:root {
  --radius-none: 0px;       /* Cards, buttons — sharp corners are part of the brand */
  --radius-sm: 2px;         /* Color swatches, tiny elements */
  --radius-full: 9999px;    /* Badges, icon circles, pills */
}
```

**Important:** The design language uses **sharp corners** (0px radius) for almost everything — cards, buttons, inputs, modals. This is intentional and critical to the "government manual" feel. The only round elements are circular badges and icon containers. Do not soften corners.

### Border Style

The standard card border:
```css
.card {
  border: 1px solid var(--border-default);
}

/* Selected/active state */
.card--active {
  border: 1.5px solid var(--border-strong);
}

/* Emphasis (section headers, stamps) */
.card--emphasis {
  border: 2px solid var(--border-strong);
}
```

---

## 6. Component Specifications

### 6.1 Route Card

The most important component in the app. Structure:

```
┌─────────────────────────────────────────┐
│  ROUTE NAME (display, h2)    CLASS BADGE │  ← header row
├─────────────────────────────────────────┤
│                                         │
│         MAP / ROUTE PREVIEW             │  ← map area with topo texture bg
│                                         │
├──────────┬──────────┬─────────┬─────────┤
│  64.2    │  1,247   │  2:48   │  142    │  ← stats grid
│   KM     │ ELEV (M) │EST TIME │  TSS    │
├──────────┴──────────┴─────────┴─────────┤
│  GENERATED · 13 FEB 2026 · BOULDER CO  ★│  ← footer
└─────────────────────────────────────────┘
```

**Header:**
- Route name: `--text-h2`, Display font, uppercase
- Classification badge: `--text-label`, Data font, bordered pill (`border: 1px solid var(--border-strong)`, `padding: 4px 10px`)
- In dark mode, classification badge text color uses `--accent-terracotta`

**Map area:**
- Background: `--bg-sunken`
- Route line: `stroke: var(--accent-terracotta)`, `stroke-width: 2.5`
- Start marker: circle with inner dot
- End marker: circle with rotated diamond overlay
- Text labels (START, PEAK): `--text-micro`, Data font, `color: var(--text-tertiary)`
- Subtle topo contour ellipses in background at very low opacity (0.03–0.05)

**Stats grid:**
- 4-column grid, divided by `1px solid var(--border-subtle)` vertical borders
- Value: `--text-data-lg`, Display font, centered
- Label: `--text-label`, Data font, centered, `color: var(--text-tertiary)`
- Padding: `14px 16px`

**Footer:**
- Left: timestamp string in `--text-label`, Data font, `color: var(--text-tertiary)`
- Format: `GENERATED · DD MMM YYYY · LOCATION`
- Right: circular badge (28px) with star icon, border `1px solid var(--border-default)`
- In dark mode, star icon color: `--accent-gold`

### 6.2 Workout Card

```
┌─────────────────────────────────────────┐
│  INTERVAL              THU · FEB 13     │  ← type + date
├─────────────────────────────────────────┤
│  THRESHOLD BUILDERS                     │  ← title
│  4×8min at 95-100% FTP with 4min...    │  ← description
│                                         │
│  ██ ██ ████ ░░ ████ ░░ ████ ░░ ████ ██│  ← zone blocks visualization
├─────────────────────────────────────────┤
│  TSS 96    IF 0.91    DUR 1:15          │  ← footer stats
└─────────────────────────────────────────┘
```

**Zone blocks visualization:**
- Horizontal bar chart showing workout structure
- Each block is a `flex: 1` div with height representing intensity
- Colors map to zone variables (`--zone-1` through `--zone-5`)
- Rest blocks use `--zone-rest`
- Gap between blocks: `4px`
- Container height: `80px`, blocks align to bottom (`align-items: flex-end`)

**Zone block heights by type:**
- Z1 (recovery): 15–20%
- Z2 (endurance): 25–30%
- Z3 (tempo): 50%
- Z4 (threshold): 75–85%
- Z5 (VO2max): 90–95%
- Z6 (anaerobic): 100%
- Z7 (neuromuscular): 100% (short/narrow blocks)
- Rest: 10–15%

### 6.3 Training Zone Bars

Horizontal bar chart for zone distribution:

```
   Z1 RECOV  ████████████░░░░░░░░░░░░░░  35%
   Z2 ENDUR  █████████████████░░░░░░░░░  55%
   Z3 TEMPO  ███████████████████████░░░  72%
   Z4 THRES  █████████████████████████░  88%
   Z5 VO2    ██████████████████████████  95%
   Z6 ANAER  ██████████████████████████  98%
   Z7 NEURO  ██████████████████████████  100%
```

- Label: `--text-label`, Data font, 70px width, right-aligned, `color: var(--text-tertiary)`
- Track: full width, `height: 18px`, `background: rgba(255,255,255,0.06)` (dark) or `rgba(0,0,0,0.04)` (light)
- Fill: corresponding `--zone-N` color
- Value: `--text-data`, Display font 11px weight 600, colored to match zone
- Gap between rows: `10px`

### 6.4 Elevation Profile

```
         ·2,847M
        /\
       /  \
      /    \      /\
     /      \    /  \
    /        \  /    \
   /          \/      \___
  ─────────────────────────
  0 KM      32.1 KM    64.2 KM
```

- Grid lines: horizontal, `stroke: rgba(0,0,0,0.06)` (light) or `rgba(255,255,255,0.04)` (dark)
- Fill area: `--bg-sunken` (light) or `rgba(196,120,92,0.15)` (dark — subtle terracotta tint)
- Line: `stroke: var(--accent-terracotta)`, `stroke-width: 2`
- Peak marker: callout line upward, circle marker, label in `--text-micro`
- X-axis labels: `--text-micro`, Data font, `color: var(--text-tertiary)`

### 6.5 Buttons

**Primary button:**
```css
.btn-primary {
  background: var(--text-primary);     /* Ink on light, warm white on dark */
  color: var(--bg-base);               /* Cream on light, deep black on dark */
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 10px 20px;
  border: none;
  border-radius: 0;                    /* Sharp corners */
  cursor: pointer;
}
```

**Secondary button:**
```css
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 10px 20px;
  border: 1.5px solid var(--border-strong);
  border-radius: 0;
  cursor: pointer;
}
```

**Classification badge (inline label):**
```css
.badge {
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid var(--border-strong);
  padding: 4px 10px;
  display: inline-block;
}
```

### 6.6 Inputs

```css
.input {
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 15px;
  padding: 10px 14px;
  border: 1px solid var(--border-default);
  border-radius: 0;                    /* Sharp corners */
}

.input:focus {
  border-color: var(--border-strong);
  outline: none;
}

.input-label {
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
```

### 6.7 Navigation / Sidebar

- Background: `--bg-surface`
- Active nav item: left border accent `3px solid var(--accent-terracotta)` or background `--bg-sunken`
- Nav labels: `--text-label`, Data font, uppercase
- Section dividers: `1px solid var(--border-subtle)`
- App title/logo area: Display font, uppercase, with "Department of" subtitle in Data font

### 6.8 Brand Stamp / Logo Mark

Circular stamp design used in branding, loading states, empty states:

```
    ┌──────────────────┐
    │  ╭──────────────╮ │
    │  │ Department of │ │
    │  │    TRIBOS     │ │
    │  │   Est. 2025   │ │
    │  ╰──────────────╯ │
    └──────────────────┘
```

- Outer circle: `border: 2px solid var(--border-strong)`, 200px diameter
- Inner circle: `border: 1px solid var(--border-strong)`, inset 6px
- "Department of": `--text-label`, Data font
- "TRIBOS": Display font, 36px, weight 800
- "Est. 2025": `--text-label`, Data font
- Below stamp: "The Beaten Path / Cycling Intelligence Bureau" in `--text-label`

### 6.9 Mantine Component Override Mapping

This project uses **Mantine v7** via `createTheme()` in `src/theme.js`. Each component spec above maps to Mantine theme overrides. Here is how the design tokens connect to the existing theme infrastructure:

| Design Spec | Mantine Component | Key Overrides |
|-------------|------------------|---------------|
| Route/Workout Card (6.1, 6.2) | `Card` | `defaultProps: { radius: 0, padding: 'lg' }`, styles: bg `--bg-surface`, border `--border-default` |
| Primary Button (6.5) | `Button` | `defaultProps: { radius: 0 }`, styles: font-family `--font-data`, uppercase, letter-spacing |
| Secondary Button (6.5) | `Button` variant="outline" | border `--border-strong`, transparent bg |
| Badge (6.5) | `Badge` | font-family `--font-data`, `radius: 0`, border style |
| Inputs (6.6) | `TextInput`, `Select`, `Textarea` | `defaultProps: { radius: 0 }`, bg `--bg-elevated`, border `--border-default` |
| Navigation (6.7) | `AppShell`, `NavLink` | navbar bg `--bg-surface`, active left-border accent |
| Modal / Drawer | `Modal`, `Drawer` | bg `--bg-elevated`, border `--border-default`, `radius: 0` |
| Tabs | `Tabs` | list bg `--bg-sunken`, active tab bg `--bg-surface` |

**Migration note:** The current theme uses `radius: 'xl'` (16px) on Paper/Card. The new design system uses `radius: 0` everywhere. Update `defaultRadius: 0` in `createTheme()` and override individual component `defaultProps`.

```javascript
// Example: updated createTheme() skeleton
export const theme = createTheme({
  primaryColor: 'green',  // will need new Mantine color tuple for terracotta
  defaultRadius: 0,
  fontFamily: "'Familjen Grotesk', 'Helvetica Neue', sans-serif",
  fontFamilyMonospace: "'DM Mono', 'Courier New', monospace",
  headings: {
    fontFamily: "'Anybody', 'Arial Black', sans-serif",
    fontWeight: '800',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.2' },
      h2: { fontSize: '22px', lineHeight: '1.3' },
      h3: { fontSize: '18px', lineHeight: '1.4' },
    },
  },
  components: {
    Card: { defaultProps: { radius: 0, padding: 'lg' } },
    Button: { defaultProps: { radius: 0 } },
    TextInput: { defaultProps: { radius: 0 } },
    Paper: { defaultProps: { radius: 0 } },
    Modal: { defaultProps: { radius: 0, centered: true } },
    // ... full overrides in implementation
  },
});
```

---

## 7. Data Visualization

### Chart Color Mapping

For all charts (performance over time, zone distribution, weekly volume, etc.):

| Data Type | Color Token | Hex (Light) |
|-----------|-------------|-------------|
| Recovery / Z1 | `--zone-1` | #A8BFA8 |
| Endurance / Z2 | `--zone-2` | #7BA9A0 |
| Tempo / Z3 | `--zone-3` | #D4A843 |
| Threshold / Z4 | `--zone-4` | #C4785C |
| VO2max / Z5 | `--zone-5` | #C4A0B9 |
| Anaerobic / Z6 | `--zone-6` | #9B7DBF |
| Neuromuscular / Z7 | `--zone-7` | #C4708C |
| Route line | `--accent-terracotta` | #C4785C |
| Grid lines | `rgba(0,0,0,0.06)` light / `rgba(255,255,255,0.04)` dark |
| Axis labels | `--text-tertiary` | #6B6B6B |
| Axis ticks | `--border-default` | #D0C8BE |

### Chart Typography

- Axis labels: `--text-micro` (8px), Data font, uppercase
- Data point labels: `--text-label` (9px), Data font
- Chart titles: `--text-h3` (18px), Display font, uppercase
- Tooltip text: `--text-body-sm` (13px), Body font
- Tooltip values: `--text-data` (11px), Data font

### Elevation Profile Specific

- Fill gradient: subtle, using `--bg-sunken` on light, `rgba(196,120,92,0.15)` on dark
- Peak markers: callout line (1px, `--text-tertiary`) with circle endpoint and label
- This "technical annotation" style (callout line → dot → label) should be reused wherever data points need labeling

---

## 8. Visual Texture & Atmosphere

These are the details that separate this from a generic theme swap.

### Topographic Contour Lines

SVG pattern used as subtle background texture in map areas, empty states, and hero sections:

```svg
<svg viewBox="0 0 300 300" fill="none">
  <ellipse cx="150" cy="150" rx="140" ry="120"
    stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
  <ellipse cx="150" cy="150" rx="120" ry="100"
    stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
  <ellipse cx="150" cy="150" rx="100" ry="80"
    stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
  <ellipse cx="150" cy="150" rx="80" ry="60"
    stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
  <ellipse cx="150" cy="150" rx="60" ry="42"
    stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
</svg>
```

- Light theme: `stroke: rgba(0,0,0,0.05)`
- Dark theme: `stroke: rgba(255,255,255,0.04)` — ghostly, atmospheric
- Use as: CSS background image, inline SVG behind map components, empty state decoration
- Can be randomly offset/rotated per instance for organic variety

### Annotation / Callout Style

Technical diagram callout lines used for labeling data points:

```
  ·── LABEL TEXT
  │   Secondary detail
  ●
  (data point)
```

- Leader line: `1px solid var(--text-tertiary)` (or `0.75px` for less emphasis)
- Endpoint dot: `6px` circle, `border: 1.5px solid var(--border-strong)`, or `fill: var(--text-tertiary)`
- Primary label: `--text-micro`, Data font, uppercase, `letter-spacing: 1.5px`
- Secondary label: 1px smaller, `color: var(--text-tertiary)`

### Star / Cross Decorations

Small cross-shaped decorative elements (like the stars in the QDOT book) used sparingly:

```svg
<line x1="0" y1="4" x2="8" y2="4" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
<line x1="4" y1="0" x2="4" y2="8" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
```

- Use very sparingly in illustration areas, map backgrounds, empty states
- Never in data-dense areas — decoration only in "atmospheric" zones

### Double-Line Header Rule

The header and footer separators use a double-line pattern:

```css
.section-divider {
  border-bottom: 2px solid var(--border-strong);
  position: relative;
}
.section-divider::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-strong);
}
```

Use this for major section divisions (page header, page footer, section breaks).

---

## 9. Dark Mode Implementation

### Strategy

This project uses **Mantine v7** with its built-in color scheme system. The attribute is `data-mantine-color-scheme` (not `data-theme`). All CSS custom properties in this spec should use that selector.

**Current implementation** (see `src/App.jsx`):
```jsx
// Already in place — no next-themes needed
<ColorSchemeScript defaultColorScheme="dark" />
<MantineProvider theme={theme} defaultColorScheme="dark">
```

### CSS Variable Selectors

Map the design tokens to Mantine's attribute:

```css
/* Light theme */
:root[data-mantine-color-scheme='light'] {
  --bg-base: #F5F0E8;
  /* ... */
}

/* Dark theme (default) */
:root,
:root[data-mantine-color-scheme='dark'] {
  --bg-base: #111010;
  /* ... */
}
```

### Toggle Implementation

Use Mantine's built-in hook — no custom localStorage logic needed:

```jsx
import { useMantineColorScheme } from '@mantine/core';

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  return (
    <ActionIcon onClick={toggleColorScheme}>
      {colorScheme === 'dark' ? <Sun /> : <Moon />}
    </ActionIcon>
  );
}
```

### Flash Prevention

Mantine's `<ColorSchemeScript>` (already in `App.jsx`) injects a blocking script that reads localStorage before first paint. No additional script needed.

### What Changes Between Themes

| Element | Light | Dark |
|---------|-------|------|
| Page background | Cream #F5F0E8 | Warm black #111010 |
| Card background | Warm white #FAF7F2 | Dark surface #1A1917 |
| Card border | 1px warm gray | 1px barely-visible |
| Text primary | Ink #1A1A1A | Warm off-white #E8E2D8 |
| Route line | Terracotta (same) | Terracotta (same, glows) |
| Zone colors | Full saturation | Slightly desaturated |
| Topo texture | Black at 5% opacity | White at 4% opacity |
| Elevation fill | Pale earth solid | Terracotta at 15% opacity |
| Shadows | Subtle warm | Deeper, more diffuse |

### What Stays the Same

- All font choices and sizes
- Layout and spacing
- Component structure and hierarchy
- Icon line weights and sizes
- Border radius (0px everywhere)
- The terracotta and gold accent colors (these are the brand anchors)

---

## 10. Iconography

Line-style icons inside circular containers. Consistent stroke width.

### Icon Container

```css
.icon-container {
  width: 48px;
  height: 48px;
  border: 1.5px solid var(--border-strong);  /* 1px in dark mode */
  border-radius: 50%;                         /* Only round element in the system */
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-container svg {
  width: 22px;
  height: 22px;
  stroke: var(--text-primary);  /* var(--text-secondary) in dark mode */
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

### Icon Set (Core)

Use Lucide icons or custom SVGs matching this style. Required icons:

| Name | Use | SVG Concept |
|------|-----|-------------|
| Route | Route planning section | Circle with crosshair |
| Elevation | Climb metrics | Mountain line graph |
| Duration | Time metrics | Clock face |
| Power | Wattage data | Lightning bolt |
| Cadence | RPM data | Circular arrows |
| Fitness | CTL/fitness tracking | Bar chart ascending |
| Alert | Warnings, notifications | Circle with exclamation |
| Stack | Layers, training blocks | Stacked diamonds |
| Star | Favorites, ratings | 5-point star |
| Settings | Configuration | Gear |

### Small Icon Usage (No Container)

For inline icons (in buttons, next to text), use the icon at `16px` without the circular container.

---

## 11. Mapbox Map Theming

The app uses Mapbox GL JS v3. Map styling must align with the design system.

### Map Style Strategy

Use a custom Mapbox Studio style or runtime style overrides to match the warm palette:

**Light theme map:**
- Land: `#F0E8DC` (warm cream, close to `--bg-base`)
- Water: `#B8CDD9` (`--accent-sky`)
- Roads: `#D0C8BE` (`--border-default`)
- Road labels: `#6B6B6B` (`--text-tertiary`), font: DM Mono
- Parks/green: `#D5DDCF` (desaturated sage)
- Buildings: `#E8DDD3` (`--bg-sunken`)

**Dark theme map:**
- Land: `#1A1917` (`--bg-surface`)
- Water: `#0D0C0B` (`--bg-sunken`)
- Roads: `#2E2C28` (`--border-default`)
- Road labels: `#6B6360` (`--text-tertiary`), font: DM Mono
- Parks/green: `#252320` (barely visible)
- Buildings: `#232220` (`--bg-elevated`)

### Route Line Styling

```javascript
// Route line layer
map.addLayer({
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#C4785C',  // --accent-terracotta
    'line-width': 3,
    'line-opacity': 0.9,
  },
});
```

### Mapbox Control Overrides

Already partially implemented in `global.css`. Ensure controls use design tokens:

```css
.mapboxgl-ctrl-group {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 0;              /* Sharp corners to match system */
  box-shadow: var(--shadow-sm);
}

.mapboxgl-ctrl-group button {
  border-bottom: 1px solid var(--border-subtle);
}
```

---

## 12. Responsive Design & Breakpoints

### Breakpoint Scale

Matches the existing `sharedTokens.breakpoints` in `src/theme.js`:

| Token | Value | Target |
|-------|-------|--------|
| `xs` | 480px | Small phones |
| `sm` | 768px | Tablets / large phones (primary mobile breakpoint) |
| `md` | 1024px | Small laptops / tablets landscape |
| `lg` | 1200px | Desktops |
| `xl` | 1400px | Large desktops |

### Mobile Behavior

Already implemented in `global.css`. Key rules to preserve:

- **Touch targets:** minimum 44px height on buttons and interactive elements (iOS standard)
- **Input zoom prevention:** `font-size: 16px` on mobile inputs (prevents iOS Safari zoom)
- **Tabs:** horizontal scroll with `flex-wrap: nowrap`, hide scrollbar
- **Modals/Drawers:** full-screen on mobile (`max-height: 100dvh`)
- **Cards:** subtle press feedback (`transform: scale(0.995)` on `:active`)

### Stat Grid Responsive Behavior

The 4-column stat grid in Route Cards should collapse:

```css
/* Desktop: 4 columns */
.stat-grid { grid-template-columns: repeat(4, 1fr); }

/* Mobile (<768px): 2×2 grid */
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
}
```

### Typography Scaling

Hero text should use `clamp()` for fluid sizing:

```css
.text-hero {
  font-size: clamp(36px, 8vw, 96px);
}
```

Other type sizes remain fixed — the type scale is compact enough that fluid sizing isn't needed below hero level.

---

## 13. Implementation Phases

### Phase 1: Foundation (Do First)
- [ ] Set up CSS custom properties for both themes (copy Section 14 below)
- [ ] Replace Google Fonts link in `index.html` (Anybody, Familjen Grotesk, DM Mono)
- [ ] Update `src/theme.js` Mantine `createTheme()` — fonts, `defaultRadius: 0`, color tuples
- [ ] Update `src/styles/global.css` — swap `--tribos-*` vars to new `--bg-*`, `--text-*`, etc.
- [ ] Set border-radius to 0 globally for cards, buttons, inputs

### Phase 2: Core Components
- [ ] Restyle buttons (primary, secondary, badge)
- [ ] Restyle inputs and form elements
- [ ] Restyle navigation/sidebar
- [ ] Restyle cards (generic card container)
- [ ] Add double-line section dividers

### Phase 3: Feature Components
- [ ] Route Card component (full spec in 6.1)
- [ ] Workout Card component (full spec in 6.2)
- [ ] Training Zone Bars (full spec in 6.3)
- [ ] Elevation Profile (full spec in 6.4)
- [ ] Brand stamp component

### Phase 4: Data Visualization & Maps
- [ ] Update Recharts theme config to use new design tokens and zone colors (Z1–Z7)
- [ ] Create or update Mapbox Studio style to match warm palette (see Section 11)
- [ ] Update Mapbox control CSS overrides in `global.css`
- [ ] Apply zone colors consistently across all chart types
- [ ] Add annotation/callout style to chart tooltips and labels

### Phase 5: Polish
- [ ] Add topographic contour textures to appropriate backgrounds
- [ ] Add star/cross decorative elements to empty states
- [ ] Verify dark mode toggle works (already uses Mantine `useMantineColorScheme`)
- [ ] Transition animations for theme switching
- [ ] Loading states using brand stamp
- [ ] Accessibility audit — verify contrast ratios (see Section 2 notes)
- [ ] Responsive testing at all breakpoints (see Section 12)
- [ ] Review all pages for consistency

---

## 14. Reference: Full CSS Variable Sheet

Copy this entire block as the foundation. All components should reference these variables exclusively — no hardcoded colors, fonts, or spacing values.

```css
:root[data-mantine-color-scheme="light"] {
  /* Fonts */
  --font-display: 'Anybody', 'Arial Black', sans-serif;
  --font-body: 'Familjen Grotesk', 'Helvetica Neue', sans-serif;
  --font-data: 'DM Mono', 'Courier New', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;
  --space-9: 48px;
  --space-10: 60px;

  /* Radius */
  --radius-none: 0px;
  --radius-sm: 2px;
  --radius-full: 9999px;

  /* Light Theme Colors */
  --bg-base: #F5F0E8;
  --bg-surface: #FAF7F2;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #E8DDD3;

  --text-primary: #1A1A1A;
  --text-secondary: #3A3A3A;
  --text-tertiary: #6B6B6B;
  --text-disabled: #A09888;

  --border-default: #D0C8BE;
  --border-strong: #1A1A1A;
  --border-subtle: #E8DDD3;

  --accent-mauve: #C4A0B9;
  --accent-teal: #7BA9A0;
  --accent-terracotta: #C4785C;
  --accent-gold: #D4A843;
  --accent-sage: #A8BFA8;
  --accent-sky: #B8CDD9;

  --zone-1: #A8BFA8;
  --zone-2: #7BA9A0;
  --zone-3: #D4A843;
  --zone-4: #C4785C;
  --zone-5: #C4A0B9;
  --zone-6: #9B7DBF;
  --zone-7: #C4708C;
  --zone-rest: #D0C8BE;

  --success: #5A8A5A;
  --warning: #C08800;
  --error: #B5453A;
  --info: #4A8FA0;

  --shadow-sm: 0 1px 2px rgba(26, 26, 26, 0.06);
  --shadow-md: 0 2px 8px rgba(26, 26, 26, 0.08);
  --shadow-lg: 0 4px 16px rgba(26, 26, 26, 0.1);
}

:root[data-mantine-color-scheme="dark"] {
  --bg-base: #111010;
  --bg-surface: #1A1917;
  --bg-elevated: #232220;
  --bg-sunken: #0D0C0B;

  --text-primary: #E8E2D8;
  --text-secondary: #A09888;
  --text-tertiary: #6B6360;
  --text-disabled: #4A4542;

  --border-default: #2E2C28;
  --border-strong: #E8E2D8;
  --border-subtle: #252320;

  --accent-mauve: #B08DA5;
  --accent-teal: #6E9B92;
  --accent-terracotta: #C4785C;
  --accent-gold: #D4A843;
  --accent-sage: #8BA88B;
  --accent-sky: #5C7A8A;

  --zone-1: #8BA88B;
  --zone-2: #6E9B92;
  --zone-3: #D4A843;
  --zone-4: #C4785C;
  --zone-5: #B08DA5;
  --zone-6: #8A6EAD;
  --zone-7: #B0607A;
  --zone-rest: #2E2C28;

  --success: #6EA86E;
  --warning: #D4A030;
  --error: #D05045;
  --info: #5A9AB0;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 10px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.5);
}
```

---

## Appendix: Design Principles

These should guide every implementation decision:

1. **Authoritative, Not Corporate** — Like a well-trusted field guide. Confidence through craft, not through flash.
2. **Data as Cartography** — Every metric presented like a surveyor's notation: precise, legible, beautiful.
3. **Warm Technical** — Earthy tones soften the precision. The app should feel like leather and linen, not steel and glass.
4. **Earned Simplicity** — Complex intelligence, simple presentation. The AI works hard so the interface stays clean.

For the dark theme specifically:
5. **Night Ride Energy** — Familiar terrain made mysterious, data glowing like instrument panels at dusk.
6. **Three Surface Layers** — Depth through luminance shifts, not heavy borders.
7. **Luminous Data Points** — Accent colors become beacons on the dark ground.

---

*End of specification. Begin with Phase 1 after completing the codebase audit.*
