# T1.1 — Distance Unit Contract Audit Report

**Status:** Step 1 of T1.1 complete. Awaiting Travis's review before proceeding to Steps 2–9 (boundary converters, renames, store migration, lint rule, runtime assertions, tests, docs).

**Branch:** `claude/fix-distance-unit-contract-SrHg6`
**No code edits have been made.** This audit is read-only per the spec.

The full implementation plan lives at `/root/.claude/plans/wondrous-exploring-hopper.md` (not in the repo). This file is the in-repo artefact the spec asks for.

---

## 1. Boundary inventory — what unit each provider actually returns

All routing APIs return **METERS**. Two same-named haversine helpers in the codebase return **KM**; four others return **METERS**. This naming collision is itself a Category C bug.

| Source | File:line | Returns | Verified by |
|---|---|---|---|
| Stadia Maps (Valhalla) `getStadiaCyclingRoute` | `src/utils/stadiaMapsRouter.js:362,366,381` | `distance` METERS | Multiplies `leg.summary.length * 1000` ("Convert km to meters") |
| BRouter `getBRouterRoute` | `src/utils/brouter.js:71,85` | `distance` METERS | `parseFloat(properties['track-length'])`, comment `// meters` |
| GraphHopper | `src/utils/graphHopper.js:220` | `distance` METERS | comment `// meters` |
| Mapbox Directions / Map Matching | `src/utils/directions.js:67,131,438,513,587`; `src/utils/smartCyclingRouter.js:270` | `distance` METERS | direct from API |
| Smart cycling router (aggregator) | `src/utils/smartCyclingRouter.js:179,220,270` | `distance` METERS | passes through provider value |
| `calculateCumulativeDistances` | `src/utils/elevation.js:117` | **KM** array | `R = 6371` (km), comment confirms |
| `haversineDistance` in `gpxParser.js` | `src/utils/gpxParser.js:357` | **METERS** | `R = 6371000`, comment confirms |
| `haversineDistance` in `routeOptimizer.js` | `src/utils/routeOptimizer.js:431` | **METERS** | `R = 6371000` |
| `haversineDistance` in `api/garmin-auth.js` | `api/garmin-auth.js:934` | **METERS** | `R = 6371000` |
| Haversine in `directions.js` | `src/utils/directions.js:222` | **KM** | `R = 6371` |
| Haversine in `activityRouteAnalyzer.ts` | `src/utils/activityRouteAnalyzer.ts:129` | **KM** | comment "returns km" |
| Strava activity `distance` | `api/strava-activities.js:404,407,451` | **METERS** | comment `// meters`; Strava API |
| Garmin webhook `distanceInMeters` | `api/garmin-webhook-process.js:428,447,485`; `api/garmin-activities.js:460,774` | **METERS** | naming + Garmin API |
| FIT-file ingest `summary.totalDistance` | `api/fit-upload.js:225` | **METERS** | `MAX_DISTANCE_M` constant |
| GPX ingest `gpxData.summary.totalDistance` | `src/utils/gpxParser.js:236` | **METERS** | sums `haversineDistance` (m) |
| GPX trackPoint `point.distance` | `src/utils/gpxParser.js:183,195` | **METERS** | cumulative meters |
| Open-Elevation (via `api/elevation.js`) | `src/utils/elevation.js` | only elevation; cumulative distance computed locally (KM, see above) | n/a |

---

## 2. Storage inventory

### Supabase columns — correctly suffixed (Category A)

| Column | Migration | Unit |
|---|---|---|
| `routes.distance_km` | `database/create_routes_table.sql:16` | KM |
| `planned_workouts.target_distance_km` | `migrations/009_training_plans.sql:70`, `010_alter_training_plans.sql:69` | KM |
| `planned_workouts.actual_distance_km` | `migrations/009_training_plans.sql:80`, `010_alter_training_plans.sql:79` | KM |
| `race_goals.distance_km` (×3) | `migrations/015_race_goals.sql:19,120,161` | KM |
| `fitness_snapshots.weekly_distance_km` | `migrations/026_fitness_snapshots.sql:33` | KM |
| `fitness_snapshots.weekly_run_distance_km` | `migrations/042_running_support.sql:112` | KM |
| `training_segments.distance_meters` | `migrations/047_training_segments.sql:20` | M |
| `user_road_segments.segment_length_m` | `migrations/035_user_road_segments.sql:24` | M |
| `gear_components.warning_threshold_meters` | `migrations/043_gear_tracking.sql:98` | M |
| `gear_components.replace_threshold_meters` | `migrations/043_gear_tracking.sql:99` | M |
| `activity_route_analysis.total_flat_km` / `total_climbing_km` | `migrations/023_activity_route_analysis.sql:26,27` | KM |

