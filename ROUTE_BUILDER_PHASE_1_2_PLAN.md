# Route Builder — Phase 1 & 2 Implementation Plan

> **Goal**: Close table-stakes gaps with Strava/Komoot/RWGPS, then add visualization features that differentiate Tribos.

---

## Phase 1: Manual Mode Essentials

### 1.1 — Draggable Waypoint Markers

**Problem**: Markers display but can't be dragged. The UI text at line 3169 of `RouteBuilder.jsx` says _"Drag markers to adjust"_ — but drag isn't wired up.

**What exists**:
- `updateWaypointPosition(waypointId, {lng, lat})` in `useRouteManipulation.js:83-94` — updates position + pushes to undo history. **Never called.**
- Markers rendered at `RouteBuilder.jsx:2295-2324` (mobile) and `3664-3693` (desktop) with `onClick` → `removeWaypoint` but zero drag props.

**Implementation**:

| File | Change |
|------|--------|
| `RouteBuilder.jsx` (both mobile + desktop Marker blocks) | Add `draggable` prop to `<Marker>`. Add `onDragEnd` handler that calls `updateWaypointPosition` then `calculateRoute`. |
| `RouteBuilder.jsx` (hook destructuring, ~line 164) | Destructure `updateWaypointPosition` from `useRouteManipulation` return. |
| `useRouteManipulation.js` | Ensure `updateWaypointPosition` is in the hook's return object (verify it's exported). |
| `RouteBuilder.jsx` | Add `isDragging` state to suppress the `onClick → removeWaypoint` during drag (otherwise every drag-end also removes the marker). |

**Drag handler sketch**:
```jsx
const handleWaypointDragEnd = useCallback((waypointId, event) => {
  const { lng, lat } = event.lngLat;
  const updated = updateWaypointPosition(waypointId, { lng, lat });
  calculateRoute(updated);
}, [updateWaypointPosition, calculateRoute]);
```

**UX details**:
- Cursor changes to `grab` on hover, `grabbing` while dragging.
- Route line updates after drag-end (not during drag, to avoid excess API calls).
- Optional: show a "ghost" dashed line from old position during drag for spatial reference.
- Undo should restore the pre-drag position (already handled by `pushToHistory` in the hook).

**Effort**: Small. Mostly wiring — the hard logic already exists.

---

### 1.2 — Snap-to-Roads / Freehand Toggle

**Problem**: No UI to switch between routed (snap-to-roads) and freehand (straight-line) drawing. Every competitor has this.

**What exists**:
- `snapToRoads` function in `useRouteManipulation.js:218-344` — full async routing pipeline using smart multi-provider. Exported but **never called from UI**.
- `calculateRoute` in `RouteBuilder.jsx` always routes between waypoints (snap is implicit).
- No `snapEnabled` boolean state anywhere.

**Implementation**:

| File | Change |
|------|--------|
| `routeBuilderStore.js` | Add `snapToRoads: true` state + `setSnapToRoads` action (persisted). |
| `RouteBuilder.jsx` — manual mode toolbar | Add a toggle button (road icon ↔ pencil/freehand icon) that flips `snapToRoads`. |
| `RouteBuilder.jsx` — `calculateRoute` function | Branch on `snapToRoads`: if true, use current smart routing; if false, connect waypoints with straight `LineString` segments (no API call). |
| `RouteBuilder.jsx` — `calculateRoute` freehand path | When freehand: build a simple `LineString` from waypoint positions, calculate straight-line distance, fetch elevation for coordinates. |
| `ElevationProfile` | No change needed — it already works on any coordinate array. |

**Toggle UI sketch**:
```
[🛤️ Snap to Roads] ←→ [✏️ Freehand]
```
- Segmented control or icon toggle in the manual mode toolbar (near undo/redo buttons).
- When toggling from freehand → snap, re-route the existing waypoints through the routing engine.
- When toggling from snap → freehand, replace route geometry with direct waypoint connections.
- Visual indicator: freehand route drawn with a dashed line style to make the mode visually distinct.

**Effort**: Medium. Toggle UI is simple; the branching in `calculateRoute` needs care to handle elevation fetching for freehand segments.

---

### 1.3 — Click-on-Route to Insert a Control Point

**Problem**: Users can't click on the drawn route line to add a new waypoint at that location. Every competitor supports this — it's the primary way to reshape a route.

