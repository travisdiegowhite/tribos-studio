# Part 2: Athlete State + Plan / Block Context

## 3. Athlete state — the "freshness" inputs

### Tables and columns

#### `fitness_snapshots` (weekly)

Defined in `database/migrations/026_fitness_snapshots.sql`. Canonical
columns added by `072_activities_snapshots_rename.sql` (dual-write).

| Canonical | Legacy | Type | Meaning |
|-----------|--------|------|---------|
| `tfi` | `ctl` | INTEGER | Training Fitness Index / Chronic Training Load |
| `afi` | `atl` | INTEGER | Acute Fatigue Index / Acute Training Load |
| `form_score` | `tsb` | INTEGER | Form Score / Training Stress Balance |
| `weekly_rss` | `weekly_tss` | INTEGER | Weekly total |
| `avg_effective_power` | `avg_normalized_power` | INTEGER | |

Other columns: `id`, `user_id`, `snapshot_week DATE` (Monday of ISO
week, UNIQUE per user), `snapshot_date TIMESTAMPTZ`, `ftp`,
`ftp_source`, `weekly_hours`, `weekly_ride_count`, `weekly_distance_km`,
`weekly_elevation_m`, `peak_20min_power`, `zone_distribution JSONB`
(e.g. `{"z1": 5, "z2": 45, ...}`), `load_trend` (`'building'` |
`'maintaining'` | `'declining'` | `'recovering'`), `fitness_trend`
(`'improving'` | `'stable'` | `'declining'`), `activities_analyzed`,
`computation_notes`.

Computed weekly by cron — see "freshness" below.

#### `training_load_daily` (daily)

Defined in `database/migrations/058_training_load_deviation.sql`.
Canonical columns added by
`070_training_load_daily_rename.sql`. Terrain class added by
`068_terrain_class.sql`.

| Canonical | Legacy | Type | Meaning |
|-----------|--------|------|---------|
| `rss` | `tss` | NUMERIC(6,2) | Daily training stress |
| `tfi` | `ctl` | NUMERIC(6,2) | |
| `afi` | `atl` | NUMERIC(6,2) | |
| `form_score` | `tsb` | NUMERIC(6,2) | |
| `rss_source` (6-tier) | `tss_source` (4-tier) | TEXT | See enum below |

Other columns: `id`, `user_id`, `date` (UNIQUE per user),
`confidence NUMERIC(4,2)`, `terrain_class` (`'flat'` | `'rolling'` |
`'hilly'` | `'mountainous'`, migration 068), `tfi_composition JSONB`
(`{aerobic_fraction, threshold_fraction, high_intensity_fraction}`),
`tfi_tau`, `afi_tau` (snapshots of adaptive tau values).

`rss_source` enum (canonical, 6 tiers per spec amendment D1):
`device | power | kilojoules | hr | rpe | inferred`.
`tss_source` enum (legacy, 4 tiers): `power | hr | rpe | inferred`.

Per CLAUDE.md amendment D2, confidence values are calibrated:
`device` 0.95 / `power` 0.95 / `kJ-with-FTP` 0.75 / `kJ-no-FTP` 0.50 /
`hr` 0.65 / `inferred` 0.40.

Updated whenever an activity is processed (Strava/Garmin/Wahoo
webhooks). The dual-write helper is `upsertTrainingLoadDaily` (see
migration 070 comment).

#### `activity_efi` — Execution Fidelity Index

`database/migrations/055_proprietary_metrics.sql`:

```sql
CREATE TABLE activity_efi (
  id, user_id, activity_id, workout_id (FK → planned_workouts),
  planned_tss, actual_tss,
  planned_zones JSONB, actual_zones JSONB,
  rolling_window_sessions JSONB,
  vf NUMERIC(5,4), ifs NUMERIC(5,4), cf NUMERIC(5,4),  -- sub-scores 0–1
  efi NUMERIC(5,2),                                     -- composite 0–100
  efi_28d NUMERIC(5,2),                                 -- 28-day rolling
  computed_at TIMESTAMPTZ
);
```

#### `activity_twl` — Terrain-Weighted Load

```sql
CREATE TABLE activity_twl (
  id, user_id, activity_id (UNIQUE),
  base_tss, vam, vam_norm, gvi, mean_elevation, alt_term,
  alpha_component, beta_component, gamma_component, m_terrain,
  twl NUMERIC(8,2),
  computed_at TIMESTAMPTZ
);
```

Per CLAUDE.md amendment D4, the terrain multiplier applies only to
`kJ` and `inferred` RSS tiers, not all tiers.

