# Unit 1 — Wire today's prescription and fitness state into Route Builder

**Status:** Shipped to branch `claude/enhance-route-builder-LZLgA`
**Date:** 2026-05-18
**Spec:** "Unit 1 — Wire today's prescription and fitness state into Route Builder" (v2, 18 May 2026)

## What changed

The AI route-generation prompt now sees two new things every time a logged-in
user clicks Generate:

1. **Real fitness state** sourced from `training_load_daily` — weekly RSS load,
   TFI, AFI, form score (with Tribos Metrics Spec §5 display band), and
   confidence-aware framing.
2. **Today's prescribed workout** sourced from `planned_workouts` joined
   against the in-code `WORKOUT_LIBRARY` — name, category, target RSS,
   target RI, terrain type, focus area, full structure (warmup / main / cooldown
   with intervals), and coach notes.

Before this change, both blocks were hardcoded placeholders from
`getDefaultTrainingContext()` (`base_building / 100km / fresh / moderate`),
shipped to Claude on every generation regardless of who the user was or
what was on their plan today.

## Files touched

| File | Change | LOC |
|------|--------|-----|
| `src/utils/formBands.js` | New — §5 form-band + fs-confidence classifiers | +51 |
| `src/utils/promptBuilders.js` | New — workout-structure renderers + routing implications | +189 |
| `src/utils/enhancedContext.js` | Added `getFitnessState`, `getTodaysPrescription`; rendered both into `buildEnhancedRoutePrompt` | +160 / −5 |
| `src/utils/claudeRouteService.js` | TSS→RSS rename in fallback `buildRoutePrompt` | +1 / −1 |

Total: ~400 lines net add. No schema changes. No `RouteBuilder.jsx` edits.

## Deltas from the spec

The spec was implemented as written with five intentional deviations,
each verified against the current codebase:

1. **`WorkoutSegment.duration` is `number` (minutes), not a string**
   (`src/types/training.ts:324`). The spec's `parseDurationToSec` helper
   assumed string input. The renderer in `promptBuilders.js` works with
   numeric minutes directly and renders sub-minute durations as `"30s"`.
2. **The structure renderer is recursive.** Library entries like
   `thirty_thirty_intervals` have nested intervals (`work: [{ type: 'repeat',
   work: [...] }]`). The flat renderer in the spec wouldn't have covered
   them. `describeWorkRest` recurses through arrays and nested `repeat`
   nodes, producing output like `3× (8× (30s Z5 @ 130% FTP / 30s Z2 @ 60% FTP) / 5 min Z1)`.
3. **`getTrainingContext` was NOT replaced.** A new method
   `getFitnessState(userId)` was added alongside, because
   `buildCompletePreferencesFromTables` (the preferences UI path, line 840)
   consumes the legacy `currentTrainingPhase / weeklyVolume / fatigueLevel`
   shape. Replacing it would silently break the prefs UI without changing
   the call sites. The new method is purpose-built for the prompt path.
4. **Optional UX extension was deferred.** The spec flagged it as
   optional with risk-vs-value language; `RouteBuilder.jsx` is 213KB.
   Shipping data plumbing only this unit; the soft-default UX surface
   ("Today's workout: Z2 Steady 60 — [Use this] / [Generate something else]")
   is a clean follow-up.
5. **Coach notes whitespace is collapsed.** Some library `coachNotes`
   contain newlines; collapsing whitespace keeps the prompt's bullet-list
   structure intact.

## How it renders

### Steady workout (`foundation_miles`, Z2 endurance)
```
TRAINING CONTEXT:
- Primary goal: endurance
- Weekly load (RSS, 7-day): 412
- Training Fitness Index (TFI, long-term): 78
- Acute Fatigue Index (AFI, short-term): 91
- Form score: -9 (band: optimal training load)
- Last hard day: 2 day(s) ago

PRESCRIBED WORKOUT (Tuesday, May 19):
- Name: Foundation Miles
- Category: endurance
- Duration: 60 minutes
- Target stress (RSS): 55
- Target intensity (RI): 0.65
- Terrain type: flat
- Focus: aerobic_base
- Structure: 10 min warmup Z1 / main: 45 min Z2 @ 65% FTP — Steady Zone 2 / 5 min cooldown Z1
- Coach notes: The foundation of endurance training. ...

This route is for the prescribed workout above. The route's elevation, surface,
and turn density should support the prescribed intensity — not contradict it.
...
```

