# Handoff: Tribos "Today" Page — Timeline Spine

## Overview
A redesign of the tribos.studio **Today** page (the logged-in app home). The goal: a rider should see the *whole story of their training* in one glance. The page is organized into four zones:

- **Zone 01 — Fitness state** (the hero): today's form/TSB, readiness, CTL/ATL, weekly volume. Rendered as a floating "node" card that sits on the training timeline.
- **Zone 02 — Training arc** (the spine): a past → today → future CTL fitness curve with daily TSS bars, a projected future line, a planned peak, and the goal event. This is the backbone the whole page hangs off.
- **Zone 03 — Where you ride**: a dark map canvas with the last 4 rides overlaid as teal route lines.
- **Zone 04 — Coach**: today's recommendation plus an interactive chat input.

The signature interaction: the **fitness-state node is the "today" marker on the spine**, and it is **scrubbable** — drag it (or anywhere on the chart) to move backward through the past 6 weeks. Every value in the card, plus the day's completed workout, updates to the day you land on.

## About the Design Files
`Today Spine.dc.html` is a **design reference created in HTML** — a working prototype showing the intended look and behavior. It is **not production code to copy directly**. It's authored in a small in-house HTML component format (a `<x-dc>` template + a `Component` logic class); ignore that wrapper. Your task is to **recreate this design in the target codebase's existing environment** using its established patterns and libraries.

The real Tribos app is **React 19 + Vite + Mantine UI 8**, `@phosphor-icons/react` for icons, **Mapbox GL** for maps. Recreate the zones as React components using Mantine + the existing theme tokens. If you're starting fresh, React + a charting approach (hand-rolled SVG as here, or visx/d3) is the intended target.

To see it run: open `Today Spine.dc.html` in a browser. All logic (data generation, scrub math, chart geometry, chat) is inside the single file's `<script type="text/x-dc">` block — read it as reference pseudocode; the algorithms are documented below so you don't have to reverse-engineer them.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-accurately using the Tribos design system (see Design Tokens). Two rendered screens are included: a **desktop** layout (1180px app frame) and a **mobile reflow** (340px). The desktop is the primary deliverable; the mobile frame documents how the four zones stack.

---

## Design System (must follow)
Tribos is a warm-neutral, **zero-border-radius**, field-guide aesthetic. Non-negotiables:
- **Every corner is square.** `border-radius: 0` on all cards, buttons, inputs, chips, the node. Only avatars / status dots / spinners are round.
- **Warm neutrals**, never pure white/cool gray.
- **Three fonts**: Barlow Condensed (display, UPPERCASE, tracked), Barlow (body), DM Mono (all data/labels/buttons, UPPERCASE, spaced). DM Mono ships only weights 300/400/500 — **do not rely on 600/700 for mono**; size up instead.
- **Numbers are tabular** (`font-variant-numeric: tabular-nums`).
- Flat, warm-tinted shadows (alpha over `rgba(20,16,8,…)`), no glows/gradients as decoration.

---

## Screens / Views

### Desktop — Today (1180px wide app frame)
Top-to-bottom stack inside a `#F4F4F2` frame with a `1.5px solid #23211d` border:

1. **Top app nav** — 54px tall, `#141410` background. Left: 22×22 teal `#2A8C82` square logo with a Barlow-Condensed 800 "T", then wordmark `TRIBOS.STUDIO` (DM Mono 12px, `letter-spacing: 2.5px`, `#F4F4F2`). Nav links (DM Mono 11px, `letter-spacing: 1.5px`): TODAY (active — `#F4F4F2` with a `2px solid #2A8C82` bottom border), TRAIN, ROUTES, COMMUNITY (all `#7A7970`). Right: a "SYNCED · STRAVA" status (6px teal dot + DM Mono 10px `#7A7970`) and a 28px round avatar (`#3D3C36`, `1.5px solid #2A8C82`).