**What exists**:
- `detectRouteClick(coordinates, clickLocation, threshold)` in `routeEditor.js:33-79` — returns `{ index, distance, point }`.
- `handleMapClick` in `RouteBuilder.jsx:634-697` — in `editMode` it uses `detectRouteClick` to find segments for **removal**. In manual mode it adds waypoints at click location (not on the route line).
- No logic to **insert** a waypoint between existing waypoints at a specific route index.

**Implementation**:

| File | Change |
|------|--------|
| `routeBuilderStore.js` or `useRouteManipulation.js` | Add `insertWaypointAtIndex(position, afterWaypointIndex)` — inserts a new waypoint between two existing ones and re-routes. |
| `RouteBuilder.jsx` — `handleMapClick` | In manual/editing mode: if click is near the route line (detectRouteClick), insert a new waypoint at that position instead of appending to the end. If click is NOT near the route, append as usual. |
| `routeEditor.js` | Add `findInsertionSegment(coordinates, clickPoint, waypoints)` — determines which two waypoints the clicked route point falls between (by matching the click index to the waypoint segment boundaries). |
| `RouteBuilder.jsx` | Track segment boundaries: when route is calculated, store which coordinate indices correspond to which waypoint pairs. |

**Algorithm for determining insertion position**:
1. User clicks on the route line in manual mode.
2. `detectRouteClick` returns the coordinate `index` on the route.
3. We need to know which waypoint segment this index falls in. This requires mapping: waypoint pair (A, B) → coordinate range [startIdx, endIdx].
4. The new waypoint is inserted in the `waypoints` array between A and B.
5. Route is recalculated for the two affected segments (A→new, new→B), keeping the rest intact.

**Segment boundary tracking** (new concept):
```javascript
// After calculateRoute, store:
segmentBoundaries = [
  { startWaypoint: 0, endWaypoint: 1, startCoordIdx: 0, endCoordIdx: 142 },
  { startWaypoint: 1, endWaypoint: 2, startCoordIdx: 142, endCoordIdx: 305 },
  // ...
]
```
This is needed for 1.3 AND for the gradient/surface visualization in Phase 2.

**UX details**:
- Show a "ghost" marker when hovering near the route line (cursor: crosshair, translucent marker preview).
- Distinguish from "add waypoint at end" (clicking away from route) vs "insert waypoint on route" (clicking near route).
- The inserted waypoint should be immediately draggable (flows into 1.1).

**Effort**: Medium-Large. The click detection exists, but segment boundary tracking and insertion logic are new. This is the most architecturally significant item in Phase 1.

---

### 1.4 — Waypoint Reorder via Drag-and-Drop in Sidebar

**Problem**: Users can't reorder waypoints. If you place A → B → C but want A → C → B, you have to delete and re-add.

**What exists**:
- Waypoints rendered as a numbered list in the sidebar (mobile: lines 2295+, desktop: lines 3664+). Currently just display with remove-on-click.
- Waypoint array in the store is ordered — array index = route order.
- No sidebar waypoint list component (waypoints only shown as map markers).

**Implementation**:

| File | Change |
|------|--------|
| New component: `src/components/RouteBuilder/WaypointList.jsx` | Draggable waypoint list using `@dnd-kit/core` or simple pointer-event drag (Mantine has `@mantine/hooks` with `useListState` for reorder). |
| `RouteBuilder.jsx` — sidebar panel | Render `WaypointList` when in manual/editing mode with ≥2 waypoints. |
| `RouteBuilder.jsx` or `useRouteManipulation.js` | Add `reorderWaypoints(fromIndex, toIndex)` — reorders array, pushes to undo history, triggers recalculate. |
| `routeBuilderStore.js` | No store change needed — `setWaypoints` already accepts any array. |

**WaypointList component spec**:
- Shows each waypoint as a row: `[drag handle] [number/icon] [name or "Waypoint N"] [⋮ menu or ✕ remove]`
- Start marker: green, labeled "Start" or "S"
- End marker: red, labeled "End" or "E"
- Intermediate: lime green, labeled by number
- Drag-and-drop reorder: on drop, call `reorderWaypoints` which reindexes `type` (first = 'start', last = 'end', rest = 'waypoint'), updates names, recalculates route.
- Click a waypoint → map pans/zooms to that marker.
- Hover a waypoint → highlight corresponding marker on map.

**Dependency**: Check if `@dnd-kit` or similar is already in `package.json`. If not, Mantine's built-in `useListState` with pointer events can handle simple reorder without a new dependency.

**Effort**: Medium. New component, but the underlying operations (set waypoints + recalculate) are trivial.

---

### 1.5 — Bidirectional Elevation ↔ Map Hover Sync

