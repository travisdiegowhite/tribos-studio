# PR A3 — Terrain-Aware Stress

Part of the **Tribos Metrics** rollout (Track A). Follows:

- **A1** — Adaptive EWA time constants for CTL/ATL (migration `066`, commit `ce4b24f`)
- **A2** — TSS source + confidence + Form Score gating (migration `067`, commit `189d33b`)
- **A3** — Terrain-aware stress *(this PR)*

---

## Summary

Scale the **kilojoules** and **inferred** tiers of our TSS estimator by a
terrain-class multiplier (1.00 / 1.05 / 1.10 / 1.15), and persist
`terrain_class` on every row of `training_load_daily`. Power, HR, and
device tiers are left untouched — they already reflect climbing cost
through the measurement itself, so scaling them would double-count.

The change is scoped, capped at +15%, and applies only to new rows. No
historical backfill.

## Motivation

`estimateTSSWithSource` in `api/utils/fitnessSnapshots.js` under-counts
climbing stress on the two tiers that are blind to intensity:

- **Tier 4 — kilojoules** (`api/utils/fitnessSnapshots.js:177`). kJ ÷
  duration gives average power, which is then squared through IF. It
  ignores elevation entirely.
- **Tier 5 — inferred** (`api/utils/fitnessSnapshots.js:199`). Adds a
  flat `elevationM / 300 × 10` bonus but does not scale intensity with
  grade. A 10 km flat ride and a 10 km / 500 m grinder pick up the same
  bonus.

Concrete example: a 50 km ride with 1,500 m of climbing (30 m/km, clearly
mountainous) on a user with no FTP set and no power meter lands the
kilojoules tier with an estimate identical to a 50 km flat ride at the
same kJ output. In the field these two rides feel — and recover —
completely differently.

The same gap exists in `src/lib/training/fatigue-estimation.ts` at
`estimateFromType` (the type-inference Tier-4 fallback).

**Who this affects most:**

- Gravel / MTB riders on head units that don't emit Normalized Power.
- New users who haven't set an FTP yet (falls through kJ tier without
  the FTP-derived IF, confidence 0.50).
- Anyone using RPE-only logging on hilly days (via the fatigue engine's
  inferred tier).

## Changes

### 1. Migration `068_terrain_class.sql`

Adds a nullable `terrain_class` column to `training_load_daily`:

```sql
ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS terrain_class text
    CHECK (terrain_class IS NULL OR terrain_class IN
      ('flat', 'rolling', 'hilly', 'mountainous'));

COMMENT ON COLUMN public.training_load_daily.terrain_class IS
  'Terrain classification derived from distance + elevation gain, ' ||
  'used to scale kilojoule/inferred TSS tiers and surface context in the UI.';
```

No backfill. Historical rows stay `NULL`, which the UI and coach treat
as "unknown" (rendered as "flat or unknown" in the daily brief).

Style matches `database/migrations/067_fs_confidence.sql`.

### 2. Two new helpers in `api/utils/fitnessSnapshots.js`

```js
/**
 * Classify terrain from distance + elevation gain.
 * Threshold is elevation-per-kilometer (m/km):
 *   < 8      → flat
 *   8 to <15 → rolling
 *   15 to <25→ hilly
 *   >= 25    → mountainous
 * Returns 'flat' when distance is 0/missing (safe default).
 */
export function classifyTerrain(distanceM, elevationM) { /* ... */ }

/**
 * Terrain multiplier applied to kilojoules + inferred tiers only.
 *   flat         → 1.00
 *   rolling      → 1.05
 *   hilly        → 1.10
 *   mountainous  → 1.15
 * Unknown / null input → 1.00 (no scaling).
 */
export function terrainMultiplier(terrainClass) { /* ... */ }
```

### 3. Scoped application inside `estimateTSSWithSource`

Compute `terrain_class` once at the top of the function, and include it
on **every** return object regardless of tier — so downstream writers
can persist it uniformly without conditional logic.