#### `weekly_tcas` — Time-Constrained Adaptation Score

```sql
CREATE TABLE weekly_tcas (
  id, user_id, week_ending DATE (UNIQUE per user),
  ctl_now, ctl_6w_ago, avg_weekly_hours, fv,
  ef_now, ef_6w_ago, pa_hr_now, pa_hr_6w_ago,
  p20min_now, p20min_6w_ago, years_training,
  he, eft, adi, ppd, aq, taa,    -- sub-scores
  tcas NUMERIC(5,2)               -- composite 0–100
);
```

### Hooks and endpoints

#### `useTodayTerrain` — `src/hooks/useTodayTerrain.ts`

```typescript
function useTodayTerrain(
  userId: string | undefined | null
): TerrainClass | null
```

**Important**: this hook returns the most-recent
`training_load_daily.terrain_class` for the user, **not** today's row.
If the user hasn't ridden today, the value is from their last ride
date. Returns `null` while loading or if the most-recent row is
pre-migration-068. Mirrors `useFormConfidence.ts` query pattern.

#### Other related hooks

- `src/hooks/useFormConfidence.ts` — most-recent `fs_confidence`
  (migration 067)
- `src/hooks/useDeviations.ts` — plan deviations (migration 058)
- `src/hooks/useWorkoutAdaptations.ts` — workout adaptations
  (migration 034)
- `src/hooks/useFormConfidence.ts`, `useTodayTerrain.ts`,
  `useDeviations.ts`, `useWorkoutAdaptations.ts` — these are the
  individual point-lookups; there is **no** combined "today snapshot"
  hook that returns TFI + AFI + FS + terrain in one call.

#### `/api/fitness-summary.js`

`POST /api/fitness-summary`
- **Auth**: Bearer (Supabase JWT)
- **Body**:
  ```json
  {
    "surface": "today" | "post_ride" | "coach",
    "clientMetrics": { "tfi", "afi", "formScore", "lastRideRss",
                       "ctlDeltaPct" },
    "rideId", "forceRefresh", "timezone"
  }
  ```
- **Response**: `{ summary: string }` — 1–2 sentences in plain English
- **Model**: Claude Haiku 4.5
- **Cache**: 4-hour TTL in `fitness_summaries` table (migration 054),
  `UNIQUE(user_id, surface)`
- **Voice rules** (per system prompt): Uses Tribos terminology (RSS,
  TFI, AFI, FS) — never legacy TrainingPeaks terms (TSS, CTL, ATL,
  TSB, NP, IF).

This is the language layer that maps numeric state to a human word.
The caller must already have the numeric values.

### Freshness / when data is computed

- `fitness_snapshots` — pre-computed weekly via cron at `0 3 * * 1`
  (Mondays 03:00 UTC), endpoint
  `/api/fitness-snapshots?action=compute-weekly`. **Not** computed on
  read. The compute function is `computeFitnessSnapshots()` in
  `api/utils/fitnessSnapshots.js`.
- `training_load_daily` — updated synchronously when an activity is
  ingested (Strava/Garmin/Wahoo/Coros webhooks).
- `activity_efi`, `activity_twl` — computed per-activity at ingest.
- `weekly_tcas` — weekly compute (see migration 055).
- `fatigue_checkins` (migration 058) — manual user input table for
  morning readiness check-ins (`leg_feel`, `energy`, `motivation`,
  `hrv_status`). Backend-ready; no Today-view UI uses it yet.

---

## 4. Plan / Block Context

### Tables

#### `training_plans` (migration 009 + later)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `template_id` | TEXT | Reference into `src/data/trainingPlanTemplates.ts` |
| `name` | TEXT | |
| `duration_weeks` | INTEGER | Total weeks in plan |
| `methodology` | TEXT | `'polarized'`, `'sweet_spot'`, `'pyramidal'`, `'threshold'`, `'endurance'` |
| `goal` | TEXT | `'general_fitness'`, `'century'`, `'climbing'`, `'racing'`, … |
| `fitness_level` | TEXT | `'beginner'` \| `'intermediate'` \| `'advanced'` |
| `status` | TEXT | `'active'` \| `'paused'` \| `'completed'` \| `'cancelled'` |
| `started_at`, `ended_at`, `paused_at` | TIMESTAMPTZ | |
| `current_week` | INTEGER | DEFAULT 1 |
| `workouts_completed` | INTEGER | Auto-updated by trigger `update_plan_compliance()` |
| `workouts_total` | INTEGER | Auto-updated |
| `compliance_percentage` | NUMERIC | Auto-updated |
| `custom_start_day` | INTEGER | 0=Sun … |
| `auto_adjust_enabled` | BOOLEAN | |
| `sport_type` | TEXT | DEFAULT `'cycling'` (added in 042_running_support) |
| `priority` | TEXT | `'primary'` \| `'secondary'` (added in 061_multi_plan_support) |
| `target_event_date` | DATE | Adaptive plan duration target (added in 061) |

