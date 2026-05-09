# Tribos Metrics Rollout — Remaining Work

> ⚠️ **SUPERSEDED — DO NOT TREAT AS A ROADMAP.** As of 2026-05-09 the
> metrics rollout is frozen. The reader cut-overs and column drops
> described below are **abandoned**, not pending. See
> `docs/METRICS_ROLLOUT_FREEZE.md` for the current policy. This file is
> kept only as historical context for what *would* have been done.

**Status as of commit `dc374ac` on branch `claude/metrics-rollout-intg-b1-ft7AJ`.**

B0 through B10 have landed. The database carries every spec §2 canonical column, all formulas are on-spec, and coach voice + dashboard UI emit only the Tribos names. What's left is the tail of the safe-additive / cut-over discipline: each table still in dual-write needs its readers migrated and legacy columns dropped.

Work is grouped by urgency. Read `docs/TRIBOS_METRICS_SPECIFICATION.md` + the D1/D2/D4 amendments in `CLAUDE.md` before touching metric code.

---

## 1. Reader cut-overs + legacy column drops

These tables are in dual-write phase. Readers still use legacy column names; writers populate both. Each needs its own PR, following the D5 pattern (readers first, then drop). Scope is listed smallest → largest.

### 1a. `activities` reader cut-over + drop

**Writes** (already dual-written as of B9):
- `api/strava-webhook.js`, `api/strava-activities.js`, `api/fit-upload.js`, `api/utils/activityDedup.js`

**Readers to migrate** (SELECT lists + JS object-key usage):
- `api/utils/adaptiveTau.js` — reads `activities.normalized_power, tss, intensity_factor` in the 180-day lookback
- `api/utils/fitnessSnapshots.js` — `normalized_power`, `tss`, `intensity_factor` across `buildSnapshot`, `estimateTSSWithSource` callers
- `api/coach.js`, `api/coach-ride-analysis.js`, `api/coach-check-in-*.js`, `api/review-week.js`, `api/fitness-summary.js`
- `api/utils/advancedRideAnalytics.js`, `api/utils/assembleFitnessContext.js`, `api/utils/fitnessHistoryTool.js`, `api/utils/metricsComputation.js`, `api/utils/workoutSegmentMatcher.js`, `api/utils/segmentAnalysisPipeline.js`
- `api/process-deviation.js`, `api/deviation-resolve.js`
- `src/pages/Dashboard.jsx`, `src/pages/TrainingDashboard.jsx`, `src/utils/trainingPlans.ts`, `src/hooks/useTrainingPlan.ts`

**Migration to write after readers land**: `074_drop_activities_legacy.sql` — drop `activities.{normalized_power, intensity_factor, tss}`.

### 1b. `fitness_snapshots` reader cut-over + drop

**Readers** use `ctl`, `atl`, `tsb`, `weekly_tss`, `avg_normalized_power`:
- `api/coach.js` (query_fitness_history tool), `api/coach-ride-analysis.js:170`
- `api/utils/fitnessHistoryTool.js`
- `api/utils/assembleFitnessContext.js`
- `api/fitness-summary.js`, `api/review-week.js`
- `src/utils/fitnessHistory*.js` if present

**Migration to write**: `075_drop_fitness_snapshots_legacy.sql` — drop `ctl`, `atl`, `tsb`, `weekly_tss`, `avg_normalized_power`.

### 1c. `workout_adaptations` reader cut-over + drop

Writes happen via `api/deviation-resolve.js`, `api/process-deviation.js`, and the adaptation-generation flow. Readers hit the analytics dashboards + coach prompts.

Per migration 073 the canonical twins exist. Writers still only populate legacy columns — fold dual-write into the adaptation recorder first, then cut readers, then drop.

**Migration to write**: `076_drop_workout_adaptations_legacy.sql`.

### 1d. `planned_workouts` + `plan_deviations`

Dual-write needs to land first (the columns exist from migration 073 but nothing is writing to them yet). Touch points:
- `api/process-deviation.js` — writes `plan_deviations` and the deviation payloads
- `src/hooks/useTrainingPlan.ts` — upserts `planned_workouts` with `actual_tss`
- Training plan generators in `api/utils/planGenerator.js`

Then reader cut-over, then drop. **Migrations**: `077_drop_plan_deviations_legacy.sql`, `078_drop_planned_workouts_legacy.sql`.