Apply `terrainMultiplier(class)` only where the tier is demonstrably
blind to terrain:

- **Tier 1 — device** (`activity.tss`): not scaled.
- **Tier 2 — hr (running)** (`estimateRunningTSS`): not scaled; trail
  stress is already handled by the `trailFactor` and the elevation-heavy
  `elevationFactor = (elevationM / 200) * 10`.
- **Tier 3 — power** (NP + FTP): not scaled. NP already reflects the
  intensity cost of climbing.
- **Tier 4 — kilojoules**: multiply the final TSS before `Math.round`.
- **Tier 5 — inferred**: multiply
  `(baseTSS + elevationFactor) * intensityMultiplier` before `Math.round`.

### 4. Thread `terrain_class` through the write path

**`api/utils/trainingLoad.js` — `upsertTrainingLoadDaily`**

Extend the payload JSDoc and the upsert object to carry `terrain_class`:

```js
/** ...
 *   tss_source: 'device'|'power'|'kilojoules'|'hr'|'rpe'|'inferred',
 *   confidence: number,
 *   terrain_class: 'flat'|'rolling'|'hilly'|'mountainous'|null,
 * } */
```

**`api/process-deviation.js` — two call sites**

1. No-deviation path (`api/process-deviation.js:178`): pass
   `estimate.terrain_class`.
2. Deviation path (`api/process-deviation.js:208`): pass
   `analysis.tss_estimate?.terrain_class ?? null`.

### 5. (Optional, in-scope) fatigue-estimation.ts

If diff size permits, extend `src/lib/training/types.ts`:

```ts
export type TerrainClass = 'flat' | 'rolling' | 'hilly' | 'mountainous';

export interface TSSEstimate {
  // ...
  terrain_class?: TerrainClass;
}
```

…and apply the same multiplier inside `estimateFromType`
(`src/lib/training/fatigue-estimation.ts:188`). If scope creeps, split
this into a follow-up PR — the API-side change above stands alone and
delivers the bulk of the value.

## Scope — what does NOT change

- Stored `activities.tss` values from device files (Tier 1) are not
  modified.
- The NP / IF formula in Tier 3 is unchanged.
- The running TSS estimator (`estimateRunningTSS`) is unchanged.
- No backfill of existing `training_load_daily` rows. CTL/ATL already
  incorporate historical TSS; rewriting a year of rows 5–15% upward
  would cause an artificial fitness spike in every user's chart on the
  day the migration runs.
- No feature flag. The change is monotonic (estimates can only rise)
  and capped at +15%.

## Test plan

Mirror the `calculateFormScoreConfidence` test style in
`src/lib/training/__tests__/form-confidence.test.ts`.

**`classifyTerrain`**

- `classifyTerrain(0, 0)` → `'flat'`
- `classifyTerrain(50_000, 0)` → `'flat'` (zero elevation)
- `classifyTerrain(0, 500)` → `'flat'` (zero distance — safe default)
- Boundary: `classifyTerrain(1_000, 8)` → `'rolling'`;
  `classifyTerrain(1_000, 7.99)` → `'flat'`
- Boundary: `classifyTerrain(1_000, 15)` → `'hilly'`;
  `classifyTerrain(1_000, 14.99)` → `'rolling'`
- Boundary: `classifyTerrain(1_000, 25)` → `'mountainous'`;
  `classifyTerrain(1_000, 24.99)` → `'hilly'`

**`terrainMultiplier`**

- All four classes return the documented values (1.00 / 1.05 / 1.10 / 1.15).
- `null` / `undefined` / unknown string → `1.00`.

**`estimateTSSWithSource`**

For each of the below, assert that the returned object includes a
`terrain_class` field:

- **Tier 1 (device)**: stored `tss: 100` on a 50 km / 1,500 m ride
  returns `tss === 100` (unchanged by terrain).
- **Tier 3 (power)**: a ride with `normalized_power` and `ftp` returns
  an identical TSS regardless of whether `total_elevation_gain` is 0 or
  1,500 m.
