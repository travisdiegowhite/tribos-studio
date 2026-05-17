# RouteContext ↔ Supabase Schema Mismatches

Phase A finding #2 evidence. Three of the four Supabase queries in
`src/features/route-builder-v2/adapters/assembleRouteContext.ts`
reference tables/columns that don't exist in the actual schema, and
every failure is silently swallowed.

References:
- Caller: `src/features/route-builder-v2/adapters/assembleRouteContext.ts`
- Doc 2b contract: `docs/doc-2b-conversational-pipeline-spec.md` §9.1 (line 691+)
- Migrations: `database/migrations/*.sql`

---

## Query inventory

| # | Table / view | Columns selected | Filter | Used for | Source line |
|---|---|---|---|---|---|
| 1 | `user_preferences_complete` | `*` | `user_id = $1` | `preferences`, `start_coord` (via `home_longitude`/`home_latitude`), `speed_profile.flat_kph` (via `average_speed_kph` or `flat_kph`) | `assembleRouteContext.ts:188` |
| 2 | `training_context` | `primary_goal, typical_ride_time` | `user_id = $1` | `training_goal`, `duration_target_minutes` | `assembleRouteContext.ts:220` |
| 3 | `activities` | `id, polyline` | `user_id = $1` ORDER BY `start_date` DESC LIMIT 20 | `recent_rides[].{id, waypoints}` | `assembleRouteContext.ts:128` |
| 4 | `auth.users` (via `supabase.auth.getUser()`) | — | session | `user_id` | `assembleRouteContext.ts:80` |

---

## Per-query verification

### Query 1: `user_preferences_complete`

**Status: 404 — view does not exist.**

`grep -rln "user_preferences_complete" database/` returns zero
migrations. No `CREATE VIEW user_preferences_complete` anywhere in
the codebase.

Even if it existed, the columns the code expects (`home_longitude`,
`home_latitude`, `average_speed_kph`, `flat_kph`) don't appear in
`user_profiles` either:

- `home_longitude` / `home_latitude` — not found in any migration
  touching `user_profiles`. There is no home-location column on
  `user_profiles` at all.
- `average_speed_kph` / `flat_kph` — not on `user_profiles`. Speed
  data lives on the **`user_speed_profiles`** table (migration 001),
  with columns `average_speed`, `road_speed`, `gravel_speed`, `mtb_speed`
  (no `_kph` suffix; values are documented as km/h in `-- km/h` comments
  but no canonical-units suffix).

**Travis to verify**: there may be a view created out-of-band (manually
in Supabase Studio) that wasn't captured in a migration. If not, the
404 in P1.4 console errors is the literal cause.

### Query 2: `training_context`

**Status: 400 — table does not exist.**

`grep -rln "CREATE TABLE.*training_context\|CREATE TABLE IF NOT EXISTS training_context" database/`
returns zero. The string `training_context` appears only in:
- `database/migrations/028_cafe_discussions.sql:20, 62` — as a JSONB
  **column** on `cafe_discussions` (cached training context for the
  community feed), not as a table.

Even if a `training_context` table existed, the columns referenced
(`primary_goal`, `typical_ride_time`) live on `user_profiles`:

- `primary_goal` → `user_profiles.primary_goal` (migration 062,
  `CHECK (primary_goal IN ('fitness', 'event', 'performance', 'comeback'))`)
- `typical_ride_time` → not in any migration. The closest is
  `user_speed_profiles.avg_ride_duration` (NUMERIC, minutes).

**The query should target `user_profiles`, selecting `primary_goal`.**
There is no `typical_ride_time` column today.

### Query 3: `activities.polyline`

**Status: 400 — column does not exist; the actual column is `map_summary_polyline`.**

`grep -n "polyline" database/migrations/001_strava_activities_and_speed_profiles.sql`:

```
30:    map_summary_polyline TEXT,
```

There is no `polyline` column on `activities`. The Strava integration
populates `map_summary_polyline` (an encoded polyline string).

The `id` part of the select succeeds; the `polyline` part causes the
400. The whole query rejects.

### Query 4: `auth.users` via `getUser()`

**Status: OK.** Standard Supabase auth call. The catch handler returns
null if it fails, which surfaces as `RouteContextError { kind: 'no_user' }`
— the one error the assembler **does** throw.

---

## The contract violation

`docs/doc-2b-conversational-pipeline-spec.md` §9.1 (line 744):

> Failures: if any required field is missing (e.g., user has no profile),
> the dispatcher emits a synthetic `clarify` rather than calling the
> executor with incomplete context.

The current `assembleRouteContext.ts` wraps every Supabase call in
`try { ... } catch { /* return empty */ }`:

```ts
// assembleRouteContext.ts:184-209 (getProfile)
async function getProfile(userId: string): Promise<ProfileFields> {
  const result: ProfileFields = {};
  try {
    const { data, error } = await supabase
      .from('user_preferences_complete')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!error && data) { /* populate */ }
  } catch {
    // missing view / RLS → return empty
  }
  return result;
}
```

The pattern is identical for `getTrainingContext` (line 217) and
`getRelevantPastRides` (line 111). When the underlying query 400s/404s,
the catch (or the `if (!error && data)` skip) hides it. The caller
gets an empty object, and `assembleRouteContext` happily returns a
RouteContext with:

