# Route Builder Refactor — Session Handoff

## What Was Done

This session covered a comprehensive review and refactor of the Tribos Studio route builder, culminating in a unified builder UX. Work was done across two phases: an 11-step incremental refactor, then a full UX unification.

---

## Phase A: Incremental Refactor (11 steps)

All changes on branch `claude/review-route-builder-tHHTc`.

### P1 — Distance Unit Audit
- Audited the AI builder (Zustand store, KM) vs Manual builder (useRouteManipulation, METERS). Found NO active bug — they use separate state. Added documentation contracts to both.

### P2 — Undo/Redo Reactivity Fix
- `useRouteManipulation.js` used refs (`historyRef`, `historyIndexRef`) for undo/redo state. Refs don't trigger re-renders, so `canUndo`/`canRedo` were always stale.
- Added `useState` mirrors (`historyLength`, `historyIndex`) synced in `pushToHistory`, `undo`, `redo`, `clearRoute`.
- `canUndo = historyIndex > 0`, `canRedo = historyIndex < historyLength - 1`.

### P3 — Waypoint Shape Unification
- AI builder waypoints were `{lng, lat}`, Manual builder used `{id, position: [lng, lat], type, name}`.
- Unified to the Manual builder's shape everywhere in RouteBuilder.jsx.
- Updated all Marker components: `waypoint.position[0]`/`waypoint.position[1]` instead of `waypoint.lng`/`waypoint.lat`.

### P4 — aiSuggestions localStorage Exclusion
- Removed `aiSuggestions` from `partialize` in `routeBuilderStore.js`. They contain large coordinate arrays that bloated localStorage.

### P5 — Deduplicate Constants
- `BASEMAP_STYLES`, `CYCLOSM_STYLE` were defined in both RouteBuilder.jsx and ManualRouteBuilder.jsx.
- Single source of truth now in `src/components/RouteBuilder/index.js` barrel file.
- Both builders import from there.

### P6 — Merge Export Functions
- `useRouteOperations.js` had near-identical `exportGPX` and `exportTCX` functions.
- Merged into shared `exportRouteFile(format)` helper.

### P7 — Smart Multi-Provider Routing
- Replaced Mapbox-only `calculateRoute` in RouteBuilder.jsx with `getSmartCyclingRoute` from `smartCyclingRouter.js`.
- Fallback chain: Stadia Maps → BRouter → Mapbox.
- Made `setRouteStats` in the Zustand store support functional updates: `setRouteStats(prev => ({...prev, ...new}))`.

### P8 — Adaptive Road Routing Factor
- `iterativeRouteBuilder.js` had a fixed `roadRoutingFactor = 0.75`.
- Now learns from Q1's actual straight-line-to-routed distance ratio.
- Clamped to `[0.4, 0.9]` range.

### P9 — Remove Hardcoded Regions
- Natural language prompt and geocoding had Colorado/California hardcoded region detection.
- Generalized to work with any location.

### P10 — Extract Functions from Monolith
- Extracted ~490 lines from `RouteBuilder.jsx` into:
  - `src/utils/naturalLanguagePrompt.js` — `buildNaturalLanguagePrompt`, `parseNaturalLanguageResponse`
  - `src/utils/geocoding.js` — `geocodeWaypoint` (OSM + Mapbox fallback)
  - `src/utils/routeScoring.js` — `scoreRoutePreference`, `getFamiliarLoopWaypoints`
- Added `getRoutingSourceLabel` export to `smartCyclingRouter.js`.

### P11 — Route Scoring and Ranking
- After AI generates multiple routes, scores them: 70% distance accuracy + 30% familiarity (from riding history).
- Routes sorted by composite score, best first.

### Undo/Redo Visibility Fix
- ManualRouteBuilder.jsx undo/redo buttons used `variant="subtle"` + `color="gray"` — invisible on dark backgrounds.
- Changed to `variant="light"`.

---

## Phase B: Unified Builder UX

### Architecture: Progressive Disclosure with Mode State Machine

**Zustand `builderMode` state**: `'ready'` | `'ai'` | `'manual'` | `'editing'`