- **Tier 4 (kilojoules)**: a 50 km / 1,500 m ride at 600 kJ without FTP
  returns `Math.round(baseTSS * 1.15)`; a flat 50 km / 0 m ride at
  600 kJ returns the pre-multiplier value.
- **Tier 5 (inferred)**: flat vs mountainous assertion mirrors Tier 4.

**Re-baseline**

Grep for existing assertions that lock in exact TSS values through the
inferred tier (`total_elevation_gain` usage inside
`api/utils/__tests__/` and `src/lib/training/__tests__/`) and update
them to the new multiplier-inclusive values.

## Design rationale

**Why only the kilojoule and inferred tiers get scaled.** Normalized
Power and heart rate already *measure* the cost of climbing: a rider
grinding up a 12% grade at 250 W NP has the metabolic cost baked into
NP, and their HR reflects it in Edwards TRIMP. Multiplying those tiers
by a terrain class would double-count. The kilojoule tier is work-only
(no intensity signal at all), and the inferred tier is duration plus a
flat elevation bonus — both genuinely miss grade-induced cost.

**Why elevation-per-kilometer instead of VAM or gradient streams.**
`total_elevation_gain` and `distance` are present on every activity row
from every provider (Strava, Garmin, Wahoo, manual FIT upload). VAM
requires climb-segment detection. Gradient streams require per-sample
altitude data we don't always have (especially on webhook-only sync
paths). m/km is crude but universal and cheap.

**Why the 8 / 15 / 25 m/km thresholds.** These match common cycling
categorization heuristics (Strava's "hilly" route tag lands around
10 m/km; Zwift's climbing routes average ~20 m/km). On a spot-check of
internal activity data, they place flat coastal rides in `flat`, mixed
suburban loops in `rolling`, regular hill rides in `hilly`, and alpine
GC days in `mountainous`.

**Why the +15% cap.** Empirical calibration: a 50 km / 1,500 m day at
~600 kJ estimates around 55 TSS through the kilojoule tier without an
FTP; scaling by 1.15 yields ~63 TSS, which is closer to (but still
conservative vs) what the same ride scores when you have a power meter.
A larger cap would overcorrect on days where the rider soft-pedaled the
climbs — the whole point of this tier is that we don't know the
intensity, so we bias slightly upward rather than dramatically.

**Why record `terrain_class` even when the multiplier is 1.00.** So the
UI can surface "flat endurance day" in the daily brief without a
separate query, and so we can audit terrain distribution across the
user base (and spot regressions in the classifier). Storage cost is a
single nullable text column, ~4 bytes per row.

**Why no backfill.** CTL and ATL integrate TSS historically. Rewriting
a year of `training_load_daily` rows upward by 5–15% would make every
user's fitness chart jump on migration day, which (a) is visually
alarming and (b) invalidates any training decisions anchored to prior
CTL values. New rows accrete correctly from launch forward; old rows
stay accurate under their prior estimator.

## Rollout

1. Merge this brief (docs-only, no behavior change).
2. Follow-up code PR: migration `068_terrain_class.sql` + helpers +
   test suite, reviewed as one commit against this brief.
3. No feature flag. Safe to deploy any time — only affects new rows and
   is capped at a documented +15%.
4. Post-launch: add `terrain_class` to the coach context window so the
   AI coach can say "that was a mountainous day, recover accordingly"
   without needing to recompute it from distance + elevation.

## Files referenced

- `api/utils/fitnessSnapshots.js` — `estimateTSSWithSource` at L154
- `api/utils/trainingLoad.js` — `upsertTrainingLoadDaily`
- `api/process-deviation.js` — upsert call sites at L178 and L208
- `src/lib/training/fatigue-estimation.ts` — `estimateFromType` at L188
- `src/lib/training/types.ts` — `TSSEstimate` interface at L9
- `database/migrations/067_fs_confidence.sql` — style template for 068
- `src/lib/training/__tests__/form-confidence.test.ts` — template for the
  new helper tests