- `preferences: undefined` (so StadiaProvider's `buildLegacyPreferences`
  returns an empty object → no traffic-tolerance layering)
- `training_goal: session.trainingGoal` (Zustand fallback — works,
  but loses the DB source of truth)
- `start_coord: DEFAULT_START_COORD` (Boulder fallback at line 286 —
  every user gets `[-105.05, 40.05]` instead of their real home)
- `recent_rides: []` (so `like_ride_id` mutations fall through to a
  radial loop with no real-ride structure)
- `speed_profile: undefined` (so the executor uses `DEFAULT_FLAT_KPH = 25`
  for duration→distance conversion regardless of the user's actual pace)

**The executor never sees `context_missing`.** It always thinks
context is fine. The only `context_missing` the codebase produces is
in `Executor/generate.ts:188` when `start_coord` is undefined — but the
Boulder default in `assembleRouteContext` ensures that never happens.

---

## Knock-on effects on the routing pipeline

| Missing field | Downstream impact |
|---|---|
| `preferences` empty | StadiaProvider's `buildLegacyPreferences` returns an unmodified base object. `getStadiaMapsRoute`'s traffic-tolerance branch (lines 249–274) and legacy-preferences branch (lines 278–288) don't fire. The route uses base profile costing only. |
| `training_goal` empty (or session-default `'endurance'`) | StadiaProvider passes `'endurance'` to `getStadiaMapsRoute`, which selects the `endurance` costing in `TRAINING_GOAL_COSTING` (`stadiaMapsRouter.js:126–132`). The user's actual training goal — if it differs — is ignored. |
| `start_coord` always Boulder | Every user who doesn't pass an explicit `start_coord` in `GenerationFormInput` generates routes starting at Boulder. |
| `user_speed_kph` undefined | Executor's `deriveDistanceFromDuration` uses `DEFAULT_FLAT_KPH = 25`. Routes are sized for a 25 km/h rider regardless of actual pace. |
| `recent_rides` empty | `like_ride_id` mutations always fall through to the radial-loop seed (`Executor/generate.ts:246`). The "ride like ride X" intent is silently downgraded. |
| `familiar_segments` empty | `prefer_segments` in `increase_climbing` / `swap_to_familiar` / etc. handlers is always undefined. The router gets no familiarity hint. |

None of these failures are visible — every code path returns a valid
route. The route is just wrong.

---

## What Travis needs to confirm in Supabase

For each of the three failing queries, please run in Supabase Studio
(SQL editor) and paste the results back:

```sql
-- 1. Does this view exist? Almost certainly no.
SELECT EXISTS (
  SELECT 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'user_preferences_complete'
);

-- 2. Does this table exist? Almost certainly no.
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'training_context'
);

-- 3. Confirm the polyline-like column on activities.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activities'
  AND column_name ILIKE '%polyline%';
```

If any return unexpected results (e.g., the view DOES exist because it
was created manually), the audit's recommendation changes — instead of
creating new infrastructure, the fix is to query what's there.

---

## Proposed source of truth (for the fix spec)

For each abstract field in `FullRouteContext`, the realistic source:

| Field | Source | Notes |
|---|---|---|
| `start_coord` | **TBD — no column today** | Add a home-location column to `user_profiles`, or read from `activities` as "where the user usually starts". |
| `preferences` | `user_profiles.*` (and possibly `tire_pressure_prefs`, `fueling_preferences`, etc.) | Roll our own join — there's no view. |
| `speed_profile.flat_kph` | `user_speed_profiles.average_speed` (or `road_speed`) | Rename or alias the field. |
| `training_goal` | `user_profiles.primary_goal` | Drop the `training_context` query entirely. |
| `duration_target_minutes` | `user_profiles.weekly_hours_available` ÷ rides per week (heuristic) or omit | No column for "typical ride time" today. |
| `recent_rides` | `activities` SELECT `id, map_summary_polyline` | Decode polyline if waypoints are needed; today it's stored as `waypoints: []` (unused). |

The fix spec needs to make the source-of-truth choices explicitly.
This audit just identifies that the current choices are wrong.

---

## Note on `user_profiles.ftp`

The original T2.6 spec mentions `user_profiles.ftp → 400` as one of
the P1.4 console errors. **This query does not appear in
`assembleRouteContext.ts`.** Searches that include this column:

- `src/services/ftp.js:22, 54` — `.select('ftp, power_zones')`
- `src/components/progress/FitnessProgressChart.jsx:196`
- `src/hooks/useFeatureFlag.ts:26` — `.select('feature_flags')`
- many more

`user_profiles.ftp` was added by migration `002_add_ftp_power_zones.sql`
and the column exists today, so the spec's claim of a 400 isn't
explained by a missing column. Possible causes:

- RLS denying the read for an unauthenticated request (unlikely; FTP
  service uses authenticated user).
- A different request that happens to be live on the route builder
  page (e.g., the fitness widget) showing up in the same console
  capture and being misattributed.

**Recommendation**: include this in Travis's verification — capture
the precise query (URL, headers, payload) that produces the 400 in
the production Network tab, not just the console error. Don't assume
it's an assembleRouteContext issue without that evidence.