2. **Page header** — padding `26px 30px 18px`. Eyebrow "DEPARTMENT OF CYCLING INTELLIGENCE" (DM Mono 11px, `letter-spacing: 3px`, `#2A8C82`). H1 "TODAY — TUE 30 JUN" (Barlow Condensed 700, 34px, `letter-spacing: .04em`, uppercase; the date portion in `#7A7970` weight 600). Right-aligned one-line summary (Barlow 13px `#3D3C36`, max-width 280px): "You're fresh and building. Peak lands in **9 days**, right on the gran fondo."

3. **Zone 02 — Training arc panel** (card: `#FFFFFF`, `1.5px solid #DDDDD8`, shadow-sm; `margin: 0 30px`). See **Zone 02 spec** below.

4. **Zones 03 + 04 row** — CSS grid `grid-template-columns: 1.32fr 1fr; gap: 20px; padding: 20px 30px 30px`. See specs below.

### Mobile — Today (340px)
A phone frame (`#141410`, `border-radius: 34px`, 9px padding; inner screen `border-radius: 26px` — the rounded corners here are the *device chrome*, not app UI). Zones stack in order **01 → 02 → 03 → 04**, so the form headline reads first. Card widths are full-bleed with 12px margins. Content is a condensed version of each zone. This mobile card is **static** in the prototype (no scrub) — on real mobile, make the node a normal top card and the spine a compact read-only chart (scrubbing is a desktop/tablet affordance; on mobile prefer tap-to-select a day if you want parity).

---

## Zone 02 — Training arc (the spine) + Zone 01 node

This is the heart of the page. It's a full-width SVG chart with the fitness-state node absolutely positioned on top of it.

### Panel header
Row, `padding: 13px 18px 4px`, space-between:
- Left: `02` (DM Mono 10px `#7A7970`) + a 5×5 `#D4600A` square + "TRAINING ARC" (DM Mono 11px `letter-spacing: 2px` `#141410`).
- Right legend (DM Mono 10px `#7A7970`): a 16×2px `#141410` line = "FITNESS · CTL"; a 16px `2px dashed #7A7970` = "PROJECTED"; a 10×10 `#e9e6dd` swatch = "DAILY TSS".

### The chart (SVG)
- **Coordinate system**: `viewBox="0 0 1144 216"`, `width: 100%`, `preserveAspectRatio="none"`. Wrapped in a `position: relative` box (this box is the scrub target / geometry reference — call its `getBoundingClientRect()` for pointer math).
- **X axis mapping**:
  - Past days: index `i` in `0..42` (43 days = 6 weeks). `x(i) = 40 + 660 * (i / 42)`. So the left edge (`6 wk ago`) is x=40 and **today** is x=700.
  - Future: `x = 700 + 390 * (k / 21)` for `k` in `1..21` (3 weeks projected).