### Interval workout (`thirty_thirty_intervals`, VO2max)
```
PRESCRIBED WORKOUT (Wednesday, May 20):
- Name: 30/30 Intervals
- Category: vo2max
- Duration: 60 minutes
- Target stress (RSS): 85
- Target intensity (RI): 0.95
- Terrain type: flat
- Focus: vo2max
- Structure:
  • Warmup: 15 min Z2 @ 65% FTP
  • Main: 3× (8× (30s Z5 @ 130% FTP / 30s Z2 @ 60% FTP) / 5 min Z1 — Recovery between sets)
  • Cooldown: 10 min Z1
- Routing implications: main block needs a sustained 39+ minute uninterrupted
  section. Avoid stop signs, traffic signals, and intersections during the
  interval window. Short, repeating efforts — out-and-back or loop with a
  U-turn-friendly endpoint at the start of the main block is ideal.
- Coach notes: ...
```

### Low-confidence form
```
- Form score: ~-9 (band: approximately optimal training load, LOW confidence —
  limited recent ride data, weight this signal lightly)
```

### New user (no `training_load_daily` rows)
The fitness block degrades to a single line:
```
TRAINING CONTEXT:
- Primary goal: endurance
```
No nulls, no placeholders — the prompt just gets quieter.

## Stats Bible / freeze-policy compliance

- Canonical names (`RSS`, `TFI`, `AFI`, `FormScore`, `RI`) used in all new
  prompt copy. No `TSS / CTL / ATL / TSB / IF` in new output.
- Reads are canonical-first with legacy fallback per CLAUDE.md
  (`data.target_rss ?? data.target_tss ?? libraryEntry.targetTSS`).
- Form bands use Tribos Metrics Spec §5 **display cuts** (5 bands),
  not the scheduler's 4-zone classification in `tsb-projection.ts`.
- Confidence tiers per §5: `≥0.85` high / `0.60–0.85` moderate / `<0.60` low.
- `claudeRouteService.js:337` TSS→RSS rename in the fallback path
  (governance cleanup, surfaced because we were already in the file).
  Trademark-flagged language removed: no `(Training Stress Score)`
  parenthetical in any new prompt text.

## Verification gate (manual, per spec)

The spec defined eight verification steps. They are manual / database-bound
and require Travis's logged-in session. Quick guide:

1. Insert a row in `planned_workouts` for today with `workout_id =
   'foundation_miles'`, `completed = false`.
2. Open `/route-builder`, hit Generate, watch the browser console for
   "Sending prompt to secure API…" — read the prompt that follows.
3. Verify TRAINING CONTEXT contains real RSS/TFI/AFI values (not
   `base_building / 100 / fresh`), no `undefined` strings, no TSS.
4. Verify PRESCRIBED WORKOUT block is present with the workout's
   structure and coach notes.
5. Repeat with `workout_id = 'thirty_thirty_intervals'` — structure
   should render in the detailed multi-line form with a "Routing
   implications" line.
6. Delete the planned row (or set `completed = true`); regenerate —
   PRESCRIBED WORKOUT block should be absent, TRAINING CONTEXT still
   real.
7. Stub `fs_confidence = 0.45` on today's `training_load_daily` row;
   regenerate — form line should render with `~` prefix + LOW
   confidence hedge.
8. New-user sim: clear `training_load_daily` rows; regenerate — fitness
   block should be one line (just `Primary goal:`); no crashes.

## Out of scope (deferred)

Carried verbatim from the spec — nothing here was attempted in Unit 1:

- **Persona voice.** `user_coach_settings.coaching_persona` → prompt voice.
  Unit 2.
- **Conversational refinement** of route edits — Unit 3+.
- **`/route-builder-2` activation** — the v2 UI lives behind
  `user_profiles.route_builder_v2_enabled` (migration 090); parked until
  Unit 1 + Unit 2 land.
- **URL-param handoff cleanup.** `from=calendar&workoutType=...` is
  redundant now that `planned_workouts` is the source of truth, but
  removing it is part of Unit 3.
- **Fallback path consolidation** (`buildRoutePrompt` vs.
  `buildEnhancedRoutePrompt`). Keep both, decide later.
- **Road-preference learning.** Big enough to be its own unit.
- **UX surface for direct-navigation prescription.** The soft-default
  "Today's workout: X — [Use this] / [Generate something else]" card
  on `/route-builder` when there's no `?from=calendar` param. ~30 lines
  of JSX, very visible to Travis-as-user, but isolated from the data
  plumbing.

## Sanity-checked

- `node --check` passes on all four files.
- Pure helpers in `promptBuilders.js` + `formBands.js` exercised with
  `recovery_spin` / `foundation_miles` / `thirty_thirty_intervals`
  shapes from `WORKOUT_LIBRARY`; output matches the spec's expected
  shape (see `=== INTERVALS: detailed ===` and
  `=== INTERVALS: implications ===` blocks above).
- `npm run lint` and `npm run type-check` both have pre-existing
  configuration issues unrelated to this change
  (ESLint config migration; tsconfig `baseUrl` deprecation). Vitest
  binary is not installed in this environment — could not run the
  test suite locally.
