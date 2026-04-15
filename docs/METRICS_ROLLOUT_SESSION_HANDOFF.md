# Tribos Metrics Rollout — Session Handoff (2026-04-15)

## Context

This session pushed 10 branches covering §3c, §4, §1a–§1f, §3a, and a §3b starter
from the `docs/METRICS_ROLLOUT_REMAINING.md` tail. All are pushed, all 614 tests
pass on each branch, and migration SQL 074–080 is written (backfill-only; DROP
blocks commented out pending the full §3b identifier sweep). §3c merged as
PR #652; the rest are open branches awaiting review.

Two decisions were locked in at the end of this session:

- **§2a zone-data source**: `activities.fit_coach_context.power_zone_distribution`
  (best coverage for FIT ingestion; needs % → seconds conversion in the caller).
- **§3b scope**: staged per-file PRs, not one mega-PR.

---

## 1. Branches pushed this session (review/merge in this order)

All branches cut from main; force-rebased where noted. Recommended merge order
minimizes conflict risk.

| Order | Branch | Commit | What it does |
|---|---|---|---|
| 1 | `claude/metrics-rollout-consistency-sweep` | `508677a` | §4 — AGENTS.md metrics section + user-facing AI prompt text rewrites (TSS→RSS, CTL→TFI, ATL→AFI, TSB→FS, NP→EP, IF→RI) |
| 2 | `claude/metrics-rollout-activities-readers` | `093de7e` (force-pushed; rebased on §4) | §1a — activities reader cut-over + migration 074 backfill. **Conflict with §4 already resolved** — carries the `EP (effective power):` long-form labels on top of the column-reference rename. |
| 3 | `claude/metrics-rollout-fitness-snapshots-readers` | `1206b7f` | §1b — fitness_snapshots reader cut-over via Supabase column aliases (`ctl:tfi`) + migration 075 backfill |
| 4 | `claude/metrics-rollout-tsb-projection-rename` | `741cb0b` | §3a — tsb-projection.ts internals rename (ProjectionState keys, classifyTSB→classifyFS, constants) + test rewrite + bridge collapse in process-deviation.js / training-load-projection.js |
| 5 | `claude/metrics-rollout-workout-adaptations` | `b1b1a9f` | §1c — migration 076 backfill (workout_adaptations) |
| 6 | `claude/metrics-rollout-planned-workouts-deviations` | `22bcab0` | §1d — migrations 077 (plan_deviations) + 078 (planned_workouts) backfills |
| 7 | `claude/metrics-rollout-training-segments` | `fed1c4b` | §1e — migration 079 backfill (training_segments) |
| 8 | `claude/metrics-rollout-weekly-rss-estimate` | `e7ebffa` | §1f — onboarding dual-write + migration 080 backfill (user_profiles) |
| 9 | `claude/metrics-rollout-js-identifier-sweep-starter` | `49e8793` | §3b starter — `calculateTFI/AFI/FS` + `interpretFS` as canonical exports; legacy names kept as `export const` aliases |

**Known conflict risk** if merging in a different order:
- §1a ↔ §1b both touched `assembleFitnessContext.js`, `fitnessSnapshots.js`,
  `metricsComputation.js`, `checkInContext.js`, `fitnessHistoryTool.js`
- §1a ↔ §3a both touched `process-deviation.js`
- §4 ↔ §3a both touched `coach.js` (needs verification)

If you hit a conflict, note the branch pair and I'll rebase in the next session.

---

## 2. Remaining work (for tomorrow forward)

### 2a. §2a — Wire `tfi_composition` into `upsertTrainingLoadDaily` ← **unblocked**

Decision locked: source is `activities.fit_coach_context.power_zone_distribution`.

Work:
1. Extend `upsertTrainingLoadDaily` callers (`api/process-deviation.js`, Garmin/
   Strava webhook ingest paths) to fetch the last τ_tfi days of activities with
   `fit_coach_context` populated.
2. For each day's activities, convert `power_zone_distribution` (% of pedaling
   time per zone) to seconds by multiplying against `fit_coach_context.duration_seconds`.
3. Derive `{rss, aerobic_seconds (Z1+Z2), threshold_seconds (Z3+Z4), high_intensity_seconds (Z5+Z6+Z7)}`
   per day — zone bucketing matches spec §3.4.