- `ready` — No active route. Shows ModeSelector cards + "My Routes" button.
- `ai` — AI prompt input is active. Shows all existing AI builder controls.
- `manual` — Click-to-place waypoints. Shows manual toolbar (undo/redo/reverse/clear), routing profile selector.
- `editing` — Route exists on map. Shows route stats, export, edit tools.

**Mode transitions**:
- `ready` → `ai`: User clicks "Describe a Route"
- `ready` → `manual`: User clicks "Draw on Map"
- `ready` → `editing`: GPX import, or loading a saved route
- `ai` → `editing`: User selects an AI suggestion
- `editing` → `manual`: User clicks "Manual Edit" button in footer
- `ai`/`manual` → `ready`: User clicks "← Back" (only when no route exists)
- Any → `ready`: User clicks "New Route (Clear Session)" / `clearRoute()` / `resetAll()`

**Auto-detection on mount**: If `routeId` param exists or `routeGeometry` has coordinates → `'editing'`. Otherwise keeps persisted mode.

### New Files Created

1. **`src/components/SavedRoutesDrawer.jsx`** (~350 lines)
   - Mantine `Drawer` component, position="right"
   - Loads routes via `listRoutes()` from routesService when opened
   - Search by name/goal/surface, filter by AI/Manual
   - Per-route actions: Edit (navigates to `/routes/{id}`), Export GPX/TCX, Send to Garmin, Delete
   - Same functionality as the old MyRoutes page but in drawer form
   - Props: `opened`, `onClose`, `onRouteSelect`

2. **`src/components/RouteBuilder/ModeSelector.jsx`** (~100 lines)
   - Two cards: "Describe a Route" (AI, lime accent) and "Draw on Map" (Manual, blue accent)
   - "Import GPX / TCX file" dashed-border button at bottom
   - Props: `onSelectMode(mode)`, `onImportGPX`

### Modified Files

3. **`src/stores/routeBuilderStore.js`**
   - Added `builderMode: 'ready'` to initialState
   - Added `setBuilderMode` action
   - `setRoute()` now sets `builderMode: 'editing'`
   - `clearRoute()` now sets `builderMode: 'ready'`
   - `builderMode` added to `partialize` (persisted to localStorage)

4. **`src/pages/RouteBuilder.jsx`** (~3800 lines, up from ~3400)
   - Destructures `builderMode`, `setBuilderMode` from store
   - Mode auto-detection `useEffect` after hydration
   - `handleMapClick`: blocks waypoint placement in `'ready'` mode. **`builderMode` is in the useCallback dependency array** (stale closure bug was caught and fixed).
   - Map cursor: crosshair in manual/editing, grab in ready
   - GPX import handler (`handleImportGPX`): creates file input, parses via `parseGpxFile`, sets geometry + waypoints + mode
   - `useRouteManipulation` hook wired in for manual mode tools (undo/redo/reverse/snapToRoads)
   - Desktop sidebar: conditionally renders by mode:
     - `ready` → ModeSelector
     - `ai`/`editing` → existing AI controls (StepIndicator, AI Generator, route settings, etc.)
     - `manual` → Route name, manual hint, editing toolbar, routing profile, route stats, "Switch to AI" button
   - Mobile `renderControls()`: same mode-conditional pattern
   - "My Routes" button always visible at top of sidebar/controls
   - SavedRoutesDrawer rendered in both mobile and desktop layouts
   - Sticky footer: "Manual Edit" button added next to "Edit Route" when in AI/editing mode

5. **`src/components/AppShell.jsx`**
   - Nav item "Routes" now points to `/routes/new` (was `/routes/list`)
   - Active state check updated: `item.path === '/routes/new'` → `startsWith('/routes')`

6. **`src/App.jsx`**
   - Removed `ManualRouteBuilder` and `MyRoutes` imports
   - `/routes/list` → redirect to `/routes/new`
   - `/routes/manual` and `/routes/manual/:routeId` → redirect to `/routes/new`
   - Old page files (`ManualRouteBuilder.jsx`, `MyRoutes.jsx`) still exist on disk as safety net

---

## Bugs Found and Fixed During Testing

1. **RouteStatsPanel crash in manual mode**: The manual mode panels were passing `routeStats={routeStats}` and `isImperial={isImperial}`, but `RouteStatsPanel` expects `stats={routeStats}` with separate formatter props (`formatDist`, `formatElev`, `formatSpd`, `speedProfile`, `getUserSpeedForProfile`, `routeProfile`). Fixed by passing the correct prop signature.

