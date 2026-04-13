# Tribos Metrics — Multi-PR Implementation Plan (v2)

## Context

Tribos has a specification (April 2026) to migrate away from TrainingPeaks-
trademarked metric terminology (TSS, CTL, ATL, TSB, NP, IF) to Tribos-canonical
names (RSS, TFI, AFI, FS/form_score, EP, RI), AND to enhance several
calculations (terrain-aware stress, adaptive EWA time constants, data-quality
source/confidence tracking, TFI zone composition, Form Score confidence). FTP
stays.

**What went wrong on attempt #1**: the plan bundled the *rename* (mechanically
large, ~400 files, low conceptual risk) with the *enhancements* (conceptually
novel, ~10 files) into a single "PR 1 of 4". Even just the foundation hit
session-context limits before finishing. The code ended up half-renamed, tests
broken, and CI would fail.

**What's different this time**: rename and enhancements are treated as
*orthogonal tracks* that are independently shippable. Enhancements ship first
under the existing TSS/CTL/ATL/TSB naming (they add new columns and new helper
functions; they don't touch the old ones). The rename then happens in atomic
per-metric cutovers after enhancements are stable. UI and coach-voice work
comes last when the data layer has settled.

**Branch**: `claude/tribos-metrics-specification-ud77w` (already checked out).
Working tree is clean; nothing has been committed from attempt #1.

---

## Three Tracks, Ten PRs

Each PR is small, self-contained, reviewable, and leaves the codebase in a
working state. Targets: 5–40 files per PR, 1 session per PR.

### Track A — Enhancements (4 PRs, ship under existing naming)

These ship the user-visible value of the spec without touching legacy
identifiers. All new columns use descriptive names that work regardless of
whether metrics are called TSS or RSS (e.g. `*_source` not `rss_source`).
New helper functions use names that don't conflict with eventual rename (e.g.
`calculateTerrainMultiplier` is unambiguous).

- **PR A1 — Adaptive EWA time constants**
  - Migration: add `ewa_long_tau`, `ewa_short_tau`, `metrics_age` columns to
    `user_profiles` (NULLable; default 42 / 7 / NULL)
  - New module `src/lib/training/adaptive-tau.ts` exporting
    `calculateLongTimeConstant(age, variance)` and
    `calculateShortTimeConstant(age, currentLongEWA)` per spec §3.4/§3.5
  - Update existing `calculateCTL(dailyTSS, tau = 42)` and
    `calculateATL(dailyTSS, tau = 7)` in `src/utils/trainingPlans.ts` and
    `api/utils/fitnessSnapshots.js` to accept optional `tau` parameter;
    default preserves current behavior
  - `computeWeeklySnapshot` reads user's per-athlete tau from profile, passes
    in; falls back to defaults when age is NULL
  - New `api/utils/adaptiveTau.js` helper with
    `recomputeUserTauConstants(supabase, userId)` called by nightly cron
  - Settings UI: add simple "Age" field with tooltip explaining adaptive
    recovery windows
  - Spec decision: "Require age before adaptive applies; prompt users to add it"
  - Scope: ~7 files, 1 migration

- **PR A2 — Stress-score source + confidence persistence**
  - `training_load_daily` already has `tss_source` and `confidence` columns
    from migration 058; they're just not consistently populated. This PR
    starts populating them on every write path.
  - Update `estimateTSS` callers in `api/utils/fitnessSnapshots.js` +
    `api/utils/computeFitnessSnapshots.ts` to capture the tier that was used
    (power/hr/rpe/inferred) and persist it.
  - Add new column `fs_confidence` (numeric 4,3) to `training_load_daily` —
    a 7-day weighted average of daily confidence per spec §3.6
  - New helper `calculateFormScoreConfidence(last7DaysConfidence)` in
    `api/utils/fitnessSnapshots.js`
  - Tiny UI change: in `src/components/today/StatusBar.jsx`, prefix the FORM
    cell value with `~` when `fs_confidence < 0.85` and italic/muted when
    < 0.60 per spec §5
  - Scope: ~6 files, 1 migration