### Supabase columns — unsuffixed but documented (Category C)

These rely on `-- meters` comments. Renaming production columns is out of scope per the freeze policy, but they need to be called out in `CLAUDE.md` so callers don't forget.

| Column | Migration | Documented unit |
|---|---|---|
| `activities.distance` | `migrations/001_strava_activities_and_speed_profiles.sql:15` | METERS |
| `gear_items.total_distance_logged` | `migrations/043_gear_tracking.sql:21,31` | METERS |
| `gear_components.distance_at_install` | `migrations/043_gear_tracking.sql:86,97` | METERS |
| `gear_alert_dismissals.dismissed_at_distance` | `migrations/043_gear_tracking.sql:191,196` | METERS |
| `increment_gear_distance(p_distance NUMERIC)` RPC param | `migrations/043_gear_tracking.sql:229` | METERS |
| JSON inside `activity_route_analysis.detected_segments` (`startDistance`, `endDistance`, `length`) | `migrations/023_activity_route_analysis.sql:12,19` | KM (per writer in `activityRouteAnalyzer.ts`) |

Out of scope (categorical text):
- `race_pr_running.distance` TEXT — bucket like `'5k'`, `'half_marathon'` (`migrations/042_running_support.sql:69`)

### Zustand stores / localStorage

| Field | File:line | Documented unit | Actual unit | Category |
|---|---|---|---|---|
| `useRouteBuilderStore.routeStats.distance` | `src/stores/routeBuilderStore.js:23,174,185` | "KM" per lines 19–22 comment | KM in AI flow; METERS in `useRouteManipulation` flow | **B — comment lies** |
| `useRouteBuilderStore.routeStats.elevation` | same | unspecified | METERS | C (out of scope but adjacent) |
| `useRouteBuilderStore.explicitDistanceKm` | `routeBuilderStore.js:38,123,235` | KM | KM | A |
| `useRouteBuilderStore.routeStats.duration` | same | seconds | seconds | n/a |

`routeStats` is persisted to localStorage via `partialize`; any rename needs an `onRehydrateStorage` migration.

---

## 3. High-risk sites — confirmed silent unit swaps

### 3a. The canonical bug
- `src/stores/routeBuilderStore.js:23` declares `routeStats: { distance: 0, ... }`. The header comment claims KM, then immediately concedes "`useRouteManipulation.snapToRoads` stores distance in METERS… These are separate state."
- `src/hooks/useRouteManipulation.js:308` writes `distance: routeDistance` where `routeDistance` is meters from the smart router or Mapbox Directions.
- `src/hooks/useRouteOperations.js:259,283` later does `routeStats.distance / 1000` to recover km — works *by accident* in the manual builder pipeline.

### 3b. AI builder assumes the stored value is already km
- `src/pages/RouteBuilder.jsx:1546` does `distance_km: parseFloat(routeStats.distance) || null`. If any AI codepath ever calls `setRouteStats({ distance: meters })`, a 47 km route is saved as `distance_km = 47000`. The AI generator divides by 1000 in many places (`src/utils/aiRouteGenerator.js:836,844,940,948,1068,1425,1744,1780`) — relying on every caller to remember the divide is exactly the contract failure this task removes.

### 3c. GPX import has a wrong-direction comment
- `src/hooks/useRouteOperations.js:175`:
  ```js
  distance: (gpxData.summary.totalDistance || 0) * 1000, // Convert km to meters
  ```
  But `gpxData.summary.totalDistance` is **already meters** (`gpxParser.js:236` sums `haversineDistance` which returns `R*c` with `R = 6371000`). This multiplies meters by 1000 → garbage. Then `routeStats.distance / 1000` on save (line 259) recovers… the original meters, which is then stored as km. A 50 km GPX would land in `distance_km` as 50,000. The Manual builder pipeline today writes through `useRouteOperations.saveRoute` which (see 3d) drops `distance` entirely, so this bug is currently latent.

### 3d. `useRouteOperations.saveRoute` never sets `distance_km` — routes save with NULL
- `src/hooks/useRouteOperations.js:283` sends `distance: distanceKm` to `saveRouteToDb`. `api/routes.js:129` reads only `routeData.distance_km`. Result: routes saved through the Manual builder land with `distance_km = NULL`. Same problem at lines 284–285 for `elevation_gain`/`_loss` vs columns `elevation_gain_m`/`elevation_loss_m`. Not strictly a unit-contract bug (the unit was right; the field name was wrong) but discovered here and adjacent; recommend fixing in the same PR.