**Problem**: Hovering the elevation chart shows a green dot on the map (already works!), but hovering/moving along the map does NOT highlight the corresponding point on the elevation chart.

**What exists**:
- `ElevationProfile.jsx` — custom SVG chart. `onHoverPosition` callback provides `{lng, lat, elevation, distance, x}` on hover. Green dot + tooltip on chart.
- `RouteBuilder.jsx:160` — `elevationHoverPosition` state. When set, renders a green `<Marker>` on the map (lines 2327-2342, 3696-3710).
- **Chart → Map: ✅ Working.** Map → Chart: ❌ Not implemented.

**Implementation**:

| File | Change |
|------|--------|
| `ElevationProfile.jsx` | Add a `highlightDistance` prop. When provided, render the vertical line + dot at that distance (same visual as hover, but driven externally). |
| `RouteBuilder.jsx` | On `onMouseMove` over the map (or the route line layer specifically), find the nearest route coordinate, compute its distance along the route, and pass it as `highlightDistance` to `ElevationProfile`. |
| `RouteBuilder.jsx` | Add `mapHoverDistance` state. Updated by map mouse move handler, cleared on mouse leave. |
| `ElevationProfile.jsx` | When `highlightDistance` is set AND internal hover is not active, show the external highlight. Internal hover takes priority (so user can still scrub the chart). |

**Map → distance calculation**:
```javascript
// On map mousemove near route:
const nearestPoint = findNearestPointOnRoute(routeGeometry.coordinates, {lng, lat});
if (nearestPoint && nearestPoint.distance < 100) { // within 100m of route
  const distanceAlongRoute = calculateDistanceToIndex(routeGeometry.coordinates, nearestPoint.index);
  setMapHoverDistance(distanceAlongRoute);
}
```

This requires a `calculateDistanceToIndex` utility (sum of haversine distances from coordinate 0 to index N). The `elevation.js` file already has `calculateCumulativeDistances` (lines 117-140) that does exactly this.

**Effort**: Small-Medium. The hardest part is the map mousemove handler performance (needs throttling/debouncing to avoid lag on dense routes). The chart changes are straightforward.

---

## Phase 2: Route Visualization Upgrades

### 2.1 — Gradient-Colored Route Line (Slope-Based)