- **PR A3 — Terrain-aware stress score**
  - New helper `calculateTerrainMultiplier(avgGradePct, pctAbove6Pct, vam,
    elevPerKm)` in `src/utils/terrainMultiplier.ts` (formula from spec §3.1,
    cap 1.40). Extracted from existing TWL logic in
    `src/components/metrics/TWLCalculator.tsx` /
    `api/utils/advancedRideAnalytics.js` so TWL UI and RSS computation share
    one source of truth.
  - Update `calculateTSS(durationSeconds, np, ftp, terrainMultiplier = 1.0)`
    in `src/utils/trainingPlans.ts` and `estimateTSS` in
    `api/utils/fitnessSnapshots.js` to accept and apply the multiplier
    (default 1.0 preserves current behavior).
  - Pass terrain args from `activity.ride_analytics` inside
    `computeWeeklySnapshot`; store the raw multiplier on the activity row so
    UI can show "raw TSS" vs "terrain-adjusted TSS" later.
  - Also apply the spec's 1.30x MTB multiplier via
    `applyActivityTypeMultiplier`.
  - Spec decision: "Keep TWL UI, but also feed RSS" — no UI removals in this
    PR; the TWL card continues to render.
  - Scope: ~6 files, 0 migrations (just calc changes)

- **PR A4 — Effective Power from streams + TFI composition**
  - New helper `calculateEffectivePower(powerSamples, speedSamplesKmh?)` in
    `src/utils/effectivePower.ts`. 30-sec rolling average → 4th-power mean →
    4th root. Zero-power filter per spec §3.2: drop `power === 0` AND `speed
    > 5 km/h`; retain if power 0 AND speed < 5 km/h (intentional rest).
  - When `activity_streams.power_watts` data is available (migration 041),
    `computeWeeklySnapshot` calls this and compares result to stored
    `activities.normalized_power`. Stored NP column unchanged for now;
    optionally fills a new `effective_power_computed` column with the
    Tribos-canonical value.
  - Add `fitness_snapshots.ewa_composition` (jsonb) computed as
    `{aerobic_fraction, threshold_fraction, high_intensity_fraction}` from
    the last τ days of daily TSS split by zone (using existing
    `ride_analytics` on each activity).
  - Scope: ~5 files, 1 migration

After Track A: all enhancement features shipping, no renames yet. Users see
adaptive fitness windows, confidence indicators, terrain-aware TSS, and
fitness composition. Data layer still uses TSS/CTL/ATL/TSB names.

---

### Track B — Atomic renames (3 PRs, one metric cluster per PR)

Each rename PR does one DB migration + all dependent code updates in a single
atomic operation. Because each PR touches only one identifier cluster, grep
gives a complete list upfront and the cutover is mechanical.

Standard per-PR recipe:
1. Write DB migration (rename column + ALTER INDEX)
2. `grep -rln 'old_name'` to list every file touching the identifier
3. Surgical update per file (no other changes — pure rename)
4. Update TS types if applicable
5. `npm run type-check && npm run test:run`
6. Commit + push

- **PR B1 — Power identifiers: `normalized_power` → `effective_power`, `intensity_factor` → `ride_intensity`**
  - DB: rename on `activities`, `workout_adaptations` (planned_ &
    actual_intensity_factor, actual_normalized_power),
    `training_plan_templates.intensity_factor`,
    `training_segments.normalized_power`. Rename index
    `idx_activities_normalized_power` → `idx_activities_effective_power`.
  - Code: every `.select('...normalized_power, intensity_factor...')` and
    every `activity.normalized_power` access. Estimated ~30-40 files.
  - Function renames: `calculateIntensityFactor` → `calculateRideIntensity`
    in `src/utils/trainingPlans.ts` and `src/components/ActivityMetrics.jsx`.
  - Does NOT touch UI labels ("NP", "IF" in StatusBar/ActivityMetrics/etc.)
    — those stay until Track C.

- **PR B2 — Stress score: `tss` → `rss`**
  - DB: rename on `activities.tss`, `plan_deviations.{planned,actual}_tss`
    and `tss_delta`, `workout_adaptations.{planned,actual}_tss` and
    `tss_delta`, `user_training_patterns.avg_tss_achievement_pct`,
    `training_load_daily.tss` and `tss_source`, `fitness_snapshots.weekly_tss`,
    `user_profiles.weekly_tss_estimate`, `cross_training_activities.estimated_tss`,
    `activity_types.tss_per_hour_base` / `tss_intensity_multiplier`.
  - Rebuild the `calculate_cross_training_tss` SQL function + trigger from
    migration 033 to use new names.
  - Index rename: `idx_activities_tss` → `idx_activities_rss`.
  - Code: `calculateTSS` → `calculateRSS`, `estimateTSS` → `estimateRSS`,
    `TSSEstimate` → `RSSEstimate` (+ `.tss` field → `.rss`), `TSSSource` →
    `RSSSource`, `TYPE_TSS_PER_HOUR` → `TYPE_RSS_PER_HOUR`. Every
    `.select()` referencing `tss`. Every `const tss = …`.
  - Estimated ~40-50 files. Largest Track B PR. Consider pre-writing a
    checklist of file paths so the rename can be done mechanically in one
    session without drift.
  - Coordinates with PR A2 (rename `tss_source` → `rss_source` here).

