# Tribos Branding Overhaul — Implementation Plan

## Summary

Replace the current electric-green / blue-black / rounded depth system with the new warm, cartographic visual identity from the mood boards. Switch default theme from dark to light. All changes preserve existing component structure and Mantine v8 integration.

## Decisions

- **Primary CTA color**: Terracotta (#C4785C)
- **Default theme**: Light (was Dark)
- **Fonts**: Anybody (display/headings), Familjen Grotesk (body), DM Mono (data/labels) — replacing DM Sans + JetBrains Mono
- **Border radius**: 0px everywhere (sharp corners, cartographic feel) — replacing 6-16px rounded
- **Semantic colors**: Sage=success, Gold=warning, Terracotta=error, Teal=info
- **Zone colors (7)**: Sage, Teal, Gold, Terracotta, Mauve, Dusty Rose, Sky
- **Sky accent**: Kept as secondary accent color

## Token Reference

### Light Theme (Default)
| Token | Value | Purpose |
|-------|-------|---------|
| bgPrimary (cream) | #F5F0E8 | Page background |
| bgSecondary (warm-white) | #FAF7F2 | Cards/panels |
| bgTertiary (pale-earth) | #E8DDD3 | Recessed areas |
| bgElevated (white) | #FFFFFF | Modals/dropdowns |
| ink | #2C2826 | Primary text |
| textSecondary | #6B6460 | Secondary text |
| textMuted | #9E9590 | Muted/tertiary text |
| border | #D4CCC0 | Default borders |
| borderLight | #E0D8CE | Subtle borders |
| mauve | #C4A0B9 | Accent |
| teal | #7BA9A0 | Accent / info semantic |
| sage | #A8BFA8 | Accent / success semantic |
| terracotta | #C4785C | Primary CTA / error semantic |
| gold | #D4A843 | Accent / warning semantic |
| dustyRose | #9E7E90 | Accent (Z6) |
| skyPale | #B8CDD9 | Secondary accent (Z7) |

### Dark Theme
| Token | Value | Purpose |
|-------|-------|---------|
| bgPrimary (deep) | #111010 | Page background |
| bgSecondary (surface) | #1A1917 | Cards/panels |
| bgTertiary (card) | #1E1D1B | Card bg |
| bgElevated | #232220 | Modals/dropdowns |
| textPrimary | #E8E2D8 | Primary text (warm cream) |
| textSecondary | #A09888 | Secondary text |
| textMuted | #6B6360 | Muted text |
| textDim | #4A4542 | Decorative text |
| border | #3A3835 | Default borders |
| borderLight | #2E2C28 | Subtle borders (line) |
| mauve | #B08DA5 | Accent (slightly desaturated) |
| mauveDim | #8A6E80 | Dim accent (backgrounds) |
| teal | #6E9B92 | Accent (desaturated) |
| tealDim | #4A7A70 | Dim accent |
| sage | #8BA88B | Accent (desaturated) |
| terracotta | #C4785C | Same as light |
| terraDim | #A0614A | Dim accent |
| gold | #D4A843 | Same as light |
| goldDim | #B08E3A | Dim accent |
| dustyRose | #9E7E90 | Same |
| skyMuted | #5C7A8A | Desaturated sky |

### Zone Colors (both themes)
| Zone | Name | Light | Dark |
|------|------|-------|------|
| Z1 | Recovery | #A8BFA8 (sage) | #8BA88B |
| Z2 | Endurance | #7BA9A0 (teal) | #6E9B92 |
| Z3 | Tempo | #D4A843 (gold) | #D4A843 |
| Z3.5 | Sweet Spot | #C9A04E | #C9A04E |
| Z4 | Threshold | #C4785C (terracotta) | #C4785C |
| Z5 | VO2max | #C4A0B9 (mauve) | #B08DA5 |
| Z6 | Anaerobic | #9E7E90 (dusty rose) | #9E7E90 |
| Z7 | Neuromuscular | #B8CDD9 (sky) | #5C7A8A |

---

## Phase 1: Foundation — Theme Tokens & Fonts

### 1.1 Replace font imports
**Files:** `index.html` (line 29)
- Remove DM Sans + JetBrains Mono Google Fonts link
- Add Anybody + Familjen Grotesk + DM Mono link
- Update critical CSS inline font references (lines 72, 204)

### 1.2 Rewrite `src/theme.js` — Token definitions
**File:** `src/theme.js` (579 lines)
- Replace `darkTokens` object (lines 60-109) with new dark palette
- Replace `lightTokens` object (lines 112-163) with new light palette (cream/ink)
- Replace `depth` object (lines 10-57) — remove gradient surfaces, edge lighting, inner glow. New depth system uses:
  - Light: flat surfaces + 1.5px ink borders + minimal box-shadow
  - Dark: flat warm-black surfaces + 1px subtle borders
- Update `sharedTokens.radius` (lines 180-186): all values → `'0px'` (or `0`)
- Update Mantine `createTheme()`:
  - `primaryColor`: `'green'` → custom `'terracotta'` color scale
  - `colors.green` array → new `terracotta` 10-shade scale
  - `colors.dark` array → new warm-black scale (#111010 based)
  - `colors.gray` array → warm cream scale (#F5F0E8 based)
  - `fontFamily` → Familjen Grotesk stack
  - `fontFamilyMonospace` → DM Mono stack
  - `headings.fontFamily` → Anybody stack
  - `headings.fontWeight` → `'800'`
  - `radius` → all `'0px'`
  - `defaultRadius` → `0`
  - `shadows` → replace with mood board shadows (minimal, warm)

### 1.3 Rewrite `src/styles/global.css` — CSS custom properties
**File:** `src/styles/global.css` (741 lines)
- Replace dark theme `:root` variables (lines 12-138):
  - Surface tokens: `--tribos-void` → `#111010`, etc.
  - Remove edge lighting variables
  - Replace green accent variables with terracotta equivalents
  - Replace amber/blue/purple/red with mauve/teal/sage/gold/sky
  - Update text scale to warm tones
  - Update shadow variables (remove layered depth, use minimal)
  - Update selection/scrollbar/focus colors
- Replace light theme `:root[data-mantine-color-scheme='light']` variables (lines 141-188):
  - All new cream/ink/warm palette values
- Update body styles (line 204): font-family → Familjen Grotesk
- Update dark body override (lines 214-217): use new deep color
- Remove `.tribos-depth-card` shine line pseudo-element (lines 274-296)
- Remove `.tribos-accent-card` green glow pseudo-elements (lines 310-346)
- Replace with new `.tribos-card` class: flat surface + ink border (light) / subtle border (dark)
- Update focus styles (lines 412-463): green → terracotta focus rings
- Update Mantine dark overrides (lines 480-488): new warm-black scale
- Update Mantine light overrides (lines 491-498): new cream scale

### 1.4 Update `src/hooks/useThemeTokens.js`
**File:** `src/hooks/useThemeTokens.js` (114 lines)
- Rename `green` accessor → `terracotta` (primary accent)
- Add `mauve`, `teal`, `sage`, `gold`, `sky` accessors
- Remove `amber`, `blue`, `purple` accessors (replaced)
- Update CSS variable references throughout
- Keep backward-compatible aliases temporarily

---

## Phase 2: Component System — Mantine Overrides & Buttons

### 2.1 Update Mantine component overrides in `src/theme.js`
**Lines 300-575** — Component section of `createTheme()`:
- **Paper**: Remove gradient background, borderTop edge. Use flat `var(--tribos-card)` background + `1.5px solid var(--tribos-border)` (light) / `1px solid var(--tribos-border)` (dark). `radius: 0`.
- **Card**: Same. Remove hover lift transform. Hover = border color change only. `radius: 0`.
- **Button**: `radius: 0`. Remove hover transforms.
- **TextInput/Select/Textarea**: `radius: 0`. Replace green focus glow → terracotta focus. Replace inset shadows with simple border change.
- **Tabs**: Remove pill/inset style. Use underline tabs or flat bordered tabs with sharp corners.
- **SegmentedControl**: Sharp corners, flat background.
- **AppShell**: Replace panel gradient → flat surface. navbar/header use new variables.
- **NavLink**: Replace green active state → terracotta active state.
- **Modal/Drawer**: Sharp corners, new surface colors.
- **Menu**: Sharp corners, new surface colors.
- **Badge**: `radius: 0`, update font weight.

### 2.2 Update `src/components/ui/PrimaryButton.jsx`
**File:** `src/components/ui/PrimaryButton.jsx` (76 lines)
- Change `color="lime"` → use custom terracotta color
- Will need Mantine custom color registration or inline style override

### 2.3 Update button color references across codebase
**~21 files with `color="green"`, 9 with `color="red"`, etc.**
- `color="green"` (success actions) → `color="sage"` or keep as mapped semantic
- `color="lime"` → `color="terracotta"` (or the custom primary)
- `color="red"` (destructive) → keep `color="red"` but map to terracotta-shifted red
- This requires defining custom Mantine colors: `terracotta`, `sage`, `teal`, `mauve`, `gold`

---

## Phase 3: Color Constants

### 3.1 Update `src/components/ui/zoneColors.js`
**File:** `src/components/ui/zoneColors.js` (143 lines)
- Replace ZONE_COLORS map with new palette values
- Update CHART_COLORS: primary → terracotta, secondary → teal, tertiary → mauve, quaternary → gold
- Update `getChartSeriesColor()` palette array

### 3.2 Update route gradient colors
**File:** `src/utils/routeGradient.js`
- Replace gradient scale: downhill blues → teal/sage, flat green → gold, uphill yellows/oranges/reds → gold/terracotta/mauve

### 3.3 Update infrastructure colors
**File:** `src/utils/bikeInfrastructureService.js`
- `bike_lane` green → sage
- `protected_lane` blue → teal
- `shared_lane` amber → gold
- `bike_path` emerald → teal variant
- `unknown` gray → textMuted

### 3.4 Update surface overlay colors
**File:** `src/utils/surfaceOverlay.js`
- Map to new palette

### 3.5 Update waypoint colors
**File:** `src/components/RouteBuilder/index.js`
- Start: green → sage
- End: red → terracotta
- Waypoint: blue → teal

### 3.6 Update segment alternative colors
**File:** `src/utils/segmentAlternatives.js`
- Map to new palette

### 3.7 Update discussion category colors
**File:** `src/hooks/useDiscussions.ts`
- Map to new palette

### 3.8 Update difficulty badge colors
**File:** `src/components/WorkoutDifficultyBadge.jsx` (or similar)
- easy → sage, moderate → gold, hard → terracotta, recovery → teal, intervals → mauve

### 3.9 Update health metrics chart colors
**File:** `src/components/HealthTrendsChart.jsx`
- sleep → sky, weight → sage, stress → gold, mood → mauve

---

## Phase 4: Component Sweep — Hardcoded Colors

### 4.1 Systematic file-by-file update
**~52 files with hardcoded hex colors** — need grep-and-replace for:
- `#4ade80` / `#22c55e` / `#6ee7a0` (electric lime variants) → terracotta/sage equivalent
- `#3B82F6` (blue) → teal
- `#EAB308` / `#f59e0b` (yellow/amber) → gold
- `#F97316` (orange) → terracotta
- `#EF4444` / `#f87171` (red) → terracotta variant
- `#A855F7` / `#8b5cf6` (purple) → mauve/dusty rose
- `#EC4899` (pink) → sky/dusty rose
- `#10b981` (emerald) → sage
- `rgba(74, 222, 128, ...)` (green rgba) → terracotta/sage rgba equivalent

**Approach:** Process in batches by color family. Use search-and-replace with manual review for context (some colors may be zone-specific and already handled in Phase 3).

**Exceptions — DO NOT change:**
- `#FC4C02` — Strava brand orange (must remain per brand guidelines)
- Any third-party brand colors

### 4.2 Inline style patterns
**~40+ instances of `style={{ color: 'var(--tribos-lime)' }}`**
- Replace `var(--tribos-lime)` → `var(--tribos-terracotta)` (or the new primary)
- Replace `var(--tribos-green-*)` → new accent variable names

---

## Phase 5: Map & Visualization

### 5.1 Update Mapbox basemap defaults
**File:** `src/components/RouteBuilder/index.js`
- Default map style: `dark-v11` → theme-aware selection:
  - Light mode: `outdoors-v12` (or custom warm style)
  - Dark mode: `dark-v11` (acceptable for now, custom warm-dark later)
- Route line color: `#4ade80` → `#C4785C` (terracotta)
- Consider: outline routes with ink (#2C2826) for light mode

### 5.2 Update `ColoredRouteMap.jsx`
- Default route color: `#4ade80` → terracotta
- Background route: `#333333` → muted ink

### 5.3 Update `src/styles/global.css` Mapbox overrides
- Control backgrounds → use new surface tokens
- Attribution text → use new text tokens

---

## Phase 6: Polish & Metadata

### 6.1 Switch default color scheme to light
**File:** `src/App.jsx` (lines 218-219)
- `defaultColorScheme="dark"` → `defaultColorScheme="light"` (both ColorSchemeScript and MantineProvider)

### 6.2 Update `index.html`
- `<meta name="theme-color">`: `#bef264` → `#F5F0E8` (cream) or `#C4785C` (terracotta)
- Initial loader: background `#000000` → `#F5F0E8`, spinner color `#4ade80` → `#C4785C`, border `#2a3140` → `#D4CCC0`
- Font references in critical CSS

### 6.3 Update `public/manifest.json`
- `theme_color`: `#bef264` → `#F5F0E8`
- `background_color`: `#121212` → `#F5F0E8`

### 6.4 Update email template colors
- Background, text, CTA colors in email templates (if any server-side templates reference old colors)

### 6.5 Update Strava branding
**File:** `src/components/StravaBranding.jsx`
- Keep `#FC4C02` (Strava orange is mandated by their brand guidelines)
- Update surrounding UI elements to work with new palette

### 6.6 Landing page
**File:** `src/pages/Landing.jsx` (28KB)
- Full visual update to match new brand
- This is the most marketing-visible page

---

## Execution Order

1. **Phase 1** first — establishes the token foundation everything else depends on
2. **Phase 6.1** (default to light) — do this with Phase 1 so we're developing in the target default
3. **Phase 2** — component system adapts to new tokens
4. **Phase 3** — color constants updated
5. **Phase 4** — sweep hardcoded values
6. **Phase 5** — maps
7. **Phase 6** remainder — metadata polish

## Risk Notes

- The `depth` object is imported directly in 3+ files — need to update all consumers
- `tokens` is exported as default and used in 52+ files — backward compat aliases in Phase 1 prevent breakage
- `useThemeTokens()` hook is used throughout — accessor renames need to be careful
- Large files (RouteBuilder 5K lines, TrainingDashboard 2.5K lines) will need careful targeted edits, not full rewrites
- Strava brand color must NOT change
