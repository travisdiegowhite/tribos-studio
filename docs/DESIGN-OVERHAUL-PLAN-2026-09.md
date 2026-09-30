# Visual overhaul — Podium palette on the zine layout (2026-09)

**Status:** tokens, type, app shell, landing, Today and calendar are built together on `claude/vigilant-bohr-qe01u4` (preview only, not merged); phase 5 (sweep) not started.
**Design canvas:** Tribos — New Look Exploration (private claude.ai artifact). The reference is the row **"Black ink, blue accent"**: boards `InkZine-Tokens`, `InkZine-Landing`, `InkZine-Today`, `InkZine-Calendar`, `InkZine-TodayMobile`. (The row above it, "Podium palette × zine layout", used ultramarine for all ink; seen live, it was too loud.)
**Supersedes:** the look in `docs/TRIBOS-DESIGN-SYSTEM.md` (TB-001, "Department of Cycling Intelligence"), and "the blend" (closed PR #997).

## Why

The current UI is competent, but it reads as AI-made. The audit behind that judgement:

- **Uppercase monospace everywhere.** Theme defaults, plus 177 inline `textTransform: 'uppercase'` and 77 inline `DM Mono` in JSX.
- **A formula landing hero** and a "01 / 02 / 03" three-card feature row (`src/components/landing/`).
- **Sparkle and robot icons for the coach** (28 files).
- **Icons in shapes and even grids.** 118 `ThemeIcon` icon-in-a-box uses and 99 `SimpleGrid` uniform grids.
- **Emoji as personality**, about 193 of them.
- **Leftover gradients** (`CoachCard.jsx`, `TrainNow.jsx`, `RouteAnalysisSummaryWidget.tsx`, `AnalyticsExportBar.jsx`).
- **Four equal-weight accents** plus a five-band stripe.
- **Zero radius combined with soft two-layer shadows.**
- **Token names that lie.** `--tribos-terracotta-*` is teal, `sage` is gold, `--tribos-gold-*` is coral.

## The direction in one paragraph

The zine layout, printed in Podium's colours. A white page with neutral grey sheets, near-black ink for text and lines, ultramarine as a sparing accent (the active tab, endurance, the done tick), and three bright hues that each have one job: magenta for effort, CTAs, stamps and hand notes; cyan for recovery and chart bars; lime for highlights, overprints and the coach block. Headings are Tribos Display (Archivo at 62% width) in heavy capitals, the UI is Archivo, and numbers, logs and the coach's voice are Courier Prime. Rubber stamps, tape and marker notes stay, for moments only. There are no drop shadows, gradients, emoji or icon boxes, and nothing is orange or red, so tribos never reads as Strava, Zwift or TrainerRoad.

**How we got here (2026-09-28/30).** Four paper-and-ink directions (Ride Zine on sand, black on off-white, the blend, the zine-leaning blend) were built or drawn and rejected as too retro and too quiet. Three fresh directions followed (Race Kit, Topo, Podium). The pick was Podium's palette on the zine-leaning layout.

## Tokens

| Role | Light | Dark | Replaces |
|---|---|---|---|
| Page / tint / sheet | `#FFFFFF` / `#F8F8FA` / `#F3F3F6` | `#0A0A14` / `#111118` / `#1A1A22` (elevated `#24242E`) | `--color-bg*`, `--color-card` |
| Rule | `#D6D6E0`; ink for emphasis | `#2C2C38` | `--color-border` |
| Ink (text, lines, primary actions) | `#0A0A14` | `#FFFFFF` | `--color-text-primary`, `--color-teal` |
| Accent (active tab, endurance, done tick) | ultramarine `#2B2BFF` | `#8C8CFF` | new |
| Secondary / muted text | `#3C3C4A` / `#5E5E6E` | `#C8C8D2` / `#A0A0AE` | `--color-text-secondary/-muted` |
| Signal (fills, stamps) / signal text | magenta `#FF3DB8` / `#C4007A` | `#FF3DB8` / `#FF6FCB` | `--color-orange` (→ signal text), `--color-coral` |
| Done (with the hand tick) | `#2B2BFF` | `#8C8CFF` | `--color-gold`, success |
| Easy (recovery, planned) text / fill | `#006DA8` / cyan `#00C2FF` | `#00C2FF` | info |
| Highlight (lime; overprints, the coach block) | `#B6F500` | `#B6F500` | `--color-highlight` |

Every text/surface pair is at least 4.5:1. Magenta, cyan and lime are fills: as text on white they fail contrast, so `global.css` points Mantine's `--mantine-color-{signal,orange,easy,blue,moss,green,…}-text/-light-color/-outline` at the deeper shades (`#C4007A`, `#006DA8`, `#526E00`) in light mode. Text on a filled button or badge comes from `--tribos-on-{role}` (dark text on magenta, cyan and lime).

- **Fonts.** `index.html` loads Archivo (width axis 62–125), Courier Prime and Covered By Your Grace. Tribos Display (Archivo pinned at 62% width) is self-hosted in `src/styles/fonts/`.
- **Headings.** Tribos Display 900 in capitals (`.mantine-Title-root` and the theme's `headings`).
- **Numbers and the coach.** Courier Prime.
- **Shadows.** All shadow tokens go to `none`. Hierarchy comes from rules and type weight.
- **Training zones.** One hue per kind of effort: cyan (recovery), ultramarine (endurance), lime (tempo), magenta (threshold), deep magenta (VO2) and black (anaerobic).

## Rollout

Each phase is one PR, shipped to everyone. There is no feature gate: this is a presentation-only change, and the RB2 and calendar-gate history in `CLAUDE.md` shows gates cost more than they save.

### Phase 1 — Tokens, type and app shell

**As built:**
- **Palette.** The role tokens above live in `src/styles/global.css` (light and dark) and are mirrored in `src/theme.js`: `lightTokens`/`darkTokens` and the Mantine ramps `ink`, `signal`, `moss`, `easy` and `moment`. The legacy Mantine names `teal`, `orange`, `gold`, `green`, `coral`, `red` and `blue` point at the matching ramp. Chart variables (`--chart-*`) are added for phase 3.
- **Filled buttons and badges** take their text color from `--tribos-on-{role}` through a custom `variantColorResolver`, because Mantine's autoContrast misjudges dark mode's pale fills. `variant="gradient"` renders as a flat fill.
- **Type.** Tribos Display headings in capitals; Archivo, Courier Prime and a marker hand load from Google Fonts. Inline font names across `src/` (including the share-card canvas) use Archivo and Courier Prime.
- **Tribos Display** is a self-hosted static Archivo at 62% width (40 KB) in `src/styles/fonts/`, used for headings and `.tribos-stamp`.
- **Moment utilities.** `.tribos-stamp` and `.tribos-hand` in `global.css`.
- **App shell.** A white masthead over a 2px ink rule, a "TRIBOS" wordmark in Tribos Display, and condensed Archivo tabs where the active one is a filled ultramarine block (the accent). The five-band stripe is gone.

### Phase 2 — Landing (`/welcome`), as `PodiumZine-Landing` (built)

- **Replacements.** New `LandingHero`, `WeekLedger` and `CoachQuote` replace `HeroSection`, `FeatureCards` and `FinalCTA`. Keep `routeData.js`, `useScrollReveal.js`, the SEO block and every inbound link.
- **Hero.**
  - A capitals headline, an ink CTA and a "No account needed" stamp.
  - A route-sheet card that draws the real Erie loop from `routeData.js` as an SVG line on paper (no Mapbox tile or token needed): an ink line, a lime overprint on the climb, one marker note, Courier stats computed from the coordinates, and the coach note in Courier.
  - The Robot/Sparkle icons and chat bubbles are removed.
- **Sections.**
  - The "plan that bends" week ledger as a taped Courier sheet, with a moved-session marker note.
  - The coach quote on a lime block.
  - A footer with the line (from Travis): "Travis makes tribos, built on ideas while riding Boulder County roads."

### Phase 3 — Today (`src/views/today-spine/`), as `PodiumZine-Today` (built)

- **Theme-aware tokens.** Rewrite `src/views/today-glance/tokens.ts` (`C`, `CHART`) to `var(--color-*)` / `var(--chart-*)`. This fixes dark mode for all ~30 importers. SVG fills and strokes that use tokens move into `style={{…}}`, because presentation attributes don't reliably resolve `var()`.
- **Header.** A date line, `summaryLine` as a capitals headline, and a race countdown stamp only when the spine data carries a goal event. The "Department of Cycling Intelligence" eyebrow and all "01–04 ·" numbered labels are dropped.
- **Layout.** The existing structure (check-in, training arc with its node card, then rides map beside the coach) is kept and restyled rather than rearranged: sheets divided by rules, paper-toned chart and map tiles, the coach's call and the readiness verdict in Courier italic. The board's separate session block and mono ledger row are not built; the node card already carries those numbers.
- **Display casing.** Uppercase data labels (dates, state words) are converted at display time via `today-spine/caseText.ts`; the data layer keeps them.
- **Mobile beats** get sentence-case labels. Render tests that assert the old uppercase labels are updated; data and behavior are untouched.

### Phase 4 — Calendar (`/train`), as `PodiumZine-Calendar` (built)

- **Tab bar.** `SecondaryNavBar` loses the black strip: paper bar, bottom rule, sentence-case tabs with an ink underline.
- **Buttons.** Body Check-in becomes a default ink outline button.
- **Day cells** (styling only in `TrainingCalendar.jsx`; all drag/drop and mutations unchanged):
  - Flat sheets divided by rules, and today outlined in ink.
  - Ridden: the hand tick plus "Ridden, N".
  - Missed: struck through, with a marker note when the session was moved.
  - Race: a "Race day" stamp.
  - Emoji become text.
- **Fixes.**
  - The invalid `${'var(--color-teal)'}15` today tint.
  - Unify `WORKOUT_TYPES` and the three duplicated `CATEGORY_COLORS` maps on the zone ramp.
- **Out of scope.** The mockup's "next five weeks" strip follows separately.

### Phase 5 — Sweep

- Delete the leftover gradients.
- Replace emoji with words (or, for a genuine moment, a stamp).
- Replace `ThemeIcon` icon-boxes with bare stroke icons or nothing.
- Reduce the 419 hard-coded hexes to tokens, heaviest files first (`OnboardingModal`, `ImportWizard`, `HealthCheckInModal`).
- Retire the remaining inline `textTransform: 'uppercase'` / `DM Mono`.

## Guardrails

- **No service worker and no precaching.** Font files come from Google Fonts over the network (see the Deployment & Caching rules in `CLAUDE.md`). After each phase ships, purge Cloudflare and check on `www.tribos.studio`.
- **Auth pages restyle through tokens only.** Do not change the flow in `Auth.jsx` / `AuthContext.jsx`.
- **Metric labels keep the canonical names** (TFI / AFI / FormScore / RSS). This is a visual change, not a rename.
- **Cap the hand-drawn marks.** Stamps, tape and marker text are decoration with meaning. If a screen has more than one, remove one.