> ⚠️ **Active gap — `planned_workouts.target_rss` is not in the schema.** Migration
> 073 added `actual_rss` to this table but deliberately omitted `target_rss`
> (see `database/migrations/078_drop_planned_workouts_legacy.sql:6-7` — the
> rename was deferred because `src/data/workoutLibrary.ts` template seed data
> still uses `target_tss`). The TypeScript type comment in
> `src/types/training.ts` *claims* the column exists; it doesn't. Production
> code in `api/correction-proposal-apply.js` reads/writes `target_rss` and
> silently fails. The event-anchored calendar bridge
> (`api/utils/eventAnchoredCalendarBridge.js`) currently writes `target_tss`
> as a workaround. This needs its own focused PR — see
> `docs/planned-workouts-target-rss-followup.md` for context and the
> next-session prompt.

### 1e. `training_segments` + `training_plan_templates`

Writer is `api/utils/segmentAnalysisPipeline.js`. Readers include the segment-analysis UI under `src/components/segments/` (if present) plus the training-plan-template generator. Same three-step pattern.

### 1f. `user_profiles.weekly_tss_estimate` → `weekly_rss_estimate`

Added as a twin in migration 073. Only writer is `src/pages/Settings.jsx` (onboarding profile form). Flip the writer, verify onboarding still seeds AFI/TFI correctly, then drop `weekly_tss_estimate` in a small migration.

---

## 2. Spec work that the additive PRs didn't wire in

### 2a. Wire `tfi_composition` into `upsertTrainingLoadDaily`

`computeTFIComposition(dailyEntries)` exists in `api/utils/fitnessSnapshots.js` (B6). Nothing calls it yet because the zone-data source was an open question:

> **Open**: pick one canonical source for per-activity zone distribution:
> - `activities.ride_analytics.zone_distribution_seconds`
> - `activities.fit_coach_context.power_zone_distribution`
> - `activities.power_curve_summary`

Once picked, extend the `upsertTrainingLoadDaily` caller sites (process-deviation, webhook ingest) to fetch the last τ_tfi days of activities, derive `{rss, aerobic_seconds, threshold_seconds, high_intensity_seconds}` per day, and pass the result through `payload.tfi_composition`. The column already accepts it.

### 2b. Wire `FSTargetBadge` into the dashboard

Component exists at `src/components/today/FSTargetBadge.tsx`. Needs:
1. A hook (e.g. `useNextRaceGoal(userId)`) that reads the next race from `race_goals` and normalizes the event type to one of the `FS_TARGETS` keys.
2. A render site — likely in `src/pages/Dashboard.jsx` between `ProprietaryMetricsBar` and `StatusBar`, or as a chip inside StatusBar's FORM cell.
3. Verify the 21-day window on a real user; confirm the ✓ / no-✓ band math matches design.

### 2c. Stream-based EP recomputation

`filterZeroPowerPoints(powerStream, speedStreamKmh)` is exported from both `api/utils/fitnessSnapshots.js` and `src/lib/training/fatigue-estimation.ts`. No caller.

Today `activities.effective_power` is populated from provider-computed normalized power (Strava's `weighted_average_watts`, FIT's stored NP). To honor spec §3.2 we'd need to recompute EP from the power + GPS-speed streams at ingestion, apply the zero-power filter, and persist both EP and the filtered sample count. That's roughly:

- Extend `api/utils/fitParser.js` to emit `power_stream` + `speed_stream` alongside the current summary.
- Add `recomputeEffectivePower(activity)` that calls `filterZeroPowerPoints` → 30-sec rolling avg → 4th-power mean → 4th root.
- Wire into `api/fit-upload.js` and the Garmin / Strava stream pulls.

Scope this as a separate spike; the ingestion pipeline changes are nontrivial.

### 2d. `tfi_tau` / `afi_tau` on `training_load_daily` rows

Columns were added in migration 070 and are optional in the `upsertTrainingLoadDaily` payload. Nothing is passing them. To snapshot the tau used for a given day's TFI/AFI computation, callers should read the current user's `tfi_tau` / `afi_tau` from `user_profiles` and thread them into the upsert payload. Small change in process-deviation + webhook paths.

---

## 3. Renaming deferred for blast-radius reasons

### 3a. `tsb-projection.ts` internals

`src/lib/training/tsb-projection.ts` is a pure forward-simulation engine (`stepDay`, `projectSchedule`, `projectAdjustmentOptions`, `classifyTSB`) keyed on `{ctl, atl, tsb}` object keys with dependent types `ProjectionState`, `DailyLoad`, `TSBZone`, `AdjustmentProjections`. It is bridged at the DB boundary in `api/process-deviation.js` and `api/training-load-projection.js`.

