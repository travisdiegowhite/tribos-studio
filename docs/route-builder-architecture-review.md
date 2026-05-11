# Route Builder — Architectural Review

## Executive Summary

The Route Builder is the core route creation engine for tribos.studio, supporting both AI-assisted and manual route building. It spans **5,787 lines in `RouteBuilder.jsx`**, **3,053 lines in `aiRouteGenerator.js`**, and integrates 20+ utility modules. Functionally rich (AI integration, multi-provider routing, deep analysis), but the architecture has classic monolith symptoms: tight coupling, scattered state, and almost no test coverage on the critical generation path.

---

## 1. High-Level Overview

Three modes:

- **AI Mode** — Natural language → Claude → intelligent waypoints → multi-provider routing → 3 suggestions with analysis
- **Manual Mode** — Click-to-place waypoints → drag to adjust → snap-to-roads
- **Editing Mode** — Load saved route → modify geometry → re-score

**Primary flow:**

1. User enters goal, time, location → `aiRouteGenerator` calls Claude → Stadia Maps / BRouter / Mapbox routing → 3 suggestions
2. User accepts one → stored in Zustand → can edit with AI chat or manual tools
3. Overlays render: elevation profile, gradient coloring, surface type, POIs, bike infrastructure, segment alternatives, interval cues
4. Save to Supabase or export to GPX/TCX/FIT

---

## 2. Component Architecture

### The monolith: `src/pages/RouteBuilder.jsx` (5,787 lines)

Single component handles state setup, transient UI, map rendering, generation triggers, manual editing, AI-assisted editing, all overlays, persistence, and export.

- Lines 76–300: ~40 `useState` + Zustand properties
- Line 36: `useRouteBuilderStore()` pulls in >20 properties
- Lines 156–299: 143 lines of UI-state init
- Line 300+: Tangled dependencies between viewport, geometry, and overlays

### Sub-components (in good shape)

`src/components/RouteBuilder/` is well-decomposed:

- `ModeSelector.jsx`, `WaypointList.jsx`, `RoutePreviewMap.tsx`, `AIEditPanel.jsx`, `SegmentAlternativesPanel.jsx`, `POIPanel.jsx`, `AlternativeRouteLayers.jsx`, `RoutePOILayer.jsx`

The problem is `RouteBuilder.jsx` doesn't delegate enough — it renders these alongside 100+ lines of local UI logic.

### Missing container pattern

No split between **RouteBuilderContainer** (state + side effects) and **RouteBuilderUI** (presentation).

---

## 3. State Management

### Zustand store (`src/stores/routeBuilderStore.js`, 62 lines)

Persisted to localStorage (`tribos-route-builder`):

```
routeGeometry, routeName, routeStats, waypoints,
viewport,
trainingGoal, timeAvailable, routeType, routeProfile, explicitDistanceKm,
raceType, raceDate, targetFinishMinutes,
aiSuggestions, selectedWorkoutId,
builderMode, snapToRoads, routingSource
```

### ⚠️ Unit-contract violation (critical bug risk)

`routeBuilderStore.js:19–22` documents distance as **km**, but `useRouteManipulation.snapToRoads` returns **meters**. Recipe for silent 1000x errors:

```js
const { distance: distMeters } = await getSmartCyclingRoute(...);
setRouteStats({ distance: distMeters }); // stored as km → 45,300 km
```

### State layers (no clear boundary)

1. Persisted Zustand
2. ~40 transient `useState` in `RouteBuilder.jsx`
3. Sub-component internal state
4. Hooks (`useRouteManipulation`, `useRouteOperations`)

`routeId` lives in React state (line 248), not Zustand — inconsistent persistence model.

### Hydration

`useRouteBuilderHydrated()` (line 120) requires many effects to guard `!storeHydrated` → "two-phase init" smell. Better: block rendering until hydrated.

---

## 4. Routing Engines

### Fallback chain (`smartCyclingRouter.js:40–110`)

```
Gravel/MTB:   BRouter → Stadia → Mapbox
Road/Commute: Stadia  → BRouter → Mapbox
```