`061_multi_plan_support.sql` adds a unique index allowing only one
primary plan per user per sport type.

There is **no** `phase` or `block_type` column on the table. Phase is
derived (see below).

#### `race_goals` (migration 015)

| Column | Type | Notes |
|--------|------|-------|
| `id`, `user_id` | UUID | |
| `name` | TEXT | |
| `race_date` | DATE | |
| `race_type` | TEXT | `'road_race'`, `'criterium'`, `'time_trial'`, `'gran_fondo'`, `'century'`, `'gravel'`, `'cyclocross'`, `'mtb'`, `'triathlon'`, `'other'` |
| `priority` | TEXT | `'A'` (main) \| `'B'` (important) \| `'C'` (training race) |
| `distance_km`, `elevation_gain_m` | NUMERIC | |
| `location` | TEXT | |
| `goal_time_minutes`, `goal_power_watts`, `goal_placement` | mixed | Target goals |
| `actual_time_minutes`, `actual_power_watts`, `actual_placement` | mixed | Filled after race |
| `training_plan_id` | UUID | FK → `training_plans` |
| `route_id` | UUID | FK → `routes` (added in 063) |
| `status` | TEXT | `'upcoming'` \| `'completed'` \| `'cancelled'` \| `'dns'` |
| `notes`, `course_description`, `result_notes` | TEXT | |

Migration 083 also added TFI target columns to `race_goals` (see
`083_race_goals_tfi_targets.sql`).

#### DB functions on `race_goals`

```sql
get_upcoming_races(p_user_id UUID, p_days_ahead INTEGER DEFAULT 180)
  RETURNS TABLE (id, name, race_date, race_type, distance_km,
                 priority, days_until, goal_time_minutes,
                 goal_power_watts, goal_placement, notes)

get_next_a_race(p_user_id UUID)
  RETURNS TABLE (id, name, race_date, race_type, distance_km,
                 days_until, goal_time_minutes, goal_power_watts,
                 goal_placement)
```

Both `SECURITY DEFINER`. **No** frontend hook calls these directly
today — they exist in SQL only.

#### `user_profiles` — lightweight race target

`062_onboarding_profile.sql` adds:

| Column | Type | Notes |
|--------|------|-------|
| `target_event_date` | DATE | |
| `target_event_name` | TEXT | |
| `primary_goal` | TEXT | `'fitness'` \| `'event'` \| `'performance'` \| `'comeback'` |
| `preferred_terrain` | TEXT[] | `'road'`, `'gravel'`, `'mountain'`, `'mixed'` |
| `weekly_tss_estimate` | INTEGER | For ATL/CTL seeding |
| `experience_level` | TEXT | `'beginner'` \| `'intermediate'` \| `'advanced'` \| `'racer'` (from 054) |
| `weekly_hours_available` | INTEGER | |
| `onboarding_persona_set` | BOOLEAN | |
| `onboarding_completed` | BOOLEAN | |

These are simpler alternatives to a full `race_goals` row — handy if
the Today view wants to show "Boston, 47 days" without the user having
created a full race goal entity.

### Phase derivation (no DB column)

The `TrainingPhase` type lives in `src/types/training.ts`:

```typescript
export type TrainingPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery';
```

Phase is computed by:

1. Load the active plan from `training_plans` (`template_id`,
   `current_week`).
2. Look up the template via `getPlanTemplate(template_id)` from
   `src/data/trainingPlanTemplates.ts`.
3. Match `current_week` against the template's `phases` array.

Template phase shape:

```typescript
phases: [
  { weeks: [1, 2, 3], phase: 'base',     focus: 'Build aerobic base with Zone 2' },
  { weeks: [4],        phase: 'recovery', focus: 'Recovery week' },
  { weeks: [5, 6, 7], phase: 'build',    focus: 'Add VO2max intensity' },
  { weeks: [8],        phase: 'taper',   focus: 'Freshen up and test gains' }
]
```

`useTrainingPlan.ts` exposes the result as `currentPhase: TrainingPhase | null`.

**What's missing**: no derived hook returns
`{ weekInPhase, weeksInPhase, weeksRemaining }`. That arithmetic
(scanning the `phases` array to find the current entry, then computing
the offset) does not exist anywhere in the codebase.
