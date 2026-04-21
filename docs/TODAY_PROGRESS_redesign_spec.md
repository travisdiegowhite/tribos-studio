# TODAY Reorganization + PROGRESS Page

**Status:** Spec locked 2026-04-20
**Related:** `TRIBOS_STATS_BIBLE.md` (source of truth for metric definitions), `FAR_implementation_checklist.md` (FAR metric build spec)
**Stack:** Vite + React Router 7, Supabase (Postgres + Edge Functions), TypeScript

**Supersedes:** `tcas-today-progress-spec.md` (which was drafted before the FAR/TCAS naming collision was caught and before the bible's metric inventory was reconciled)

---

## 0. Context

The current TODAY page has seven modules competing for the hero slot: fitness curve chart, coach check-in, yesterday/today/next-race strip, raw metrics row, today's focus + route match, active plan, recent rides map, coach chat. The result is visual crowding and unclear hierarchy.

Three problems are being solved:

1. **Dashboard clarity.** TODAY should answer *"what now?"* — everything else moves to other surfaces.
2. **Fitness readability.** Raw TFI/AFI/FS are invisible to users who don't already know the underlying terminology. FAR (the new metric specced in the bible §5.4) contextualizes fitness trajectory on a 0–130+ scale.
3. **PROGRESS as destination.** The Banister fitness/fatigue/form chart is a power-user lens. It belongs on a dedicated PROGRESS page with room to breathe, joined by TCAS history, EFI trend, and other deep-dive views.

---

## 1. TODAY page reorganization

### 1.1 Design principle

> **Test for any TODAY module:** *Does this help a user decide what to ride in the next 10 minutes?*
>
> If no, it belongs elsewhere.

Plan progress, historical fitness, route library, goal-setting, integrations all fail this test. They move to TRAIN, PROGRESS, or settings.

### 1.2 What TODAY answers (in priority order)

1. What am I supposed to do today, and how long will it take?
2. What does my coach think about today?
3. How's my training going overall? (the FAR question)
4. What's the next race and am I on track?
5. Did my last ride count?
6. What's the week look like?

### 1.3 Information architecture — four tiers

```
TIER 1 (hero, full width):      Today's workout + coach check-in
TIER 2 (2-col):                 FAR card (2/3) + race readiness card (1/3)
TIER 3 (2-col):                 Recent rides (1/2) + this week (1/2)
TIER 4 (full width, low):       PROGRESS sneak preview → link to PROGRESS
```

### 1.4 Tier 1 — Today's workout (hero)

**Purpose:** the "what now?" answer. One module, one primary CTA.

**Consolidates:**
- Current "Today · Endurance Base Build" strip card
- Current "Today's Focus" block
- Current "Best Route Match" block
- Current coach check-in paragraph (collapsed into 2-line summary)
- Current coach chat (collapsed into "Ask coach →" affordance)

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ [teal accent bar]                                       │
│ TODAY'S WORKOUT          |    BEST ROUTE MATCH          │
│ Endurance Base Build     |    Sugar Magnolia            │
│ 90 MIN · TARGET RSS 70   |    54.0 mi · 100% match      │
│                                                         │
│ [▶ RIDE TODAY]  [VIEW PLAN]                             │
│                                                         │
│ ┌── coach check-in (inset) ────────────────────────────┐│
│ │ COACH · THE COMPETITOR                               ││
│ │ Stay locked in. Last ride pushed form to 0.          ││
│ │ Foundation work matters before racing... [ASK COACH→]│
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Primary CTA:** One button, `▶ RIDE TODAY`. Remove the duplicate that currently appears in the "Today's Focus" block. `VIEW PLAN` is secondary (outlined), routes to full workout detail on TRAIN.

**Workout label — acronym discipline:** First appearance of RSS in the workout metadata must be "TARGET RIDE STRESS SCORE · 70" or "TARGET RSS 70 *(Ride Stress Score)*". Tooltip on RSS explains the metric. Bible §9 governs this for all metrics — this is not optional styling.

**Coach check-in nesting:** 2-line summary embedded in Tier 1 because "what coach thinks about today" is part of "what to do today." The "Ask coach →" link opens full coach chat:
- **Desktop:** slides in as side panel from right, full chat history scrollable
- **Mobile:** full-screen modal, close button returns to TODAY

Coach chat does **not** get its own full-width block on TODAY.

### 1.5 Tier 2 — FAR card + race readiness

**Purpose:** "How am I doing overall, and am I ready for what's next?"

#### FAR card (2/3 width)

See `FAR_implementation_checklist.md` for full metric spec. Visual structure:

```
┌─ FAR CARD ──────────────────────────────────────────┐
│ FITNESS ACQUISITION RATE · FAR        [DETAIL →]   │
│ LAST 6 WEEKS · TRAILING 28D                         │
│                                                     │
│ 100    BUILDING — AT SUSTAINABLE MAX                │
│        Matching 1.5 TFI/week. Ceiling ~115.         │
│                                                     │
│ [Mini zone chart with trend line + ceiling line]    │
│                                                     │
│ ─────────────────────────────────────────────────── │
│ 28D Δ +6.0 · RATE +1.5/wk · 7D +1.2 | TFI 37 · FS -3│
└─────────────────────────────────────────────────────┘
```

**Critical acronym labeling:**
- Card header: `FITNESS ACQUISITION RATE · FAR` — full name first, always.
- Stats strip footer uses acronyms alone (acceptable after header introduced full name).
- Hover on any acronym (`FAR`, `TFI`, `FS`) reveals tooltip per bible §9 discipline.

**Stats strip composition:**
- Left side: FAR-native stats — 28-day delta, weekly rate, 7-day momentum
- Right side: supporting Banister stats — TFI, FS (selected because they're directly interpretable alongside FAR)
- Removed from strip (vs. original spec): TCAS, EFI, AFI — these belong on their own surfaces

**`DETAIL →` link:** routes to `/progress`.

#### Race readiness card (1/3 width)

**Consolidates:** current top-strip "NEXT · RACE" card, race references from coach check-in, active plan block.

**Must show:** race name + date + type, days out (big number), projected TFI on race day, target TFI (coach-set or heuristic), projected FS on race day, on-target status.

**Layout:**

```
┌─ NEXT RACE ─────────────────────┐
│ BOULDER ROUBAIX                 │
│ ROAD · SUN APR 26               │
│                                 │
│ ┌─ 7 DAYS OUT ──┐              │
│ └────────────────┘              │
│                                 │
│ PROJECTED TFI         42        │
│ TARGET                40+       │
│ FORM ON RACE DAY     +12 (gold) │
│                                 │
│ ──────────────────────────────  │
│ ON TARGET              ●        │
└─────────────────────────────────┘
```

**Valence coloring on projected FS** (per bible color rules):
- `+5 to +25`: gold (fresh, good for racing)
- `> +25`: orange (too fresh, losing fitness into race)
- `−5 to +5`: neutral gray
- `< −5`: coral (carrying too much fatigue)

**Target TFI heuristic** (when no coach-set target): `target = max(current_tfi, historical_peak_tfi × 0.85)`. Show the source of the target on hover ("Coach-set" vs "Auto-calculated").

**Empty state:** if no race within 60 days, render `NO UPCOMING RACE` with `ADD A RACE →` CTA routing to TRAIN's race calendar.

### 1.6 Tier 3 — Recent rides + This week

**Purpose:** retrospective (what happened) + prospective (what's left).

#### Recent rides (1/2 width)

- Keep the map — it's good visual variety on the page
- Reduce ride list to 3 visible with `SHOW MORE →` affordance
- Bound map height to ~140px
- Move "POWERED BY STRAVA / GARMIN CONNECT" attribution to settings/integrations page

#### This week (1/2 width)

**Consolidates:** current "This Week · 4/7 RIDES" block, extended with "remaining" list.

**Must show:** completion progress (`4/7 rides` + progress bar), done stats (distance, elevation), remaining list (day-by-day for rest of week).

The "remaining" list is the key upgrade. Current block is a dead-end stat display; adding remaining workouts turns it into a planning surface.

### 1.7 Tier 4 — PROGRESS sneak preview

**Purpose:** quick visual bridge from TODAY to PROGRESS without requiring users to discover the top-nav tab.

**Design intent:** a "teaser strip" showing enough of the Banister chart to make users curious about the full view. Not a full chart, not a button — a peek.

**Layout:**

Full-width, low-prominence strip at bottom of TODAY:

```
┌──────────────────────────────────────────────────────────┐
│ FITNESS · FATIGUE · FORM                                 │
│                              ┌───────────────────────┐   │
│ TFI 37    AFI 35    FS -3    │ [mini Banister chart] │   │
│                              └───────────────────────┘   │
│ +6 fitness over 28 days             SEE FULL PROGRESS → │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- Height: ~100–120px — recognizable but not competing with Tier 2
- Mini chart shows TFI/AFI/FS for last 42 days (shorter window differentiates from FAR's 28d trailing)
- No interactivity on the strip; entire strip is clickable
- Routes to `/progress`
- Background `#F4F4F2` (page bg) not white — feels like a transition zone

**Acronym labeling:** `FITNESS · FATIGUE · FORM` header is the full names; stats below use acronyms since the header introduced them.

**Why not just a button:** a button asks users to trust there's something worth clicking. A sneak preview shows them. Reframes TFI/AFI/FS as "advanced analytics, available when you want them" rather than burying them on the hero.

**Component spec:**

```typescript
interface ProgressPreviewStripProps {
  tfi: number;
  afi: number;
  fs: number;
  tfi_delta_28d: number;
  series_42d: Array<{ date: string; tfi: number; afi: number; fs: number }>;
  onClick?: () => void;  // navigates to /progress
}
```

Location: `src/components/dashboard/ProgressPreviewStrip/ProgressPreviewStrip.tsx`

### 1.8 What gets removed from TODAY

| Currently on TODAY | Moves to | Reason |
|---|---|---|
| Full `FitnessCurveChart.jsx` | PROGRESS (as `BanisterChart.tsx`) | Too dense for hero; users don't read CTL-family metrics at a glance |
| Active plan block | TRAIN | Plan progress is a planning concern |
| Duplicate `VIEW PLAN` button | Removed | Only one needs to exist |
| Duplicate `RIDE TODAY` button | Removed | Single primary CTA |
| `0%` circular progress on plan | Removed from TODAY | Metadata, not content |
| Full coach chat block | Side panel / modal | Not hero-worthy real estate |
| `YESTERDAY` card in top strip | Recent Rides | Same content, better home |
| Top accent stripe (colored bar) | Removed | Redundant with retro stripe at nav |
| Powered-by attribution | Settings page | Vertical space waste on hero |
| `ProprietaryMetricsBar.tsx` (EFI 52 · TCAS 21) | Moved to PROGRESS in dedicated sections | Efficiency metrics are deep-dive, not hero |

### 1.9 Mobile behavior

All tiers stack vertically. No horizontal scroll, no carousels, no `display: none` toggles.

- Tier 1: CTAs stack vertically (full width each)
- Tier 2: FAR card drops below race readiness card when race is within 30 days; otherwise FAR on top (proximity-based priority)
- Tier 3: Recent Rides map reduces to 100px height
- Tier 4: sneak preview drops to single row — stats inline with chart below

---

## 2. PROGRESS page (new)

### 2.1 Purpose

Home for deep analytics. Relocates the Banister chart from TODAY and adds FAR history, TCAS history, EFI trend, and additional deep-dive views.

**Target user:** mid-engagement-or-higher users answering questions like:
- Is my fitness improving over 6 months, not just 6 weeks?
- How efficiently am I training per hour (TCAS)?
- How do my race results correlate with TFI/FS at race time?
- Where are my consistency gaps?
- Am I executing workouts as prescribed (EFI)?

Casual users should never need to visit PROGRESS. Power users should find it indispensable.

### 2.2 Page structure

```
┌─────────────────────────────────────────────────────────┐
│ PROGRESS                                                │
│ 6-month overview                            [time range]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─ FITNESS · FATIGUE · FORM (Banister chart) ────────┐ │
│ │ [large chart, 400px tall, 6 months]                │ │
│ │ TFI / AFI / FS legend · peak / trough markers       │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ FAR HISTORY ──────────────┐ ┌─ TCAS HISTORY ──────┐ │
│ │ [6mo FAR with zone bands]   │ │ [6mo TCAS]          │ │
│ └─────────────────────────────┘ └─────────────────────┘ │
│                                                         │
│ ┌─ EFI TREND ────────────────┐ ┌─ VOLUME BY ZONE ────┐ │
│ │ [weekly EFI line]            │ │ [stacked bars]      │ │
│ └──────────────────────────────┘ └─────────────────────┘ │
│                                                         │
│ ┌─ RACE CORRELATION (≥3 races required) ──────────────┐ │
│ │ [past races + TFI/FS at race day]                   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ CONSISTENCY HEATMAP ───────────────────────────────┐ │
│ │ [GitHub-style year view of training days]           │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Banister chart (primary section)

**The direct relocation of current TODAY `FitnessCurveChart.jsx`, with more room to breathe.**

**Changes vs. current implementation:**
- Chart height: 400px (was 240px)
- Default time range: **6 months** (was 6 weeks)
- Time range selector: 6w / 3m / 6m / 1y / all
- Y-axis gridlines and labels visible at every 10 TFI points
- Race markers: vertical dashed lines at past races, hover tooltips with race name + result
- Peak markers: callouts at TFI peaks ("Historical peak: 62 · Aug 14, 2025")
- Rest week shading: subtle gray background on weeks where TFI trended down deliberately

**Retained from current:**
- Color palette (teal TFI, coral dashed AFI, gold FS)
- Workout-intensity dots on TFI line (recovery / tempo / sweet spot / VO2 / race colors)
- TODAY marker on right edge

**Acronym labeling:** Header is "FITNESS · FATIGUE · FORM" (full names). Axis labels use acronyms (TFI / AFI / FS) since header established them. Tooltips on each.

**Component spec:**

```typescript
interface BanisterChartProps {
  series: Array<{
    date: string;
    tfi: number;
    afi: number;
    fs: number;
    dayType?: 'recovery' | 'tempo' | 'sweet_spot' | 'vo2' | 'race' | 'rest';
  }>;
  races?: Array<{ date: string; name: string; result?: string }>;
  range: '6w' | '3m' | '6m' | '1y' | 'all';
  onRangeChange: (range: string) => void;
}
```

Location: `src/components/progress/BanisterChart/BanisterChart.tsx`

**Migration:** Existing `<FitnessCurveChart>` becomes `<BanisterChart>`. Data-fetching hooks stay; component file moves, rendering expands. Old path deleted once TODAY redesign ships.

### 2.4 FAR history section

Time-series view of FAR score over selected range, with zone bands as background. Complement to Banister — Banister shows *what* training load looks like; FAR history shows *how sustainable* the trajectory has been.

Same visual vocabulary as FARCard on TODAY, extended to longer time range.

### 2.5 TCAS history section *(moved from TODAY)*

Weekly TCAS scores over time. Shows training-efficiency trajectory for power-data users. Labeled "TRAINING CAPACITY ACQUISITION SCORE · TCAS" on first render (acronym discipline).

**Coverage caveat:** Users with incomplete power data see "TCAS requires power data for most rides" empty state rather than low-confidence values. Bible §5.3 governs this.

### 2.6 EFI trend section

Weekly EFI score over time. Labeled "EXECUTION FIDELITY INDEX · EFI" on first render.

Flat line at 100% = perfect execution. Dips below indicate missed or deviated workouts. Useful for users debugging why fitness gains have stalled.

### 2.7 Volume by zone section

Weekly stacked bar chart showing time-in-zone distribution (Z1–Z5+). Classic polarized-training analysis. Uses `HR Zones` supporting analytics data.

### 2.8 Race correlation section

Past races with TFI + FS at race day, plotted over time. Shows users what their personal "ready to race" window looks like.

**Empty state:** "Log 3 races to unlock race correlation" when user has fewer than 3 races in history.

### 2.9 Consistency heatmap section

GitHub-style calendar heatmap for the year. Each day = a cell, color intensity = RSS that day. Gray = no training. Makes consistency gaps visible at a glance.

### 2.10 Scope note

Only the Banister chart move and FAR history are in scope for the first PROGRESS ship. TCAS history, EFI trend, volume by zone, race correlation, and consistency heatmap are later phases. Initial page ships with Banister + FAR history + "More views coming soon" placeholders.

---

## 3. Implementation phases

### Phase 1 — Tier 1 consolidation (no new metric)

**Smallest viable ship.** Clean up TODAY without introducing FAR. Proves the architectural approach.

- [ ] Component: consolidated Tier 1 (workout + route match + coach check-in in one card)
- [ ] Remove duplicate `RIDE TODAY` and `VIEW PLAN` buttons
- [ ] Move coach chat to side panel / modal (not full-width block)
- [ ] Remove active plan block from TODAY, reference it in page subtitle instead
- [ ] Remove top accent stripe, move to settings pages
- [ ] Remove `Powered by Strava / Garmin` attribution, move to integrations page

**Scope:** ~2 dev days.

### Phase 2 — PROGRESS page + Tier 4 sneak preview

Relocate Banister chart, create PROGRESS destination.

- [ ] Route `/progress` created
- [ ] `BanisterChart.tsx` relocated from TODAY, expanded to 6-month default
- [ ] Time range selector (6w / 3m / 6m / 1y / all)
- [ ] `ProgressPreviewStrip.tsx` component on TODAY Tier 4
- [ ] Nav: Banister chart removed from TODAY
- [ ] Move `ProprietaryMetricsBar.tsx` (TCAS / EFI display) from TODAY to dedicated PROGRESS sections
- [ ] Acronym labeling compliance sweep on all relocated components

**Scope:** ~2 dev days.

**Prerequisite:** `TFI canonical-column population` gap closed (bible §12).

### Phase 3 — FAR MVP + Tier 2 launch

FAR metric ships (see `FAR_implementation_checklist.md` Phase 1). Race readiness card ships.

- [ ] FAR MVP shipped (universal ceiling, see FAR checklist)
- [ ] `FARCard.tsx` in TODAY Tier 2
- [ ] `RaceReadinessCard.tsx` in TODAY Tier 2
- [ ] Race projection logic (`projected_tfi`, `projected_form`, valence coloring)
- [ ] Acronym labeling discipline applied (FULL NAME · ACRONYM headers, tooltips)

**Scope:** ~3 dev days.

**Prerequisite:** P2 acronym labeling sweep from FAR checklist (`ProprietaryMetricsBar.tsx` no longer renders bare acronyms).

### Phase 4 — Tier 3 rework + FAR personalization

Complete Tier 3, add personalized FAR ceiling.

- [ ] Tier 3: `This Week` extended with remaining-workouts list
- [ ] Tier 3: `Recent Rides` reduced to 3 visible + show more
- [ ] Onboarding additions: `years_training`, `masters_cat` questions
- [ ] FAR personal ceiling model (see FAR checklist Phase 3)
- [ ] FAR ceiling line on FARCard chart
- [ ] Monthly ceiling recompute cron
- [ ] "Ceiling updated" notification system

**Scope:** ~4 dev days.

### Phase 5 — PROGRESS depth + polish

PROGRESS becomes the full destination.

- [ ] FAR history section on PROGRESS
- [ ] TCAS history section on PROGRESS
- [ ] EFI trend section on PROGRESS
- [ ] Volume by zone section
- [ ] Race correlation (if ≥3 races logged)
- [ ] Consistency heatmap
- [ ] Stale sync warning states
- [ ] Detraining UI treatment (FAR coral, recovery copy)
- [ ] Visual regression tests

**Scope:** ~4–5 dev days.

---

## 4. Testing

### 4.1 Visual regression

Snapshot tests (Chromatic or equivalent) for:
- Tier 1 consolidated workout card (workout + route + coach states)
- `FARCard` across all FAR zones
- `RaceReadinessCard` across all valence states
- `ProgressPreviewStrip`
- `BanisterChart` across all range selections

### 4.2 Integration tests

- TODAY page renders correctly for users in each stage (cold start / active / detraining / overreaching)
- PROGRESS page loads with correct defaults
- Navigation between TODAY and PROGRESS preserves context
- Race readiness projection logic at 3 / 7 / 14 / 30 / 60 days out

### 4.3 Acronym labeling audit

Manual QA sweep: every acronym rendered on TODAY or PROGRESS must pass the bible §9 discipline:
- First appearance per screen includes full name
- Tooltip on every acronym returns the correct description
- Long-form coach messages use full name first

Automate where possible: lint rule or test that fails if a component renders a raw `FAR`, `TCAS`, `EFI`, `TWL`, `TFI`, `AFI`, `FS`, `RSS`, `EP`, `RI` string without a corresponding label prop or tooltip prop.

---

## 5. Open questions

1. **Mobile Tier 2 ordering** — spec says race-proximity-based (race within 30 days floats to top). Worth testing with real users. Fallback: always FAR on top, race below.

2. **Coach chat affordance** — side panel on desktop feels right; mobile is trickier. Full-screen modal loses TODAY context; bottom sheet might work better. Worth testing both.

3. **Sneak preview metric selection** — current spec shows mini-Banister. Alternative: simpler single-line TFI trajectory. Banister is more recognizable to existing users but busier. Review during Phase 2 design.

4. **PROGRESS time range persistence** — persist selected range per user across sessions, or always default to 6m? Recommendation: persist, default 6m on first visit.

5. **PROGRESS entry point from FAR card `DETAIL →`** — should this deep-link to the FAR history section, or land on the Banister chart? Probably FAR history since that's what the user just clicked away from. Review during Phase 5.

6. **PROGRESS for cold-start users** — what do new users see on PROGRESS when they have < 28 days of data? Banister chart works fine. FAR history would be empty. TCAS history would be empty. Consider an "Expected at day N" educational view in place of empty charts.

7. **TCAS relocation timing** — FAR Phase 1 ships with TCAS still on TODAY, or bundled? Recommendation in FAR checklist is to keep TCAS on TODAY until PROGRESS has a home for it. Phase 3 should remove TCAS from `ProprietaryMetricsBar` and surface it on PROGRESS.

---

*End of TODAY + PROGRESS redesign spec.*
