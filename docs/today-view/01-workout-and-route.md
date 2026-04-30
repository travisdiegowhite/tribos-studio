# Part 1: Today's Prescribed Workout + Route

## 1. Today's Prescribed Workout

### Primary table: `planned_workouts`

Defined in `database/migrations/009_training_plans.sql`, with columns
added in `012_add_planned_workouts_columns.sql` and history tracking
in `057_planned_workouts_history_tracking.sql`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `plan_id` | UUID | FK → `training_plans(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK → `auth.users(id)` (added in 012, NOT NULL in prod) |
| `week_number` | INTEGER | Week within the plan |
| `day_of_week` | INTEGER | 0=Sun … 6=Sat |
| `scheduled_date` | DATE | The filter for "today" — UNIQUE(plan_id, scheduled_date) constraint exists |
| `workout_type` | TEXT | `'rest'`, `'recovery'`, `'endurance'`, `'tempo'`, `'threshold'`, `'vo2max'`, etc. |
| `workout_id` | TEXT | Reference into the static `src/data/workoutLibrary.ts` (not a DB FK) |
| `name` | TEXT | Display name (added in 012, NOT NULL DEFAULT 'Workout') |
| `duration_minutes` | INTEGER | Planned duration (added in 012) |
| `target_tss` | INTEGER | Legacy — see metric rollout |
| `target_duration` | INTEGER | Minutes |
| `target_distance_km` | NUMERIC | Optional |
| `completed` | BOOLEAN | DEFAULT false |
| `completed_at` | TIMESTAMPTZ | |
| `activity_id` | UUID | FK to actual completed activity |
| `actual_tss`, `actual_duration`, `actual_distance_km` | mixed | Captured results |
| `difficulty_rating` | INTEGER | 1–5 |
| `notes`, `skipped_reason` | TEXT | |

**RLS**: users access their own rows via `user_id = auth.uid()` OR via
the parent plan's `user_id`.

### Hook: `src/hooks/useTrainingPlan.ts`

Signature:

```typescript
useTrainingPlan({
  userId: string | null;
  autoLoad?: boolean;
}): UseTrainingPlanReturn
```

Relevant returned methods (from `useTrainingPlan.ts:84–135`):

```typescript
plannedWorkouts: PlannedWorkoutWithDetails[];
currentPhase: TrainingPhase | null;
loadPlannedWorkouts: (weekNumbers?: number[]) => Promise<void>;
getWorkoutsForDate: (date: Date) => PlannedWorkoutWithDetails[];
getWorkoutsForWeek: (weekNumber: number) => PlannedWorkoutWithDetails[];
toggleWorkoutCompletion: (workoutId: string, completed: boolean) => Promise<boolean>;
```

There is **no** dedicated "today" endpoint or single-purpose
`useTodayWorkout()` hook. The pattern in use is:

```typescript
const { plannedWorkouts, getWorkoutsForDate } = useTrainingPlan({ userId });
const todays = getWorkoutsForDate(new Date());
```

The hook enriches `planned_workouts` rows with workout-library details
(structure, intervals, coach notes) at load time.

### Workout structure shape — `src/data/workoutLibrary.ts`

Each workout entry is keyed by string ID and conforms to the
`WorkoutDefinition` type in `src/types/training.ts`:

```typescript
interface WorkoutDefinition {
  id: string;                           // e.g. 'foundation_miles'
  name: string;
  category: WorkoutCategory;            // 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | ...
  difficulty: FitnessLevel;             // 'beginner' | 'intermediate' | 'advanced'
  duration: number;                     // minutes
  targetTSS: number;
  intensityFactor: number;
  description: string;
  focusArea: string;
  tags: string[];
  terrainType: 'flat' | 'rolling' | 'hilly';
  structure: {
    warmup?: { duration; zone; powerPctFTP; cadence? } | null;
    main: Array<{
      duration: number;
      zone: number;                     // 1–7
      powerPctFTP: number;
      cadence: string;                  // e.g. '85-95'
      description: string;
    }>;
    cooldown?: { duration; zone; powerPctFTP } | null;
  };
  coachNotes: string;
}
```

The `structure.main` array is the visualization primitive: each element
is one block with duration + zone + power % FTP. This is sufficient for
a bar-chart-style workout visualization without any additional schema.

Example (from `src/data/workoutLibrary.ts:74`):

```typescript
foundation_miles: {
  duration: 60, targetTSS: 55, intensityFactor: 0.65,
  structure: {
    warmup: { duration: 10, zone: 1, powerPctFTP: 50 },
    main: [{ duration: 45, zone: 2, powerPctFTP: 65, cadence: '85-95',
             description: 'Steady Zone 2' }],
    cooldown: { duration: 5, zone: 1, powerPctFTP: 45 }
  }
}
```

### Secondary path: `scheduled_workouts` (accountability coach)

`database/migrations/013_accountability_coach.sql` defines a separate,
lighter table:

```sql
CREATE TABLE scheduled_workouts (
  id UUID, user_id UUID, training_plan_id UUID,
  scheduled_date DATE NOT NULL,
  workout_type TEXT, target_duration_mins INTEGER,
  description TEXT, status TEXT,
  committed_time TIME, ...
);
```

It powers the "accountability coach" feature (commitment tracking, SMS
reminders) and is queried by the DB function:

```sql
get_todays_workout(p_user_id UUID)
  RETURNS table (id, workout_type, target_duration_mins, description,
                 status, committed_time)