### 3e. Garmin course payload mixes `distanceKm` and `distance_km`
- `src/pages/RouteBuilder.jsx:1513` builds `routeDataForExport` with `distanceKm: routeStats?.distance` — no conversion, takes whatever the store has. Passed to `api/garmin-auth.js:891`: `let distanceMeters = (routeData.distanceKm || 0) * 1000;`. If `routeStats.distance` ever ends up as meters (3a/3b), Garmin sees `meters * 1000` and either rejects or accepts garbage.

### 3f. Two same-named haversine helpers with different units
- `calculateCumulativeDistances` in `elevation.js:117` returns **km**.
- `haversineDistance` in `gpxParser.js:357`, `routeOptimizer.js:431`, `api/garmin-auth.js:934` returns **meters**.
- Haversine in `directions.js:222` and `activityRouteAnalyzer.ts:129` returns **km**.
- Distinguishing them requires reading `R = 6371` vs `R = 6371000`. Standardise on `haversineMeters` + `haversineKm` (or one canonical + `M_TO_KM`).

---

## 4. Category counts

Approximate, full enumeration available via:
```
rg -n '(distance|length|radius|dist|len)\s*[:=]' src/ api/ -g '*.{js,jsx,ts,tsx}'
rg -n '\.(distance|length|radius)\b' src/ api/ -g '*.{js,jsx,ts,tsx}'
```

| Category | Count | Examples |
|---|---|---|
| **A** Correctly suffixed | ~50 | `distance_km` columns, `useRouteBuilderStore.explicitDistanceKm`, `targetDistanceKm` params in `iterativeRouteBuilder.js`, `personalizedETA.js`, `workoutRouteMatch.ts:309`, `osmCyclingService.js:288`, `aiRouteGenerator.js:969` |
| **B** Suffixed but wrong unit | 0 hard cases, **6 systemic landmines** (§3a–3f) |
| **C** Unsuffixed, unit determinable | ~80 | every `distance` field on routing returns, every `routeStats.distance`, `track_points[i].distance` (meters in `gpxParser`, km in `elevation`), `cumulative_distance` column, all `distance` fields in `segmentDetector.ts:24,32,238` (meters), `point.distance` in fit/gpx encoders, `route.distance_from_center` in `api/road-segments.js`, `activity.distance` throughout `api/` |
| **D** Ambiguous | ~15 | `routeUtils.js:15 distance: nearest.properties.dist` (Turf — units option dependent), `osmCyclingService.js` POI scoring, `surfaceOverlay.js` width fields |

---

## 5. Open questions for Travis

Before I proceed to Step 2, three calls I want explicit answers on:

1. **Audit shape** — this file is high-signal but not a row-per-variable enumeration. Should I produce a verbose appendix with every Category C site listed (file:line, current name, proposed name) before any edits? Or is this summary + the discovery commands above sufficient for review? *(Recommendation: this is sufficient; the rename is forced by TypeScript and ESLint, so an enumeration would duplicate the compiler's work.)*

2. **`useRouteOperations.saveRoute` field-name fix (3d).** Strictly a different bug class (wrong field name, not wrong unit). Found here, adjacent to the lines I'd touch anyway. Fix in this PR, separate PR, or out of scope? *(Recommendation: same PR, flagged in the PR description.)*

3. **Renaming `routeStats.elevation` → `elevation_gain_m` in the store.** Out of the literal scope (elevation, not distance) but lives next to the bug and the persistence migration is essentially free. *(Recommendation: include it.)*

4. **Lint rule (Step 6 in spec).** Spec marks it optional. *(Recommendation: include but as `warn` not `error` initially, to avoid churn.)*

---

## 6. Next step

Once you've reviewed and answered §5, I'll execute Steps 2–9 from the spec in a single PR, in this order:

1. `src/utils/distanceUnits.ts` (converters + assertions + consolidated haversine)
2. Rewrite Category C sites in `src/utils/` (routing utils, elevation, gpx, segment files)
3. Rename `useRouteBuilderStore.routeStats.{distance,elevation}` → `{distance_km, elevation_gain_m}` + hydration migration
4. Fix `useRouteManipulation.snapToRoads` (writes both `distance_km` and `distance_m`)
5. Fix `useRouteOperations.{importGPX, saveRoute}` (boundary conversion + correct field names — fixes 3c and 3d)
6. Fix `RouteBuilder.jsx` Garmin export payload + Manual builder save (3e)
7. Consolidate the six haversine helpers (3f)
8. Optional ESLint rule
9. Tests (round-trip, hydration migration, integration tests for snap-to-roads + saveRoute)
10. `CLAUDE.md` "Distance unit convention" section + correct the lying comment in `routeBuilderStore.js:19–22`

Verification per spec §Step 8 + a manual smoke test on `npm run dev`: build a 30 km AI route, save, reload, push to Garmin; confirm displayed values and DB row.