4. Pass the derived array to `computeTFIComposition()` (already exported from
   `api/utils/fitnessSnapshots.js` — added in B6) and thread the result through
   `payload.tfi_composition` on the upsert.
5. Activities missing `fit_coach_context` (pre-B5, manual entries) fall back to
   skipping that day's composition — leave the row's `tfi_composition` as NULL.

Test path: trigger a webhook-ingested activity, confirm `training_load_daily.tfi_composition`
is populated with `{rss, aerobic_seconds, threshold_seconds, high_intensity_seconds}`.
Verify it sums back to total RSS within ±5%.

### 2b. §3b — Staged per-file JS identifier sweep ← **unblocked**

Decision locked: one PR per file or tightly-scoped group. Recommended sequence
(smallest surface first, unblocks DROP migrations in the same order):

| PR | Files | Unlocks |
|---|---|---|
| 3b-1 | `src/utils/adaptationTrigger.ts`, `src/utils/adaptationDetection.ts` | — |
| 3b-2 | `src/hooks/useTrainingPlan.ts` (actual_tss upsert, activity.tss reads) | partial §1d drop |
| 3b-3 | `src/hooks/useWorkoutAdaptations.ts` + `src/utils/adaptationDetection.ts` writer | §1c drop |
| 3b-4 | `src/components/ActivityMetrics.jsx`, `src/components/RideAnalysisModal.jsx`, `src/components/FormWidget.jsx` | partial §1a drop |
| 3b-5 | `src/components/planner/*.tsx` (TwoWeekCalendar, PlanCalendarOverview, PeriodizationView) | partial §1d drop |
| 3b-6 | `src/components/training/ActivityLinkingModal.jsx` | partial §1d drop |
| 3b-7 | `src/pages/Dashboard.jsx`, `src/pages/TrainingDashboard.jsx`, `src/pages/Progress.jsx` | §1a drop |
| 3b-8 | `src/types/database.ts`, `src/types/training.ts`, `src/types/checkIn.ts` | type safety |
| 3b-9 | `src/lib/training/fatigue-estimation.ts` (activity.normalized_power input key) | API boundary cleanup |
| 3b-10 | Test fixtures (`fatigue-estimation.test.ts`, `deviation-detection.test.ts`, `adaptive-tau.test.ts`) | — |
| 3b-11 | `src/utils/computeFitnessSnapshots.ts`, `src/utils/rideAnalysis.js`, `src/utils/demoData.js`, `src/components/admin/WorkoutTemplateManager.jsx` | admin/demo cleanup |
| 3b-12 | Retire the legacy `calculateCTL/ATL/TSB/interpretTSB` aliases from `src/utils/trainingPlans.ts` + default export | final hygiene |

After 3b-7 lands, migration 074 DROP block can be uncommented.
After 3b-3 + 3b-5 land, 076–078 DROPs can run.
After 3b-11 lands, 079 + 080 DROPs can run.

### 2c. DROP migration execution sequence

Once each §3b PR lands, uncomment the corresponding DROP block in the migration
file and run it manually against Supabase (per CLAUDE.md "Write SQL, don't run it").

Recommended run order (smallest blast radius first):

1. **080** (user_profiles.weekly_tss_estimate) — single column, writer already
   dual-writes, 1 reader file. Run after 3b-1 lands to be safe.
2. **079** (training_segments) — 2 columns, admin surface only.
3. **078** (planned_workouts) — 2 columns, unblocked by 3b-2/3b-5/3b-6.
4. **077** (plan_deviations) — 3 columns, unblocked by 3b-3.
5. **076** (workout_adaptations) — 8 columns, largest reader surface.
6. **075** (fitness_snapshots) — 5 columns, used by coach voice.
7. **074** (activities) — 3 columns, highest-traffic table; run LAST after full
   §3b sweep including Dashboard/TrainingDashboard is merged and production-stable.

Before uncommenting each DROP, run the verification query in the migration
header to confirm dual-write is complete for recent rows.

### 2d. §2b — FSTargetBadge wiring (deferred; needs design call)

Not blocked on input anymore — just a matter of time. Options you've parked:
- Standalone chip on Dashboard between `ProprietaryMetricsBar` and `StatusBar`
- Embedded chip inside StatusBar's FORM cell

Implementation sketch when you're ready:
1. Add `src/hooks/useNextRaceGoal.ts` that queries `race_goals` for the next
   upcoming event (ordered by priority asc, race_date asc), normalizes
   `race_type` to one of the `FS_TARGETS` keys from `src/components/today/FSTargetBadge.tsx`.