**Problem**: The route line is a flat lime green (#32CD32). No visual indication of where the hills are. Komoot's elevation bar and color-coded gradient are a major UX win.

**What exists**:
- Route rendered as a simple `<Layer type="line">` with static `line-color` (`RouteBuilder.jsx:2251-2263`).
- `coloredSegments` system already exists for workout zone overlay — uses a `FeatureCollection` of multiple `LineString` features, each with a `color` property and `['get', 'color']` paint expression (`RouteBuilder.jsx:2236-2248`).
- Elevation data available per coordinate via `getElevationData()` in `elevation.js`.
- `calculateCumulativeDistances()` in `elevation.js:117-140` computes distances between points.
- Zone color mapping exists in `intervalCues.js:838-863` as a pattern to follow.

**Implementation approach — FeatureCollection with per-segment colors** (not Mapbox `line-gradient`, which has limitations with dynamic data):

| File | Change |
|------|--------|
| New utility: `src/utils/routeGradient.js` | `createGradientRoute(coordinates, elevationData)` — splits route into small segments, calculates grade for each, assigns color, returns `FeatureCollection`. |
| `RouteBuilder.jsx` | Replace the simple route `<Source>`/`<Layer>` with the gradient version when elevation data is available. Fall back to solid color when no elevation data. |
| `RouteBuilder.jsx` | Compute gradient segments after elevation data is fetched (in the route calculation flow). Store as `gradientRouteGeoJSON` state. |

**Grade calculation**:
```javascript
function calculateGrade(elev1, elev2, distanceMeters) {
  if (distanceMeters === 0) return 0;
  return ((elev2 - elev1) / distanceMeters) * 100; // percent
}
```

**Color scale** (matching common cycling conventions):
```javascript
const GRADE_COLORS = {
  downhill_steep:  '#2563EB', // blue      — grade < -8%
  downhill:        '#60A5FA', // light blue — -8% to -3%
  flat:            '#22C55E', // green      — -3% to 3%
  moderate:        '#EAB308', // yellow     — 3% to 6%
  challenging:     '#F97316', // orange     — 6% to 9%
  steep:           '#EF4444', // red        — 9% to 12%
  very_steep:      '#991B1B', // dark red   — > 12%
};
```

**Segment granularity**: Group consecutive coordinates with similar grade (within 1% band) into single LineString features to keep GeoJSON size reasonable. A 100km route at ~10m resolution = ~10,000 points. Grouping into grade bands should yield ~200-500 segments.

**Performance considerations**:
- Compute gradient GeoJSON once after elevation fetch, memoize with `useMemo`.
- Use the existing `coloredSegments` rendering path (`['get', 'color']` paint) — no new Mapbox layer type needed.
- When workout overlay is active, it takes priority over gradient coloring.

**Legend/key**: Add a small gradient legend in the bottom-right corner of the map showing the color → grade mapping. Can be a horizontal bar like Komoot's.

**Effort**: Medium. The pattern (FeatureCollection with per-segment colors) already exists for workout zones. Main work is the grade calculation utility and wiring it into the route calculation flow.

---

### 2.2 — Elevation Profile Zoom & Section Metrics

**Problem**: The elevation chart is fixed — you can't zoom into a section to see detail on a long route. RWGPS lets you click-drag to select a range and see metrics (distance, gain, avg grade) for just that section.

**What exists**:
- `ElevationProfile.jsx` — custom SVG, 800px viewBox, handles mouse events for hover.
- `handleMouseMove` (lines 149-203) converts mouse X to distance ratio and finds closest point.
- `calculateElevationStats()` in `elevation.js:212-247` computes gain/loss/min/max for any elevation array.

**Implementation**:

| File | Change |
|------|--------|
| `ElevationProfile.jsx` | Add click-drag selection: `onMouseDown` starts selection, `onMouseMove` extends it (if dragging), `onMouseUp` finalizes. Store `selectionStart` and `selectionEnd` as distance values. |
| `ElevationProfile.jsx` | Render selection as a highlighted (semi-transparent) rectangle overlay on the SVG. |
| `ElevationProfile.jsx` | When a selection exists, compute and display section metrics: distance, elevation gain, elevation loss, average grade, max grade. Show in a floating tooltip/panel above the selection. |
| `ElevationProfile.jsx` | Add a "clear selection" button (small ✕) and double-click-to-clear. |
| `ElevationProfile.jsx` | Optional: zoom into selection — re-scale the X axis to show only the selected range. Add zoom-out / reset button. |

**Selection state**:
```javascript
const [selection, setSelection] = useState(null);
// selection = { startDistance: 12.4, endDistance: 18.7 } or null
const [isDragSelecting, setIsDragSelecting] = useState(false);
```

**Section metrics calculation**:
```javascript
function calculateSectionMetrics(elevationData, startDist, endDist) {
  const section = elevationData.filter(p => p.distance >= startDist && p.distance <= endDist);
  const stats = calculateElevationStats(section.map(p => p.elevation));
  const distance = endDist - startDist;
  const avgGrade = ((section[section.length-1].elevation - section[0].elevation) / (distance * 1000)) * 100;
  return { distance, ...stats, avgGrade };
}
```

**UX details**:
- Selection range highlighted with a light blue/green overlay on the chart.
- Map should zoom to fit the selected section's coordinates (optional but powerful).
- Metrics panel: compact row above the chart showing `📏 6.3 km | ⬆️ 245m | ⬇️ 82m | 📐 avg 3.8%`.
- Clicking without dragging still does normal hover behavior.
- The selection should sync with the gradient-colored route (2.1) — highlighting the corresponding section on the map.

**Effort**: Medium. The SVG event handling for drag-select needs care (distinguishing click from drag, touch support), but the metrics calculation is simple.

---

### 2.3 — Surface Type Segments on Route Line

**Problem**: No visual indication of paved vs. gravel vs. dirt on the route. Komoot's surface/way-type bar is their killer feature. Even a basic version (solid = paved, dashed = unpaved) would be a big step up.

**What exists**:
- **BRouter returns properties** (`brouter.js:96`) — but surface/way-type tags are NOT being parsed from the GeoJSON response. BRouter's GeoJSON features include `messages` with columns like `Longitude`, `Latitude`, `Elevation`, `Distance`, `WayTags` — the WayTags contain surface info.
- **Complete OLD implementation**: `OLD/src/utils/surfaceData.js` has full Overpass API integration with surface classification, color mapping, and segment smoothing.
- **OSM surface mapping**: `osmCyclingService.js:149` extracts surface tags. `bikeInfrastructureService.js` has infrastructure colors.
- **Database ready**: `user_road_segments` table has `surface_type` column.
- **Colored segment rendering** already exists for workout zones.

**Implementation — Two-path approach**:

**Path A (Primary): Parse BRouter response** — fastest, no extra API calls:

| File | Change |
|------|--------|
| `brouter.js` | Parse the `messages` array in BRouter's GeoJSON response to extract WayTags (surface, highway type) per coordinate segment. Return as `surfaceSegments` alongside coordinates. |
| New utility: `src/utils/surfaceOverlay.js` | `createSurfaceRoute(coordinates, surfaceSegments)` — builds a `FeatureCollection` where each feature is a segment with a `surfaceType` and `color` property. Uses the color scheme from OLD implementation. |
| `RouteBuilder.jsx` | Add a "Surface" layer toggle. When enabled, render the surface-colored route on top of (or instead of) the default route line. |

**Path B (Fallback): Overpass API query** — for non-BRouter routes (Stadia Maps, Mapbox):

| File | Change |
|------|--------|
| Revive `OLD/src/utils/surfaceData.js` → `src/utils/surfaceData.js` | Port the Overpass API query logic. Modernize: add caching, error handling, rate limiting. |
| `RouteBuilder.jsx` | After route calculation, if the routing provider didn't return surface data, fire an async Overpass query to enrich the route with surface info. |

**Visual encoding** (following industry conventions):
```
Paved (asphalt, concrete):     solid line, blue (#1E40AF)
Gravel (fine_gravel, gravel):  dashed line, orange (#D97706)
Unpaved (dirt, earth, ground): dotted line, brown (#92400E)
Unknown:                       solid line, gray (#9CA3AF)
```

**Surface summary bar** (like Komoot):
- Horizontal bar below the elevation profile showing surface type distribution.
- Each segment colored + labeled: "62% Paved | 28% Gravel | 10% Unpaved"
- Hovering a segment highlights those sections on the map.
- Click a segment to zoom the map to those sections.

**Effort**: Medium-Large. BRouter parsing is the critical new work. The Overpass fallback is already written in OLD. The rendering reuses the colored segments pattern.

---

## Dependency Graph

```
Phase 1:
  1.1 Draggable Markers ──────────────────────┐
  1.2 Snap Toggle ─────────────────────────────┤
  1.3 Click-to-Insert ─── requires 1.1 ───────┤── all feed into better manual editing
  1.4 Waypoint Reorder ───────────────────────┤
  1.5 Elevation Hover Sync ────────────────────┘

Phase 2:
  2.1 Gradient Route Line ─── requires elevation data (exists) ──┐
  2.2 Elevation Zoom ─── enhances 1.5 ──────────────────────────┤── visual layer
  2.3 Surface Segments ─── requires BRouter parsing (new) ──────┘
```

## Suggested Build Order

| Step | Item | Why this order |
|------|------|---------------|
| 1 | **1.1 Draggable Markers** | Smallest change, biggest UX win. Unblocks 1.3. |
| 2 | **1.2 Snap Toggle** | Independent, adds a major missing capability. |
| 3 | **1.5 Elevation Hover Sync** | Independent, builds on existing working code. Enhances UX immediately. |
| 4 | **1.4 Waypoint Reorder** | Independent, new component but simple operations. |
| 5 | **1.3 Click-to-Insert** | Needs segment boundary tracking (new architecture). Benefits from 1.1 being done. Most complex Phase 1 item. |
| 6 | **2.1 Gradient Route Line** | Independent of Phase 1, only needs elevation data. High visual impact. |
| 7 | **2.2 Elevation Zoom** | Builds on the ElevationProfile work from 1.5. |
| 8 | **2.3 Surface Segments** | Needs BRouter response parsing. Most complex Phase 2 item. |

## Architecture Notes

**Segment boundary tracking** (introduced in 1.3) is a foundational concept that benefits multiple features:
- 1.3: Determines where to insert a new waypoint
- 2.1: Could enable per-segment gradient computation
- 2.3: Maps surface data to waypoint segments
- Future: Segment alternatives, per-segment stats

Consider storing this in the Zustand store:
```javascript
segmentBoundaries: [
  { fromWaypoint: 'wp_abc', toWaypoint: 'wp_def', coordStartIdx: 0, coordEndIdx: 142, distance: 4.2 },
  // ...
]
```

**Shared rendering pattern**: Items 2.1, 2.3, and the existing workout overlay all use the same `FeatureCollection` + `['get', 'color']` rendering pattern. Consider a generic `ColoredRouteLayer` component that accepts any `FeatureCollection` with color properties, to avoid three separate Source/Layer blocks.
