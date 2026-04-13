# PR A3 — Terrain-Aware Stress

## Context

Track A, PR #3 of the Tribos Metrics rollout. A2 (commit `189d33b`,
branch `claude/populate-tss-metadata-aaDGj`) shipped tier + confidence
tracking on every `training_load_daily` write.

A3 addresses a known weakness in `api/utils/fitnessSnapshots.js#estimateTSSWithSource`:
an hour on flat roads at threshold is **not** physiologically equivalent
to an hour with 800 m of climbing at the same average power, yet the
current estimator treats them identically for every tier except the
Tier-5 inferred heuristic (which does a naive `(elevationM / 300) * 10`
linear bump).

This PR adds a terrain multiplier that scales TSS upward for climbing-
heavy rides, records the terrain classification on `training_load_daily`
for transparency, and keeps the adjustment bounded + opt-outable so we
don't double-count stress on power-meter rides where NP already
reflects the effort.

## Prerequisites

- A2 merged — `estimateTSSWithSource` is the required entry point.
- Start a new branch off `main` once A2 is merged:
  `claude/implement-terrain-stress-A3`.

## What to build

### 1. Migration — `database/migrations/068_terrain_class.sql`

Add one column:

```sql
ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS terrain_class TEXT
    CHECK (terrain_class IS NULL
      OR terrain_class IN ('flat','rolling','hilly','mountainous'));
COMMENT ON COLUMN public.training_load_daily.terrain_class IS
  'Terrain classification (m/km) of the activity that produced this row. NULL when activity lacks distance/elevation (e.g. Zwift).';
```

No backfill — cron populates.

### 2. New helper — `classifyTerrain(distanceMeters, elevationGainMeters)`

In `api/utils/fitnessSnapshots.js`. Returns `'flat'|'rolling'|'hilly'|'mountainous'|null`.

Thresholds (m/km, aligned with the values already in use for
`src/utils/workoutRouteMatch.ts`):

| m/km | class |
|------|-------|
| < 8 | flat |
| 8 – 15 | rolling |
| 15 – 25 | hilly |
| ≥ 25 | mountainous |

Return `null` when distance ≤ 0 or elevation is missing — callers treat
`null` as "no terrain signal, apply multiplier = 1.0".

### 3. New helper — `terrainMultiplier(terrainClass)`

Returns the multiplier to apply to the baseline TSS:

| class | multiplier |
|-------|------------|
| `null` / `'flat'` | 1.00 |
| `'rolling'` | 1.05 |
| `'hilly'` | 1.10 |
| `'mountainous'` | 1.15 |

Keep the multipliers as exported constants so tests + future tuning
don't require edits in two places.

### 4. Apply in `estimateTSSWithSource`

Modify the function to:

1. Compute `terrainClass` once at the top (uses `activity.distance` and
   `activity.total_elevation_gain`).