- **`directions.js`** — Mapbox map-matching with radius fallback (15→25→50m), elevation multi-source
- **`stadiaMapsRouter.js`** (795 lines) — Valhalla wrapper, training-goal → costing parameters
- **`brouter.js`** (172 lines) — gravel/MTB profiles, <30 waypoint limit

**Weaknesses:** no unified provider interface, no request dedup, inconsistent error handling, no metrics on which provider succeeded.

---

## 5. AI Pipeline

### `aiRouteGenerator.js` (3,053 lines) — `generateAIRoutes()`

Stages:

1. **Context gathering** (64–98) — past rides → `analyzeRidingPatterns()` → Claude analysis
2. **Target distance** (100–116) — `time × speedProfile × modifier`. Pattern-based adjustment **disabled** (line 113) — was producing 2–3× longer routes
3. **User prefs** (134–142) — `EnhancedContextCollector` (bike infra, road prefs)
4. **Claude call** (145–150) — POST `/api/claude-routes` → 3 waypoint suggestions
5. **Route building** — per suggestion: `generateIterativeRoute()` → smart router → elevation
6. **Analysis & scoring** — familiarity, elevation, infra filtering
7. Returns 3 best routes

### `claudeRouteService.js` (18 KB)

Secure: calls backend `/api/claude-routes` (never client-side Anthropic). Prompt built via `EnhancedContextCollector.buildEnhancedRoutePrompt()`. Response parser expects JSON arrays of `[lng, lat]`.

### `iterativeRouteBuilder.js`

Segment-by-segment routing for distance precision. Slower than direct Claude waypoints but lands every segment on real roads. Accumulated distance error ±5%.

### `/api/claude-routes` (~100 lines)

Sonnet 4.5, caps: 3,000 tokens, 0–1 temperature, 10K char prompt. Handles 429/401/4xx/5xx. **No caching, no queuing** — every call burns tokens.

### Pipeline weaknesses

- No Claude response caching
- No timeout on generation
- Inconsistent progress callbacks
- **No fallback if Claude fails** — returns `[]`, user sees nothing

---

## 6. Map Rendering

`react-map-gl` + Mapbox GL. Styles: Dark, Outdoors, Satellite, Streets, CyclOSM.

Layers: route geometry, `RoutePOILayer`, `AlternativeRouteLayers`, gradient overlay (`routeGradient.js:146`), surface overlay, `BikeInfrastructureLayer`, draggable waypoint markers, `RunReachLayer` isochrone.

### Sync issues

- `viewportRef` used to avoid re-renders, but not debounced → jank on drag, store/UI desync
- Route-geometry change must propagate to all overlays manually; no orchestrator — overlays may go stale silently if one fetch fails

---

## 7. Persistence

### Zustand + localStorage

Every setter stamps `lastSaved: Date.now()` — but the timestamp is never read.

### Supabase (`database/create_routes_table.sql`)

```sql
routes(id, user_id, name, description, distance_km, elevation_gain_m,
       geometry jsonb, waypoints jsonb, route_type, difficulty_rating,
       training_goal, generated_by, ai_prompt, ai_suggestions jsonb,
       is_private, created_at, updated_at)
```

### `api/routes.js` (~120 lines)

Actions: `save_route`, `list_routes`, `get_route`, `delete_route`. Flow: UI → `routesService.saveRoute()` → fetch `/api/routes` → Supabase.

**Gaps:** no optimistic updates, no sync detection (localStorage vs DB), no DB-side draft handling.

---

## 8. Analysis & Scoring

- **`routeScoring.js`** — `scoreRoutePreference()` posts to `/api/road-segments` for familiarity vs Strava history; `getFamiliarLoopWaypoints()` seeds iterative builder
- **Elevation** — Open-Elevation → Mapbox fallback; `calculateElevationStats()`
- **`routeGradient.js`** — segments colored green→red by grade band
- **`activityRouteAnalyzer.ts`** + **`api/route-analysis.js`** — decode polyline, classify flat/climb/rolling/descent, score suitability for recovery/endurance/tempo/threshold/VO2max/intervals
- **`routePOIService.js`** (355 lines) — Overpass API for cafes, water, rest, bike shops