- **Y axis mapping** (CTL value → y): `y(ctl) = clamp(170 - (ctl - 40) / 26 * 130, 24, 178)`. Higher fitness = smaller y (higher on screen). Baseline axis at y=188.
- **Layers, in paint order**:
  1. Faint week gridlines (vertical `#efeee9` lines) + baseline (`#dcdad3`, from x=24 to 1120 at y=188).
  2. **Selected-day week band**: a translucent `rgba(42,140,130,.09)` rect, 14px wide, full height, centered on the selected x (`x = selX - 7`).
  3. **TSS bars**: 8px-wide rects, one per day with `tss > 0`. Height `h = min(72, tss/95*72)`, drawn from `y=188-h`. Past bars `fill: #e9e6dd`. Future planned bars are hollow: `fill: none; stroke: #e0c9a3; stroke-dasharray: 2 2` (drawn at a handful of future days).
  4. **CTL past area** (subtle fill, linear-gradient `#141410` 7%→0% id `ctlfill`) + **CTL past line** (`#141410`, 2.75px) — a polyline through `(x(i), y(ctl_i))` for all 43 past days.
  5. **CTL future projection**: dashed line `#7A7970` 2.5px `stroke-dasharray: 5 4`, from `(700, y(62))` through the 21 projected points.
  6. **Past ride dots**: `#141410` r=3 circles on hard-effort days (`tss >= 72`).
  7. **Planned future dots**: hollow, `fill: #F4F4F2; stroke: #C49A0A; stroke-width: 2`, r=4 (two key planned sessions).
  8. **Peak marker**: vertical `#C49A0A` dashed line + r=4.5 gold dot at the projected max-CTL point, label "PEAK" (DM Mono 9px `#C49A0A`).
  9. **Event flag** (goal event): vertical `#C43C2A` line at x=1080 + a 34×13 `#C43C2A` flag rect + "FONDO" (DM Mono 8px white).
  10. **Selected-day highlight bar**: if the selected day has `tss > 0`, an 8px `#2A8C82` rect at `opacity: .55` over its TSS column.
  11. **Selected marker line**: `#2A8C82` 1.6px `stroke-dasharray: 4 3`, vertical from y=28 to y=188 at `selX`.
  12. **Date flag** (the always-visible "which day" cue): an 88×17 `#2A8C82` rect at the top (`y=10`) with the selected date centered in it (DM Mono 9px white, `letter-spacing: 1px`). X is clamped so it never runs off: `labelX = clamp(selX - 44, 24, 1052)`; text anchored at `labelX + 44`. **This is deliberately outside/above the node card so the day is readable even when the card overlaps the curve point.**
  13. **Selected point dot**: `#2A8C82` r=5.5 with a 2px white stroke at `(selX, y(selCtl))`.
- **Axis labels** (DM Mono 9px): "6 WK AGO" (x=40), "PAST" (x=380, `#9a988f`), "NEXT 3 WEEKS · PLANNED" (x=880, `#c0a878`).
- **Caption** under the chart (Barlow 10.5px `#9a988f`, centered): "Drag the node along the spine to scrub past days · click it for the CTL/ATL trend · hover the ring for readiness".

### Zone 01 — the fitness-state node (floating card)
Absolutely positioned over the chart. **Left** = `(selX / 1144) * 100%`, `top: 52px`, `transform: translateX(-50%)`, `width: 236px`. This drops it *below* the curve so the line/bars/peak read above it.

**Frosted-glass treatment** (this is intentional and tuned — keep it):
- `background: rgba(255,255,255,.18)`
- `backdrop-filter: blur(6px) saturate(1.05)` (+ `-webkit-` prefix)
- `border: 1.5px solid #2A8C82`
- `box-shadow: 0 12px 30px rgba(20,16,8,.16)`
- Because the fill is ~18%, **text needs a white halo to stay legible over the chart**. Key readouts use `text-shadow` (or SVG `paint-order: stroke` for the ring number) with near-opaque `#F4F4F2`/white — see per-element notes. Do not remove these halos.