2. **Map clicks not working in manual mode**: `handleMapClick` was wrapped in `useCallback` with dependencies `[waypoints, calculateRoute, editMode, routeGeometry]`. The `builderMode` variable wasn't in the dependency array, so the callback captured a stale `'ready'` value forever. Fixed by adding `builderMode` to deps.

---

## What Needs Work Next

### Manual Route Building Improvements
- **Draggable waypoint markers**: ManualRouteBuilder had drag-to-reposition on markers. This needs to be ported — the `updateWaypointPosition` function from `useRouteManipulation` is already wired in, but the Marker components in RouteBuilder.jsx don't have `draggable` prop or `onDragEnd` handlers yet.
- **Snap-to-roads toggle**: `useRouteManipulation` provides `snapToRoads`, but there's no UI toggle for it in the manual mode panel yet.
- **Route editing refinement**: The "Edit Route (Remove Tangents)" mode works but could use better visual feedback (highlight hovered segments, clearer removal preview).
- **Undo/redo in AI editing mode**: Currently undo/redo is only shown in manual mode panel. Could be useful in editing mode too (undo the last AI suggestion selection, etc.).

### RouteBuilder.jsx Size
- Now ~3800 lines. The desktop/mobile layout JSX could be extracted into separate components (`DesktopLayout.jsx`, `MobileLayout.jsx`) to reduce the monolith.
- The mode-conditional sidebar panels could each become their own component (`AIModePanel.jsx`, `ManualModePanel.jsx`, `EditingModePanel.jsx`).

### Mobile UX
- The bottom sheet three-state model (peek/half/full) was discussed but not implemented beyond what already existed. The mobile layout still uses the existing `BottomSheet` component with `renderControls()`.
- Touch targets and swipe gestures for undo/redo were planned but not implemented.

### Files That Can Be Deleted (Once Stable)
- `src/pages/ManualRouteBuilder.jsx` — all functionality now in unified builder
- `src/pages/MyRoutes.jsx` — replaced by SavedRoutesDrawer

---

## Key Architecture Decisions

1. **Why progressive disclosure over a mode toggle?** A toggle between AI/Manual would still show all controls at once. Progressive disclosure shows only what's relevant, reducing cognitive load. The "Describe a Route" / "Draw on Map" cards make the entry point obvious.

2. **Why a drawer instead of a dedicated page for saved routes?** Eliminates the intermediary click. Users go straight to the builder and can glance at saved routes without leaving. The drawer also allows referencing old route stats while building a new one.

3. **Why persist builderMode to localStorage?** So returning to the builder preserves the user's workflow. If they were in manual mode and navigated away, they come back to manual mode (not forced through mode selection again).

4. **Why not use `useRouteManipulation` for AI mode too?** The AI builder has its own waypoint and routing logic (iterative builder, smart routing with scoring). Forcing it through `useRouteManipulation`'s snap-to-roads pipeline would break the AI flow. Manual mode is the only one that uses the hook directly.

---

## Commit History (branch: `claude/review-route-builder-tHHTc`)

```
7a291e4 fix(route-builder): add builderMode to handleMapClick dependencies
68d6ee0 fix(route-builder): pass correct props to RouteStatsPanel in manual mode
4d1e0f9 chore(routes): deprecate ManualRouteBuilder and MyRoutes routes
e96b722 feat(route-builder): unified builder UX with progressive disclosure
d480b0a fix(manual-builder): make undo/redo buttons more visible
e97a396 feat(route-builder): score and rank route suggestions by familiarity (P11)
fddf12a refactor(route-builder): extract top-level functions from monolith (P10)
2503bf2 refactor(route-builder): generalize NL prompt and geocoding (P9)
1016c29 feat(route-builder): adaptive road routing factor from Q1 data (P8)
845edf0 feat(route-builder): unify waypoint shape to position array (P3)
4bf3263 feat(route-builder): smart multi-provider routing with scoring (P7)
c1d4e21 docs(route-builder): document distance unit contracts (P1)
c6f25cb refactor(route-builder): fix undo/redo reactivity, dedupe constants, merge exports (P2/P4/P5/P6)
```