2. Attach it to every return object: `{ tss, source, confidence, terrain_class }`.
3. **Only** scale TSS when the source is `'kilojoules'` or `'inferred'`
   (the tiers where the physiological cost isn't already baked in):
   - `'device'` — respect whatever Garmin/Wahoo computed; no scaling.
   - `'power'` — NP already reflects the climbing effort; no scaling.
   - `'hr'` — running; leave alone (terrain cost is already in HR).
   - `'kilojoules'` — kJ captures total work but not climbing-per-hour
     intensity; apply multiplier.
   - `'inferred'` — remove the existing crude `elevationFactor`
     computation (lines ~183–190) and replace with the multiplier.
     The duration + avg-watts heuristic stays; only the elevation
     component changes.

For transparency, `terrain_class` is still recorded on the returned
object even when the multiplier is 1.0 — this lets us analyze
terrain distribution across all users without distinguishing "no terrain
adjustment applied" from "terrain was flat".

### 5. Persist `terrain_class` in the upsert path

Extend `api/utils/trainingLoad.js#upsertTrainingLoadDaily` to accept and
write `payload.terrain_class`. Update both call sites in
`api/process-deviation.js` to pass it through from
`estimateTSSWithSource(...)` / `analysis.tss_estimate`.

**Note on the deviation path**: `analysis.tss_estimate` comes from
`src/lib/training/fatigue-estimation.ts`. That file will also need a
terrain-class field threaded through — the cleanest approach is:

- Add `terrain_class?: string` to `TSSEstimate` in
  `src/lib/training/types.ts`.
- Compute it in each `estimateFrom*()` function the same way
  `estimateTSSWithSource` does.
- For the two functions that already call `classifyTerrain`-equivalent
  logic implicitly (none today), just surface the classification
  without changing the TSS math.

If that's too much scope, a lighter option: compute `terrain_class` in
`process-deviation.js` inline from the fetched activity row and pass it
to the helper — `fatigue-estimation.ts` stays untouched.

### 6. Tests — `src/lib/training/__tests__/terrain-stress.test.ts`

Mirror the `form-confidence.test.ts` style. Cover:

- `classifyTerrain(0, 0)` → `null`
- `classifyTerrain(null, 500)` → `null`
- `classifyTerrain(50_000, 200)` → `'flat'` (4 m/km)
- `classifyTerrain(50_000, 500)` → `'rolling'` (10 m/km)
- `classifyTerrain(50_000, 1_000)` → `'hilly'` (20 m/km)
- `classifyTerrain(50_000, 2_000)` → `'mountainous'` (40 m/km)
- Boundary: exactly 8 m/km → `'rolling'` (inclusive lower bound)
- `terrainMultiplier` returns 1.00 / 1.05 / 1.10 / 1.15 for the four
  classes, 1.00 for `null`
- Integration: `estimateTSSWithSource` with a kilojoules-tier activity
  and 20 m/km gain returns a TSS strictly greater than the same
  activity with 5 m/km gain, and the multiplier matches the hilly
  ratio (1.10)
- `estimateTSSWithSource` with a power-tier activity (NP + FTP) returns
  identical TSS regardless of terrain — only `terrain_class` differs

### 7. Update existing tests

The Tier-5 assertions in any existing fitnessSnapshots tests need
re-baselining since the elevation math changes. Search for
`estimateTSS` in `api/**/*.test.{js,ts}` and `src/**/*.test.{js,ts,tsx}`
before editing — update expected values, don't skip tests.

## Files touched (target: ~5 files + 1 migration)

| File | Change |
|------|--------|
| `database/migrations/068_terrain_class.sql` | NEW |
| `api/utils/fitnessSnapshots.js` | ADD `classifyTerrain`, `terrainMultiplier`, `TERRAIN_MULTIPLIERS`; modify `estimateTSSWithSource` |
| `api/utils/trainingLoad.js` | Accept + persist `payload.terrain_class` |
| `api/process-deviation.js` | Thread `terrain_class` through both upsert call sites |
| `src/lib/training/types.ts` + `fatigue-estimation.ts` | Add `terrain_class` to `TSSEstimate` (or: compute inline in process-deviation.js if scope creeps) |
| `src/lib/training/__tests__/terrain-stress.test.ts` | NEW |

## Guardrails before commit

- `npm run test:run` green (existing + new terrain-stress tests + any
  re-baselined fitnessSnapshots tests).
- `npm run type-check` — no new errors beyond the pre-existing baseline.
- **Connection hygiene** unchanged: `grep -r "createClient" api/` should
  still only hit `supabaseAdmin.js` and `user-activity.js`.
- **No changes to `training_load_daily` writes outside the helper** —
  the A2 pattern must hold.
- Spot-check in Supabase after apply: a ride via process-deviation
  writes `terrain_class` alongside the other columns.
- Sanity: a 50 km ride with 1000 m of gain via the kilojoules tier
  should produce TSS ≈ 10 % higher than the same ride with 200 m of
  gain. A power-tier ride should produce **identical** TSS regardless
  of gain.

## Does NOT belong in A3 (save for later PRs)

- No rename of `tss → rss`, `tss_source → rss_source` — that's PR B2.
- No climbing-specific coach-voice language — that's PR C2.
- No new column on `fitness_snapshots`.
- No adjustment to `'device'` / `'power'` / `'hr'` tiers — their source
  data already encodes terrain cost.
- No gradient-time-in-zone analysis from FIT streams — that's a later PR
  once the stream store lands.

## After merging

Update `docs/tribos-metrics-rename-plan.md` on
`claude/tribos-metrics-specification-ud77w` with a Status line noting A3
is shipped, then pick A4 (adaptive TSS variance) — or whichever PR is
next per the spec.

## Design rationale (read before coding)

1. **Why only scale kilojoules + inferred?** Power tier already
   reflects reality: the rider's body did the work, NP captured the
   intensity. Scaling it again double-counts. Kilojoules measures total
   work but assumes a uniform power distribution — climbing's
   non-uniform demand (sustained above threshold + recovery on descent)
   isn't captured. The inferred tier has no intensity signal beyond
   avg watts, so terrain *is* the best proxy we have.

2. **Why m/km and not VAM or gradient-distribution?** m/km is a single
   number we can compute from every activity today without FIT streams.
   VAM requires knowing climb vs descent time; gradient distribution
   requires elevation streams. Those are fidelity upgrades for a later
   PR; m/km is the 80 % solution.

3. **Why a 15 % cap?** Sport-science literature on climbing vs flat at
   matched power suggests 8 – 20 % additional internal stress depending
   on gradient and duration. 15 % at mountainous is conservative and
   won't cause runaway CTL for mountain-dwelling athletes.

4. **Why record the class even when multiplier = 1.0?** Supports future
   analytics ("what fraction of your rides are mountainous?") without
   requiring a backfill later.