**Header bar** (the teal bar — doubles as the day's workout, and is the drag handle): `padding: 7px 12px 8px`, `background: rgba(42,140,130,.62)`, `border-bottom: 1px solid rgba(255,255,255,.32)`, `cursor: grab`. Two rows:
- Row 1: date eyebrow "`01 · TODAY · TUE 30 JUN`" (past days: "`01 · SAT 13 JUN`") — DM Mono 8.5px, `letter-spacing: 1px`, `rgba(255,255,255,.88)`, `white-space: nowrap`. Right side: a **TODAY ▸** snap-back button, shown only when *not* on today (DM Mono 8px, white, `1px solid rgba(255,255,255,.55)`, `background: rgba(255,255,255,.16)`, `padding: 2px 7px`).
- Row 2 (**the day's activity/workout**): a **zone tag chip** (DM Mono 8px, color varies, `1px solid rgba(255,255,255,.5)`, `padding: 1px 5px`) + activity **name** (Barlow 600 12.5px white, ellipsis-truncated) + **meta** pushed right (DM Mono 9px `rgba(255,255,255,.82)`). Examples: `PLAN · Hygiene Loop · 32 km · ~195W` (today), `Z3 · Tempo blocks · 2h00 · 86 TSS` (a past ride), `REST · Recovery day · off the bike`.

**Body** (click toggles a flip between FRONT and BACK; `cursor: pointer`):

FRONT (default), `padding: 11px 12px 9px`:
- Left column:
  - "FORM · TSB" label (DM Mono 9px weight 500, `#45443f`, small white halo).
  - The big TSB number: DM Mono 500, **41px**, `#0e0e0b`, tabular, strong white halo (`text-shadow: 0 1px 3px rgba(244,244,242,1), 0 0 3px rgba(244,244,242,1), 0 0 6px rgba(244,244,242,.8)`). Sign always shown (`+14`, `-3`). Next to it a trend glyph `▲ / ▼ / —` colored teal / coral / gold by sign.
  - State label (Barlow 600 11px, colored, halo): `FRESH · trending up` / `FRESH` / `NEUTRAL · grey zone` / `FATIGUED · loading` / `DEEP FATIGUE`.
- Right: **readiness ring**, a 54px SVG donut (viewBox 64, circle r=25, stroke-width 7, track `#EBEBE8`). Arc `stroke-dasharray = readiness/100 * 157.08`, rotated -90°, `stroke-linecap: round`. Ring color by readiness: `>=70` teal `#2A8C82`, `>=45` gold `#C49A0A`, else coral `#C43C2A`. Center number DM Mono 18px `#0e0e0b` with `paint-order: stroke; stroke: rgba(244,244,242,1); stroke-width: 3.5px` (this is the white-halo trick for SVG text), and a tiny "READY" label (DM Mono 6px `#7A7970`) beneath.
- Bottom: a 3-column grid (`1px dashed #DDDDD8` top border) — **CTL · FITNESS**, **ATL · FATIGUE**, **WK VOLUME**. Labels DM Mono 8px weight 500 `#55544e` (with halo); values DM Mono 20px `#0e0e0b` (with halo). Middle/right columns have a `1px solid #eeece6` left divider + 12px left pad. Volume shows e.g. `6.5h`.
- Footer hint (DM Mono 8.5px `#c9c7c0`, centered): "CLICK FOR CTL / ATL DETAIL".
- **Readiness reasoning popover** (shown on ring hover): a dark tooltip `#141410`, `1px solid #2A8C82`, positioned `right: 12px; top: 98px; width: 206px; z-index: 5`. Title "WHY READINESS {n}" (DM Mono 8px `#3BA89D`). Four rows (Barlow 11px `#B0B0A8` label + DM Mono 10px colored value): **Sleep** "7h 20m", **HRV** "62 ms ▲", **Yesterday** (Rest day / Easy / Moderate / Hard, colored), **7-day ramp** (e.g. "+3 CTL", colored). Footer (Barlow 10px `#7A7970`, top-bordered): "→ feeds today's coach call".

BACK (after clicking the card), `padding: 11px 12px 9px`:
- Title "TREND · {date}" (DM Mono 9px `#7A7970`).
- **CTL · 42-DAY FITNESS**: label row with the value + delta vs 7 days ago (colored: `#C43C2A` if ramp >8, else teal if ≥0, else `#7A7970`), and a 130×32 sparkline polyline (`#141410` 1.6px) of the 42-day CTL series.
- **ATL · 7-DAY FATIGUE**: value + delta vs yesterday (coral if rising, teal if falling), and a sparkline (`#D4600A` 1.6px) of the last 7 ATL values.
- Footer hint: "CLICK TO CLOSE".

---

## Zone 03 — Where you ride (dark map)
Card (`#FFFFFF`, `1.5px solid #DDDDD8`, shadow-sm), column flex. Header row: `03` + 5×5 `#C49A0A` square + "WHERE YOU RIDE"; right "LAST 4 RIDES" (DM Mono 10px `#7A7970`).

Map body: `flex: 1; min-height: 230px; background: #141410; overflow: hidden`. In the prototype it's a hand-drawn SVG standing in for **Mapbox** — in production, use Mapbox GL with `mapbox://styles/mapbox/dark-v11`. Route rendering follows the brand's one real flourish:
- **Route lines**: teal `#2A8C82`, **3px solid at ~90% opacity**, `line-cap: round`, sitting on top of an **8px blurred shadow of the same color at ~15–18% opacity** (SVG `feGaussianBlur stdDeviation=4` in the mock). The most recent ride is full-strength; older rides are the same teal at ~35% opacity.
- Start dot: `#141410` fill with 2–2.5px teal stroke. End dot: coral `#C43C2A`.
- **Overlay chips** (bottom-left, `display: flex; gap: 10px`): translucent `rgba(20,16,8,.72)` + `backdrop-filter: blur(8px)` + `1px solid rgba(255,255,255,.12)`, `padding: 7px 10px`. Each: a DM Mono 8px `#9a988f` label + DM Mono 16px `#F4F4F2` value — **THIS WEEK** `182 km`, **ELEV** `2,140 m`, **RIDES** `4`. Top-right chip: "BOULDER FOOTHILLS" (DM Mono 9px `#9a988f`).

---

## Zone 04 — Coach
Card with a **teal accent border** (`1.5px solid #2A8C82`, shadow-sm), column flex. Header: `04` + 6px round `#C49A0A` dot + "COACH"; right "AI · LIVE".

- **Recommendation block** (`padding: 13px 16px 0`): a left-accent panel — `border-left: 3px solid #2A8C82`, `background: rgba(42,140,130,.10)`, `padding: 11px 13px`. Eyebrow "TODAY'S CALL" (DM Mono 9px `#2A8C82`), title "HYGIENE LOOP" (Barlow Condensed 700 18px, uppercase, `letter-spacing: .03em`), body (Barlow 13px `#3D3C36`): "32 km · ~195W · Z2 endurance. You're fresh — keep it easy and bank the aerobic time."
- **Chat thread** (`flex: 1; min-height: 120px; max-height: 180px; overflow-y: auto; padding: 12px 16px; gap: 8px`). Rider bubbles: right-aligned, `background: #F4F4F2`, `1px solid #DDDDD8`. Coach bubbles: left-aligned, `background: rgba(42,140,130,.10)`, `1px solid rgba(42,140,130,.22)`. Bubble text Barlow 13px `#141410`, `padding: 8px 11px`, `max-width: 82%`. Seed thread: rider "I have 90 min before work. What should I ride?" → coach "Your CTL is 62 and you rested yesterday — you're fresh. I'd suggest the Hygiene Loop at ~195W. Endurance pace, keep it easy."
- **Typing indicator**: three 6px teal dots bouncing (`@keyframes` translateY, 1.4s ease-in-out infinite, staggered 0/.2/.4s), shown while a reply is pending.
- **Input area** (`padding: 10px 16px 14px; border-top: 1px solid #DDDDD8`): two quick-chip buttons ("60 min today?", "Push harder?" — `1px solid #DDDDD8`, `background: #F4F4F2`, Barlow 11px `#3D3C36`), then a text input (`1.5px solid #DDDDD8`, Barlow 13px, placeholder "Ask your coach…") + an **ASK** button (`background: #141410`, white, DM Mono 10px `letter-spacing: 2px`). Enter or ASK submits.

---

## Interactions & Behavior

### Scrub (the headline interaction)
- **Trigger**: `pointerdown` anywhere on the chart's `position: relative` box (including on the node's teal header — it's the grab handle). The node body swallows pointerdown so clicking it flips instead of scrubbing.
- **Math**: on pointerdown and every pointermove, `frac = (clientX - box.left) / box.width; svgX = frac * 1144; index = round((svgX - 40) / 660 * 42)`, clamped to `0..42`. Set `selected = index`.
- **Effect**: all node values, the header activity, the highlighted TSS column, week band, marker line, date flag, and point dot recompute for `selected`. **Future days are not selectable** (you can't have a "state" that hasn't happened) — clamp at today (index 42).
- Attach pointermove/up listeners on `window` for the drag; remove on pointerup.
- Scrubbing sets displayed values immediately (no count-up) and closes any flip/hover.
- **TODAY ▸** button (visible only when scrubbed away) snaps back to index 42 and replays the count-up.

### Flip for detail
- Clicking the node **body** toggles FRONT ↔ BACK (the CTL/ATL trend sparklines). Clicking the ring does **not** flip (it stops propagation). Clicking the header/TODAY button does not flip.

### Live count-up (on mount + on snap-to-today)
- The TSB number and readiness ring animate from 0 to their target over **750ms**, ease-out cubic (`1 - (1-t)^3`), via `requestAnimationFrame`. Store `dispTSB` / `dispReady` in state; render rounds them.

### Readiness reasoning
- `mouseenter`/`mouseleave` on the ring toggles the dark popover (FRONT only). On touch, treat as tap-to-toggle.

### Coach chat
- Submitting a question appends a right-aligned rider bubble, shows the typing indicator, then after ~1100ms appends a coach reply. Reply is keyword-matched in the prototype (`60`/`min`, `harder`/`push`, else a default). In production wire this to the real coach endpoint; keep the typing-indicator delay pattern.

### Motion system
Durations 100ms (hover) / 150ms (base) / 250ms (reveal), **ease-out only, no spring/bounce**. Honor `prefers-reduced-motion` (snap count-up and transitions to final state).

### Responsive
Desktop is the scrubbable experience. Below ~768px, stack zones 01→02→03→04; render the node as a normal top card and the spine as a compact read-only chart (see mobile frame). Hit targets ≥ 44px.

---

## State Management
Component state needed:
- `selected` (int 0..42) — the day the node points at. Default 42 (today).
- `flipped` (bool) — node front/back.
- `ringHover` (bool) — readiness popover.
- `dispTSB`, `dispReady` (numbers) — animated display values for the count-up.
- `draft` (string) — coach input text.
- `typing` (bool) — coach reply pending.
- `messages` (array of `{ role, text }`) — chat thread.

Derived per render from `selected`: the day's `{ ctl, atl, tsb, ready, tss, vol, date, activity }`, chart marker geometry (`selX`, `selY`, band/label/flag x), deltas & sparkline point strings, the reasoning rows, and the activity tag/name/meta.

### Data model (per day)
The prototype **synthesizes** 43 past days + 21 future days so the chart is self-contained. In production, replace this with real athlete data (CTL/ATL from your training-load service, TSS + activity from Strava/Garmin sync, planned sessions from the planner). The synthesis, for reference:
- CTL rises smoothly ~44 → 62 across 6 weeks (smoothstep). ATL wobbles around CTL; the last 3 days taper (ATL 57 → 52 → 48) to produce today's **TSB = CTL − ATL = 62 − 48 = +14**.
- **Readiness** = `clamp(round(52 + tsb * 1.86), 28, 96)` → today ≈ 78.
- **Weekly volume** = rolling 7-day TSS sum ÷ 58, in hours (today pinned to "6.5h").
- **Future projection**: impulse-response toward a hard block (load 96) for 11 days then a taper (load 22), `ctl += (load - ctl)/42` per day. Peak = max projected CTL.
- **Activity per day** (drives the teal header): today → `PLAN · Hygiene Loop · 32 km · ~195W`. Past: `tss===0` → `REST · Recovery day · off the bike`; else duration `= round(tss*1.4)` min, and by TSS band → `Z1 · Recovery spin`, `Z2 · <rotating endurance name>`, `Z3 · Tempo blocks`, `Z4 · Threshold 4×8`, each with `· {duration} · {tss} TSS`.

---

## Design Tokens
Use the existing Tribos theme (`src/theme.js` / `colors_and_type.css`). Values used here:

**Surfaces**: page `#F4F4F2` · panel `#EBEBE8` · card `#FFFFFF` · hairline border `#DDDDD8` · nav/ink-dark `#141410` (near-black variants `#0e0e0b`, frame `#23211d`).
**Ink**: primary `#141410` · secondary `#3D3C36` · muted `#7A7970` · (extra shades used on the glass card: `#45443f`, `#55544e`, hint `#c9c7c0`, faint chip `#9a988f`).
**Accents**: teal (primary) `#2A8C82` · orange (effort) `#D4600A` · gold (achievement) `#C49A0A` · coral (warning) `#C43C2A`. Dark-mode/lifted teal `#3BA89D`. Tints: teal-subtle `rgba(42,140,130,.10)`, teal-border `rgba(42,140,130,.22)`.
**Zone accents on teal header chips**: rest `#dfeae6`, Z1/Z2 `#d3efe1`, Z3 `#ffe1a0`, Z4 `#ffcf8f`, plan `#ffffff`.
**Chart-only neutrals**: TSS bar `#e9e6dd` · planned-bar stroke `#e0c9a3` · gridline `#efeee9` · baseline `#dcdad3` · ring track `#EBEBE8`.
**Typography**:
- Display — Barlow Condensed 700/800, UPPERCASE, `letter-spacing: .04em`. H1 34px here.
- Body — Barlow 400/500/600, `letter-spacing: -0.01em`.
- Data/labels/buttons — DM Mono 300/400/500, UPPERCASE, `letter-spacing: 1–3px`. (No 600/700 — size up instead.)
**Spacing**: 4 / 8 / 16 / 24 / 32 / 48. Hit targets ≥ 44px.
**Radius**: **0** everywhere. `50%` only for avatar/dots/spinner.
**Shadows**: sm `0 1px 3px rgba(20,16,8,.07), 0 4px 12px rgba(20,16,8,.05)` · md `0 2px 6px rgba(20,16,8,.08), 0 8px 24px rgba(20,16,8,.07)`. Node card uses `0 12px 30px rgba(20,16,8,.16)`.
**Node frosted glass**: `background: rgba(255,255,255,.18)`, `backdrop-filter: blur(6px) saturate(1.05)`, teal border, plus white text-shadow halos on all readouts (documented per-element above).
**Transitions**: 100 / 150 / 250ms, ease-out.

---

## Assets
- **Icons**: `@phosphor-icons/react` (regular weight) in the real app. The prototype uses text glyphs (▲ ▼ — ▸ ·) and CSS shapes — swap for Phosphor equivalents where natural (e.g., a trend caret). No custom icon font.
- **Map**: Mapbox GL, `mapbox://styles/mapbox/dark-v11`, teal `#2A8C82` route lines with the blurred-shadow flourish. The prototype's SVG map is a stand-in.
- **Logo**: 22px teal square + Barlow-Condensed "T" wordmark. (Note: the legacy green "T" favicon in the repo predates the teal brand — use `#2A8C82`.)
- No photographic or illustration assets are required.

---

## Files
- `Today Spine.dc.html` — the full working prototype (desktop + mobile). All four zones, the scrub/flip/hover/count-up logic, the data synthesis, chart geometry, and coach chat live in this one file. Open it in a browser to interact; read its `<script type="text/x-dc">` block for the exact algorithms (documented above).

## Suggested build order
1. Static desktop layout + tokens (nav, header, four zone cards, zero-radius, fonts).
2. Zone 02 SVG chart from real/synth data (axes, CTL past line + area, TSS bars, future dashed line, peak, event flag).
3. The node card FRONT with real values + the frosted-glass + halo treatment.
4. Scrub interaction (pointer math → `selected` → recompute marker, band, flag, highlighted bar, node values, header activity).
5. Flip (BACK sparklines), readiness popover, count-up.
6. Zone 03 real Mapbox with the last N rides; Zone 04 coach wired to the real endpoint.
7. Responsive stack + reduced-motion.