```

`scheduled_workouts` is **not** the same as `planned_workouts`. The
main training plan path uses `planned_workouts`. Decide which one the
Today view reads from based on which surface is canonical for the
athlete's plan.

---

## 2. Today's Prescribed Route

### Primary table: `routes`

Defined in `database/create_routes_table.sql`. Key columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `name`, `description` | TEXT | |
| `distance_km` | NUMERIC | |
| `elevation_gain_m`, `elevation_loss_m` | INTEGER | |
| `estimated_duration_minutes` | INTEGER | |
| `geometry` | JSONB | GeoJSON LineString or MultiLineString — the polyline |
| `waypoints` | JSONB | Array of waypoint objects |
| `start_latitude`, `start_longitude` | FLOAT | |
| `end_latitude`, `end_longitude` | FLOAT | |
| `route_type` | TEXT | `'loop'` \| `'out_back'` \| `'point_to_point'` |
| `surface_type` | TEXT | `'paved'` \| `'gravel'` \| `'mixed'` |
| `training_goal` | TEXT | `'endurance'` \| `'intervals'` \| `'hills'` \| `'recovery'` |
| `difficulty_rating` | INTEGER | 1–5 |
| `generated_by` | TEXT | `'manual'` \| `'ai'` \| `'strava_import'` |
| `ai_prompt`, `ai_suggestions` | mixed | If AI-generated |
| `is_private`, `visibility` | mixed | |
| `tags` | TEXT[] | |

### Route ↔ workout linkage — what exists, what doesn't

There is **no** `route_id` column on `planned_workouts`. The schema has
no way to say "today's planned workout uses route X" directly.

What does exist:

- **`race_goals.route_id`** — added by
  `database/migrations/063_race_goals_route_link.sql`:
  ```sql
  ALTER TABLE race_goals
    ADD COLUMN IF NOT EXISTS route_id UUID
    REFERENCES routes(id) ON DELETE SET NULL;
  ```
  This links a saved route to a *race goal*, not to a daily workout.

- **`route_context_history`** (migration 013) — a historical telemetry
  table linking a `route_id` to a `scheduled_workout_id` (and weather,
  day-of-week, time-of-day) for preference learning. Read-only from the
  Today view's perspective.

- **`user_route_preferences`** (migration 013) — learned preferences
  per user + route, also analytical.

If you want the Today view to show "the route paired with today's
workout," there are two options:

1. Add a `route_id` to `planned_workouts` (schema change).
2. Let the user pick a route at view time (no schema change), and use
   `route_context_history` only as a recommendation source.

### Elevation profile

- **Storage**: Inside the `routes.geometry` JSONB. Elevation is fetched
  via `/api/elevation.js` (proxies OpenTopoData). Stored as part of the
  GeoJSON coordinate array.
- **Endpoint**: `/api/elevation.js` accepts an array of `[lon, lat]`
  coordinates and returns elevation per point.

There is no separate elevation-profile table.

### Reusable Mapbox components

In `src/components/`:

| File | Role |
|------|------|
| `ColoredRouteMap.jsx` | Renders a route polyline color-coded by elevation. Most reusable primitive. |
| `RecentRidesMap.jsx` | Shows historical rides on a map |
| `RouteBuilder/RoutePreviewMap.tsx` | Preview-sized map inside the route builder |
| `RouteBuilder/RoutePOILayer.jsx` | POI layer |
| `RouteBuilder/AlternativeRouteLayers.jsx` | Alternative route suggestions |
| `MapControls.jsx` | Pan/zoom/layer controls |
| `SavedRoutesDrawer.jsx` | Drawer to list/select saved routes |
| `RouteExportMenu.jsx` | Export GPX/TCX/FIT (uses `src/utils/workoutExport.ts`) |
| `FloatingRouteSettings.jsx` | Display settings |

**No standalone "mini-map widget"** designed for embedding in a
dashboard card exists today. `ColoredRouteMap.jsx` is the closest
reusable primitive but is sized for full-screen use.

### Elevation chart component

No dedicated `ElevationProfile` chart component was found in `src/`
outside the route builder context. `recharts` is already a dependency
(used elsewhere in the app), so a chart can be built without adding
deps.