- **PR B3 — Load/form: `ctl` → `tfi`, `atl` → `afi`, `tsb` → `form_score`**
  - DB: rename on `fitness_snapshots.{ctl,atl,tsb}`,
    `training_load_daily.{ctl,atl,tsb}`,
    `workout_adaptations.{ctg_at_time,atl_at_time,tsb_at_time}` →
    `{tfi_at_time, afi_at_time, form_score_at_time}` (preserving the
    legacy typo `ctg_at_time` gets fixed to `tfi_at_time` in this PR).
  - Rename constant + function: `CTL_TIME_CONSTANT` → `TFI_TIME_CONSTANT`,
    `calculateCTL` → `calculateTFI`, same for ATL/AFI, `calculateTSB` →
    `calculateFormScore`, `classifyTSB` → `classifyFS`, `ProjectionState
    { ctl, atl, tsb }` → `{ tfi, afi, form_score }`, `TSBZone` → `FSZone`,
    `interpretTSB` → `interpretFormScore`, `RankingContext.tsbGap` →
    `fsGap`, etc.
  - Coordinates with PR A1 (rename `ewa_long_tau` → `tfi_tau` and
    `ewa_short_tau` → `afi_tau` here; also rename `ewa_composition` →
    `tfi_composition` from PR A4).
  - Estimated ~40-50 files.

After Track B: data layer and calculation layer fully canonical.
Functionally identical behavior; code-level names match spec.

---

### Track C — UI + Coach voice + Docs (3 PRs)

