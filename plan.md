# Plan: Integrate Running Routes into Route Builder

## Context

The route builder is currently cycling-only. Running already has workout libraries, plan templates, pace zones, and terrain types defined in the data layer, but none of it connects to the route builder. This plan adds first-class running route support.

## Architecture Principle

Add `sportType` as a top-level concept in the route builder. When `sportType === 'running'`, the routing engine, profiles, POI categories, ETA calculations, basemap options, and settings all adapt accordingly. The goal is **not** to build a separate running route builder — it's to make the existing one sport-aware.

---

## Step 1: Route Builder Store — Add `sportType`

**File**: `src/stores/routeBuilderStore.js`

- Add `sportType: 'cycling'` to `initialState` (default to cycling for backward compat)
- Add `setSportType(sport)` action that also resets `routeProfile` to the first valid profile for the new sport and clears route-specific state
- Add `sportType` to the `partialize` list so it persists in localStorage
- Update `clearRoute()` to keep `sportType` (same as it keeps other settings)

---

## Step 2: Sport-Aware Route Profiles & Constants

**File**: `src/components/RouteBuilder/index.js`

- Add `RUNNING_ROUTE_PROFILES` alongside existing `ROUTE_PROFILES`:
  ```js
  export const RUNNING_ROUTE_PROFILES = [
    { value: 'road', label: 'Road' },
    { value: 'trail', label: 'Trail' },
    { value: 'track', label: 'Track' },
    { value: 'mixed', label: 'Mixed' },
  ];
  ```
- Add a helper `getRouteProfiles(sportType)` that returns the right array
- Add `RUNNING_TRAINING_GOALS` (e.g., `easy_run`, `tempo`, `long_run`, `intervals`, `hills`, `recovery`) alongside the existing cycling goals
- Optionally add an `OpenRunnerMap` or similar basemap style alongside CyclOSM (or just remove CyclOSM from the list when `sportType === 'running'`)

---

## Step 3: Running Routing Engine

**New file**: `src/utils/smartRunningRouter.js`

Create a parallel to `smartCyclingRouter.js` that routes for pedestrians/runners:

- **Stadia Maps**: Use `costing: 'pedestrian'` instead of `'bicycle'` with running-specific options:
  - `walking_speed` (derived from user's threshold pace)
  - `use_hills` preference
  - No `bicycle_type` or `avoid_bad_surfaces`
- **BRouter**: Use `foot` profile (BRouter supports `hiking` and `foot` profiles alongside cycling ones)
- **Mapbox**: Use `mapbox/walking` profile instead of `mapbox/cycling`
- Same fallback chain pattern as cycling: Stadia (primary for road) → BRouter (primary for trail) → Mapbox (fallback)

Key differences:
- Running routing prefers sidewalks, paths, and pedestrian infrastructure
- Trail running routing prefers hiking trails and unpaved paths
- No need for `use_roads` cycling preference — runners use roads differently

---

## Step 4: Sport Selector UI in ModeSelector

**File**: `src/components/RouteBuilder/ModeSelector.jsx`

- Add a `SegmentedControl` at the top of ModeSelector (before the mode cards) to switch between Cycling and Running
- Wire it to `routeBuilderStore.setSportType()`
- When switching sport, update the route profile to the default for that sport
- Use icons: `IconBike` for cycling, `IconRun` for running (both from `@tabler/icons-react`)

This is the natural place since it's the first thing users see when entering the route builder (`builderMode === 'ready'`).

---

## Step 5: Adapt RouteBuilder Page for Sport Context

**File**: `src/pages/RouteBuilder.jsx`

This is the largest change. Key adaptations:

1. **Read `sportType` from store** — pull it alongside other store values
2. **Route generation**: When `sportType === 'running'`, call `getSmartRunningRoute()` instead of `getSmartCyclingRoute()`
3. **Route profiles dropdown**: Use `getRouteProfiles(sportType)` for the profile selector
4. **Training goals**: Show running-specific goals when `sportType === 'running'`
5. **AI prompt context**: Include sport type in the prompt sent to AI for route generation (e.g., "Generate a running route..." vs "Generate a cycling route...")
6. **Workout context**: When loading upcoming workouts for AI context, filter by `sportType` to show running workouts for running routes
7. **Labels**: Change "Ride" → "Run" in distance/duration labels where appropriate (e.g., "Estimated ride time" → "Estimated run time")
8. **POI queries**: When `sportType === 'running'`, adjust POI categories — keep water/food/restrooms, replace `bike_shop` with `running_store` or just hide it

---

## Step 6: Running-Specific Personalized ETA

**File**: `src/utils/personalizedETA.js`

Add running support to the existing ETA calculator:

- Add `RUNNING_DEFAULT_SPEEDS` (in km/h, derived from typical pace zones):
  ```js
  const RUNNING_DEFAULT_SPEEDS = {
    road: 10,     // ~6:00/km
    trail: 8,     // ~7:30/km
    track: 12,    // ~5:00/km
    mixed: 9,     // ~6:40/km
  };
  ```
- Add `RUNNING_GOAL_MULTIPLIERS`:
  ```js
  const RUNNING_GOAL_MULTIPLIERS = {
    recovery: 0.75,    // very easy pace
    easy_run: 0.90,
    long_run: 0.88,
    tempo: 1.05,
    intervals: 0.85,   // includes recovery jogs
    hills: 0.80,
  };
  ```
- Modify `gradeSpeedFactor()` to accept a `sportType` parameter — running is affected differently by grade than cycling (runners slow down more on uphills but gain less on downhills)
- Modify `fatigueFactor()` — running fatigue kicks in earlier (around 15-20km vs 40km for cycling) and has greater impact
- Accept an optional `sportType` parameter in `calculatePersonalizedETA()` and use the appropriate constants
- For running, support deriving base speed from the user's `RunningProfile.thresholdPaceSec` (stored in localStorage via `RunningProfileSettings`)

---

## Step 7: Running-Aware Route Settings

**File**: `src/components/FloatingRouteSettings.jsx`

When `sportType === 'running'`:

- **Speed tab**: Show pace (min/km or min/mi) instead of speed (km/h or mph). Use the running profile's threshold pace as the baseline.
- **Routing tab**: Replace cycling-specific options:
  - "Traffic Tolerance" → "Sidewalk Preference" (prefer sidewalks, paths, or OK with road shoulders)
  - "Bike Infrastructure" → hidden (not relevant)
  - "Surface Quality" stays but with running-relevant labels
  - "Max Gradient" stays (relevant for both sports)
- **Safety tab**: Remove "Bike Infrastructure", keep "Quietness Level" and "Cell Coverage"
- **Recalculate from Rides** → "Recalculate from Runs" (or calculate from RunningProfile)

---

## Step 8: Running-Aware AI Edit Service

**File**: `src/utils/aiRouteEditService.js`

- Pass `sportType` into `classifyEditIntent()` and `applyRouteEdit()`
- When `sportType === 'running'`, use the running router for rerouting
- Add running-specific quick actions in `AIEditPanel.jsx`:
  - "Sidewalks" (prefer sidewalked routes)
  - "Trail" (shift to trail paths)
  - "Flat" (flatten for easy/tempo runs)
  - Keep: "Scenic", "Shorter", "Longer", "Reverse"
  - Remove cycling-specific: "Gravel"

---

## Step 9: GPX/TCX Export with Sport Type

**File**: `src/utils/workoutExport.ts` (or wherever GPX export lives)

- When exporting a running route, set GPX activity type to `running` instead of `cycling`
- Include pace data instead of power data if available

---

## Step 10: Database — Add Sport Type to Routes

**File**: `api/routes.js`

- Include `sport_type` field when saving routes (default `'cycling'` for backward compat)
- Return `sport_type` when loading routes
- When listing routes, allow optional filtering by `sport_type`

---

## Implementation Order

The steps above are ordered by dependency:

1. **Store** (Step 1) — foundation, everything depends on this
2. **Constants** (Step 2) — profiles/goals needed by UI and routing
3. **Running Router** (Step 3) — core routing capability
4. **Sport Selector UI** (Step 4) — user can now pick running
5. **RouteBuilder Page** (Step 5) — wires sport selection to routing
6. **ETA** (Step 6) — running-appropriate time estimates
7. **Settings** (Step 7) — running-specific preferences
8. **AI Edit** (Step 8) — running-aware route editing
9. **Export** (Step 9) — correct sport type in exports
10. **Database** (Step 10) — persist sport type on saved routes

Steps 6-10 are relatively independent of each other and could be parallelized.

---

## What This Plan Does NOT Include (Future Work)

- Running workout-to-route matching engine (analyzing terrain suitability for specific running workouts)
- GPS-based pace cue generation ("run hard at km 2.5-4.0")
- Trail difficulty ratings beyond elevation
- Treadmill mode (no route needed)
- Running-specific segment alternatives (e.g., "find a flat segment for tempo intervals")
- Running shoe/surface wear tracking

These are all valuable but out of scope for the initial integration.