2. Gate render on `daysUntilRace <= 21 && daysUntilRace >= 0`.
3. Pass current formScore from `trainingMetrics.tsb` (or `.formScore` after §3b-7 lands).

### 2e. §2c — Stream-based EP recomputation (deferred indefinitely)

Skipped per your call. Pick this up only if you audit that the provider-computed
NP (Strava's `weighted_average_watts`, FIT's stored NP) diverges from
spec §3.2's zero-power-filtered 4th-power rolling average by enough to matter.
Most users won't notice; the infrastructure cost is high.

### 2f. `workout_templates.intensity_factor` rename

Migration 073 didn't add a canonical `ride_intensity` twin on `workout_templates`
(the admin-managed library). Leave it until you're touching admin UI for other
reasons — low traffic, no coach voice exposure.

---

## 3. Post-merge verification (run before declaring the rollout done)

Spec §7 consistency checklist. Run each grep after every merge cycle:

```bash
# Should have ZERO hits in runtime code (tests + comments ok):
grep -rn '\.tss\b\|\.ctl\b\|\.atl\b\|\.tsb\b' src/ api/ \
  | grep -v 'node_modules\|__tests__\|\.test\.\|/\*\|^//\|// '

# Schema cleanliness — run against Supabase after all DROP blocks land:
SELECT column_name FROM information_schema.columns
 WHERE table_name IN ('activities', 'fitness_snapshots', 'workout_adaptations',
                      'planned_workouts', 'plan_deviations', 'training_segments',
                      'user_profiles')
   AND column_name IN ('tss', 'ctl', 'atl', 'tsb', 'normalized_power',
                       'intensity_factor', 'weekly_tss', 'avg_normalized_power',
                       'weekly_tss_estimate', 'planned_tss', 'actual_tss',
                       'tss_delta', 'ctg_at_time', 'atl_at_time', 'tsb_at_time',
                       'planned_intensity_factor', 'actual_intensity_factor',
                       'actual_normalized_power', 'mean_normalized_power');
-- Expected: empty result set.
```

Coach voice sanity check: trigger `/api/coach`, `/api/coach-ride-analysis`,
`/api/fitness-summary`, `/api/review-week` end-to-end after the §1a + §1b merges
land. Confirm no response contains "TSS", "CTL", "ATL", "TSB", "NP", or "IF"
in user-visible output.

---

## 4. Smoke tests (per Tribos production checklist)

After each merge cycle, verify:
- [ ] Landing page renders (auth critical path — AGENTS.md §3.1/§3.2)
- [ ] Login + signup flow works end-to-end
- [ ] Dashboard loads, shows TFI/AFI/FS values in StatusBar
- [ ] Training Dashboard loads, CTL/ATL/TSB chart still renders (legacy identifier
      internally OK until §3b-7)
- [ ] AI Coach responds to a message without emitting legacy abbreviations
- [ ] Recent ride's Deep Ride Analysis renders without errors (§1a touches the
      SELECT + buildUserPrompt)
- [ ] Garmin sync + Strava sync each produce a new activity with both legacy +
      canonical columns populated (run the dual-write verification query)
- [ ] Weekly review generation (trainingPlannerStore.ts → /api/review-week) works

---

## 5. Files to NOT touch until §3b lands

These consumers spread legacy keys into JS objects via `select('*')`:
- `src/components/HistoricalInsights.jsx`
- `src/pages/TrainingDashboard.jsx`
- `src/utils/trainingPlans.ts` exports (legacy aliases intentional)
- Type definitions in `src/types/database.ts`, `src/types/training.ts`

They'll keep working through §1a–§1f merges because writers dual-write. They'll
break the day a DROP migration runs without §3b having retired them — do not
run DROP blocks early.

---

## 6. Open questions for next session (non-blocking)

1. Are any of the 9 open branches already under PR review? If so, what numbers?
2. Do you want me to open PRs for all 9 in the next session, or merge-as-I-go?
3. Should the §3b PRs each carry a migration DROP uncommenting, or should the
   DROPs ship in a separate small migration PR per table?
4. After §3b-12 (retire legacy aliases), do you want a final "rename hygiene"
   PR that sweeps comments/docstrings referencing the old names? Low priority.