- **PR C1 — UI labels + tooltips**
  - Update `src/lib/fitness/translate.ts` and `src/lib/fitness/tooltips.ts`
    (functions `translateCTL` → `translateTFI`, etc., display copy, color
    zone labels per spec §5).
  - Update component display strings in: `StatusBar.jsx` (sublabels "CTL —
    chronic training load" → "TFI — training fitness index" etc.),
    `FitnessBars.jsx` labels, `TrainingLoadChart.jsx` Recharts series names
    and badges, `ActivityMetrics.jsx` badge text ("NP", "IF", "TSS" →
    "EP", "RI", "RSS"), `ProprietaryMetricsBar.tsx` descriptions,
    `CoachStrip.jsx` TSB-threshold messages, `CoachCard.jsx` FS-threshold
    messages, landing `AnalyzeStep.jsx` demo labels,
    `TrainingDashboard.jsx` inline labels, `Dashboard.jsx`, `Progress.jsx`.
  - Add per spec §5: `~` prefix when `fs_confidence < 0.85` (already
    shipped in PR A2 for StatusBar; extend to TrainingLoadChart tooltips).
  - FS target badge per spec §5/§3.6: when a race event is within 21 days,
    render event-type target range next to current FS value.
  - Scope: ~20 files, 0 migrations.

- **PR C2 — Coach voice + system prompts**
  - `api/coach.js` system prompt rewrite per spec §6 (no trademarked
    abbreviations in user-facing text, plain English first, use
    `fs_confidence` to soften language when confidence is low, pass
    `ri_duration_context` alongside RI, pass `tfi_composition` in
    characterization prompts).
  - `api/coach-check-in-generate.js` context string updates.
  - `api/email.js` explainer HTML.
  - `docs/tribos_voice_bible.md` examples rewritten.
  - Scope: ~5 files, 0 migrations. Prose-heavy; benefits from careful
    review.

- **PR C3 — Docs + verification sweep**
  - `CLAUDE.md`: update project overview to reflect Tribos-canonical names;
    document the spec's deviation where we kept TWL UI.
  - `PROJECT_CONTEXT.md`, `COMPETITIVE_ANALYSIS.md`,
    `docs/Tribos2.0/tribos-ui-spec-v2.md`,
    `docs/fitness-stats-investigation-2026-04-04.md`,
    `docs/visual-hierarchy-guide.md` — prose updates.
  - Run the full spec §7 consistency checklist:
    - `grep -rni '\\.tss\\b|\\.ctl\\b|\\.atl\\b|\\.tsb\\b' src/ api/` → zero
    - `grep -rni 'normalizedPower|normalized_power|intensityFactor|intensity_factor' src/ api/` → zero
    - `grep -rni 'TSS|CTL|ATL|TSB' src/` → only in docs or comment context
    - Manual verification that FS display uses previous-day TFI/AFI
    - FS target badge renders on event-adjacent days
  - Scope: ~10 docs files + verification report.

---

## PR sequence and dependencies

```
A1  A2  A3  A4   →  B1  B2  B3   →  C1  C2  C3
```

- Track A PRs are independent of each other and of Track B — any order.
- Track B PRs are independent of each other (different columns) — any order.
- Track C PRs require Track B (they reference the new names); C1 can start
  once the relevant B PR lands.
- A2 / A4 add columns (`tss_source`, `fs_confidence`, `ewa_composition`,
  `ewa_long_tau`, `ewa_short_tau`) that will be renamed by B2/B3. The rename
  migrations in Track B handle those column names too.

Roughly, **~10 PRs across ~10 sessions**. Could be compressed if sessions
have more context room, but the default is "one PR per session, exit cleanly."

---

## Guardrails

- **Every PR must leave `npm run type-check` and `npm run test:run` green.**
  Each PR's last todo item is verification.
- **Per-PR grep sweep before commit**: after a rename PR, grep for the old
  identifier and ensure zero hits in `src/` + `api/` (OLD/ and docs excluded).
- **Migration dry-run before commit**: apply every DB migration to a Supabase
  branch copy and verify data integrity before pushing.
- **No mid-rename state on main**: each Track B PR is atomic. Even if it
  touches 40 files, it ships as one commit; the tree is consistent before
  and after.
- **Backwards-compat aliases are forbidden** (per spec §0, and per
  CLAUDE.md). If a rename needs to keep old names working, that's a sign
  the PR scope is wrong — split smaller.
- **Connection hygiene sweep** on every api/-touching PR: `grep -r
  "createClient" api/` should only return `supabaseAdmin.js`.

---

## Files to read before starting each PR

| PR | Primary files |
|---|---|
| A1 | `database/migrations/062_onboarding_profile.sql`, `api/utils/fitnessSnapshots.js`, `src/utils/trainingPlans.ts`, `src/pages/Settings.jsx` |
| A2 | `database/migrations/058_training_load_deviation.sql`, `src/lib/training/fatigue-estimation.ts`, `api/utils/fitnessSnapshots.js`, `src/components/today/StatusBar.jsx` |
| A3 | `src/components/metrics/TWLCalculator.tsx`, `api/utils/advancedRideAnalytics.js`, `src/utils/trainingPlans.ts`, `api/utils/fitnessSnapshots.js` |
| A4 | `database/migrations/041_activity_streams.sql`, `database/migrations/046_advanced_ride_analytics.sql`, `api/utils/fitnessSnapshots.js` |
| B1 | `database/migrations/030_activity_power_metrics.sql`, `database/migrations/034_workout_adaptations.sql`, `src/components/ActivityMetrics.jsx` + grep output |
| B2 | `database/migrations/030_activity_power_metrics.sql`, `033_cross_training_activities.sql`, `058_training_load_deviation.sql`, `src/lib/training/*`, `src/utils/trainingPlans.ts` + grep output |
| B3 | `database/migrations/026_fitness_snapshots.sql`, `034_workout_adaptations.sql`, `058_training_load_deviation.sql`, `src/lib/fitness/translate.ts`, `src/utils/trainingPlans.ts` + grep output |
| C1 | `src/lib/fitness/translate.ts`, `tooltips.ts`, `src/components/today/*`, `src/components/TrainingLoadChart.jsx`, `src/components/ActivityMetrics.jsx` |
| C2 | `api/coach.js`, `api/coach-check-in-generate.js`, `api/email.js`, `docs/tribos_voice_bible.md` |
| C3 | `CLAUDE.md`, all `docs/*.md` + project-root `*.md` |

---

## Locked decisions from previous discussion

- **Rename columns in place** (not a new canonical table structure)
- **Require age before adaptive tau applies** — fall back to 42/7 when
  `metrics_age IS NULL` (Settings prompt in PR A1)
- **Keep TWL UI** — TWL card stays visible in `ProprietaryMetricsBar`;
  terrain multiplier *also* feeds into RSS. Spec deviation; documented in C3.
- **Activity type MTB multiplier 1.30x** applied in PR A3 per spec §3.1
- **HRV modulation scaffolded not implemented** — `applyHRVModulation`
  helper added in PR A1 as no-op; tracked as future work.

---

## Starting point

Next session to execute this plan should:
1. Read this plan file
2. Pick PR A1 (adaptive tau) — smallest, most self-contained first PR
3. Launch one Explore subagent to map exactly which files need touching
4. Implement → verify → commit → push
5. Update this plan file with a "status" section noting A1 is shipped
6. Stop

Each subsequent session picks the next PR, repeats.