---

## 9. Pain Points (Most Important)

1. **`RouteBuilder.jsx` monolith** (5,787 lines, ~40 useState, 100+ handlers, 2K JSX) — biggest blocker for debugging, testing, refactoring
2. **Unit contract violation** (km vs m) — silent severe bugs waiting to happen
3. **State sync issues** — viewport not debounced, overlays not orchestrated when route changes
4. **No tests for core generation** — `aiRouteGenerator`, `claudeRouteService`, `iterativeRouteBuilder`, `smartCyclingRouter`, `routeScoring`, `routeOptimizer` all untested
5. **Prop drilling** — `AIEditPanel` and others receive 6–8 individual callbacks
6. **Tight coupling in `smartCyclingRouter.js`** — provider priority hardcoded in if/else; not configurable
7. **Silent error swallowing** — Claude failure → empty `[]`, POI/elevation failure → no UI feedback
8. **Three coordinate formats** in flight: `[lng,lat]`, `{lat,lng}`, `{lat,lng,elevation}` — easy to swap
9. **Weak AI-edit intent classification** (`aiRouteEditService.js:80–100`) — keyword matching, "add a climb" can match "flatten"
10. **Inconsistent JS/TS** — no clear policy
11. **No usage analytics** — `trackFeature` imported but never called during generate/save/export

---

## 10. Suggested Improvement Phases

### Phase 1 — Stabilize (1–2 weeks)

- Unit tests for `aiRouteGenerator`, `iterativeRouteBuilder`, `routeOptimizer` (target 80% coverage)
- Fix unit contract: audit all distance assignments; add `assertDistanceInKm/Meters` guards; document coord formats
- Error boundaries + fallbacks (Claude → heuristic loop, routing → Mapbox last resort, POI/elevation → graceful UI)
- Debounce `setViewport()` to 500ms

### Phase 2 — Modularize (2–3 weeks)

Extract from `RouteBuilder.jsx`:

- `useAIGeneration()` — generation state + triggers
- `useRouteEditing()` — manual edits, undo/redo
- `useMapInteraction()` — viewport, click handlers, layers
- `useRoutePersistence()` — save/load, sync
- `useRouteAnalysis()` — overlays, scoring, POI

Also:

- `RouteDataProvider` context: bundles geometry + derived analyses, auto-fetches on change
- Formalize routing provider registry (config object, not hardcoded if/else)

### Phase 3 — Enhance (3–4 weeks)

- Draft auto-save to DB every 5s
- AI-edit intent verification with preview ("You said 'add a climb' — apply flatten + extend 10km?")
- Segment alternative caching (5min–1h TTL)
- Route versioning / branch with compare-and-revert

### Phase 4 — Performance (1–2 weeks)

- Profile Claude + iterative; cache same-prompt suggestions (5min TTL); parallelize router calls
- Memoize layer defs; lazy-load overlays until user clicks "Details"
- Zustand selector subscriptions in sub-components

---

## Architecture Scorecard

| Dimension | Rating | Notes |
|---|---|---|
| Modularity | 4/10 | Monolithic page; sub-components good but underused |
| State Mgmt | 6/10 | Store fine; transient state scattered |
| Routing Abstraction | 8/10 | Solid fallback; no dedup or metrics |
| AI Integration | 7/10 | Secure backend; no caching or fallback |
| Testing | 2/10 | Core generation untested |
| Persistence | 6/10 | Works; no drafts, no sync detection |
| Error Handling | 4/10 | Many silent failures |
| Performance | 6/10 | Usable; needs batching/caching/lazy load |
| Documentation | 5/10 | Patchy |
| Type Safety | 4/10 | Mixed JS/TS; no coord types |

**Biggest wins:** (1) extract hooks → `RouteBuilder.jsx` shrinks ~70%; (2) tests on generation path; (3) TS types for coordinates; (4) `RouteDataProvider` to eliminate prop drilling + orchestrate overlays.