Renaming needs:
- `ProjectionState.{ctl, atl, tsb}` → `{tfi, afi, formScore}`
- `classifyTSB(tsb)` → `classifyFS(formScore)`
- `AdjustmentProjections` fields stay ("planned", "no_adjust" etc., not trademarked)
- `CTL_TIME_CONSTANT`, `ATL_TIME_CONSTANT`, `RACE_TSB_TARGET_LOW`, `QUALITY_TSB_THRESHOLD` in `src/lib/training/constants.ts` all rename
- 2 caller sites (process-deviation, training-load-projection) drop the bridge
- `src/lib/training/__tests__/tsb-projection.test.ts` — full rewrite (object keys change)

It's a ~300-line refactor with tests. Ship as its own PR.

### 3b. Legacy JS/TS identifiers across `src/utils/trainingPlans.ts` + friends

Files where `tss` / `ctl` / `atl` / `tsb` / `np` / `if` are internal variable names:
- `src/utils/trainingPlans.ts` (heavy — `calculateCTL`, `calculateATL`, `calculateTSB`, `estimateTSS`, `calculateTSS`, `interpretTSB`)
- `src/hooks/useTrainingPlan.ts`
- `src/pages/Dashboard.jsx`, `src/pages/TrainingDashboard.jsx`
- `src/utils/trainingPlanExport.ts`
- `api/utils/advancedRideAnalytics.js`
- `api/utils/metricsComputation.js`, `api/utils/workoutLibrary.js`, `api/utils/planGenerator.js`

These are user-invisible JS identifiers — nothing the athlete sees. Leaving them alone for now is fine; they're on the "eventually" list per spec §1's consistency checklist (`grep -ri "\.tss\b\|\.ctl\b..."` → zero results). Sweep as a code-hygiene PR after the DB-column drops land.

### 3c. `FitnessSummary.jsx` prop rename ✅ shipped (PR #652, commit `3b784e9`)

`FitnessSummary` now takes `{ tfi, afi, formScore, lastRideRss }`. The `/api/fitness-summary` handler validates + maps the new shape to `assembleFitnessContext`'s legacy parameter names at the boundary (that helper's internal rename is part of the deferred §1a/§1b cut-overs). Dashboard call site passes the legacy `trainingMetrics.ctl/atl/tsb` values under the new prop names — the `trainingMetrics` object itself still uses legacy keys internally, pending the §3b identifier sweep.

---

## 4. Spec §7 consistency checklist (verify before declaring done)

From `docs/TRIBOS_METRICS_SPECIFICATION.md`. Run these at the end to confirm:

- [ ] `grep -ri "\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b" src/` → zero hits
- [ ] `grep -ri "\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b" api/` → zero hits (currently many, resolved by §3 above)
- [ ] Charts previously showing CTL now show TFI with the correct formula
- [ ] `tfi_tau` + `afi_tau` read from `user_profiles`, never hardcoded 42 / 7 (`fitnessSnapshots.js` ✓ as of B4)
- [ ] `tfi_composition` populated for every activity with power data (blocked on §2a)
- [ ] `fs_confidence` stored for every `training_load_daily` row (✓ since A2/067)
- [ ] FS display shows `~` prefix when `fs_confidence < 0.85` (✓ since A2 StatusBar)
- [ ] FS target badge renders within 21 days of a scheduled race (blocked on §2b)
- [ ] `CLAUDE.md` + `AGENTS.md` reflect new metric names throughout (CLAUDE.md ✓ as of B0; AGENTS.md untouched — quick sweep)
- [ ] No coach message text contains "TSS", "CTL", "ATL", or "TSB" (✓ as of B7 for the main surfaces; verify after readers cut over so no new prompt text slips in)
- [ ] Every migration 069→073 runs cleanly on a fresh branch (integration test — run against a throwaway Supabase branch before merging the cut-over PRs)

---

## 5. Suggested PR sequence

Each is a standalone session, none cross-depend except as noted:

1. ~~`FitnessSummary` prop rename + API update (§3c)~~ — ✅ shipped PR #652.
2. `AGENTS.md` canonical-name sweep + §7 consistency grep cleanup (§4).
3. `activities` reader cut-over + drop (§1a + migration 074).
4. `fitness_snapshots` reader cut-over + drop (§1b + migration 075). Parallel to #3.
5. `tsb-projection.ts` internals rename (§3a).
6. Dual-write for `workout_adaptations` / `plan_deviations` / `planned_workouts`, then reader cut-over, then drops (§1c + §1d). Three PRs.
7. `training_segments` + `training_plan_templates` rename (§1e).
8. `user_profiles.weekly_rss_estimate` cut-over + drop (§1f).
9. `tfi_composition` wiring once zone-data source is chosen (§2a).
10. `FSTargetBadge` wiring (§2b).
11. `src/` JS identifier sweep (§3b).
12. Stream-based EP recomputation spike (§2c) — sized separately.

By the end of #8 the schema is clean. #9–12 are feature enhancements that don't block the rename.
