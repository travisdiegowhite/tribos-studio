# T1.2 — Coordinate Format Audit Report

**Status:** Step 1 of T1.2 complete. Awaiting Travis's review before proceeding to Steps 2–10 (canonical type, boundary converters, internal replacements, type updates, runtime assertions, migrations, tests, docs).

**Branch:** `claude/unify-coordinate-format-qmuul`
**No code edits have been made.** This audit is read-only per the spec.

Format mirrors T1.1's `audit-report.md`. The lift in T1.2 is mostly mechanical because **Mapbox GL is `[lng, lat]` natively, and the route store already persists waypoints with `position: [lng, lat]`.** The bugs are almost all (a) internal function signatures that take `{lng, lat}` Mapbox-style objects, (b) data-shape types that pack coordinates into `{lng, lat}` objects (Category B), and (c) two external APIs (Stadia/Valhalla and Open-Elevation) that need named converters at the boundary (Category C).

I did not find an obvious axis-swap bug — i.e., `[lat, lng]` written into a `[lng, lat]` slot — but `src/utils/directions.js calculateDistance([lat, lon], ...)` is a footgun helper whose `[lat, lon]` parameter order disagrees with every caller's `[lon, lat]` array shape. The caller correctly destructures and re-orders, but this is exactly the kind of contract gap T1.2 is meant to remove.

---

## 1. Boundary inventory — what shape each external surface uses

| Source | File:line | External shape | Direction |
|---|---|---|---|
| Mapbox GL `event.lngLat` (map click/drag) | `src/pages/RouteBuilder.jsx:1027,1180,1210`; `src/pages/ManualRouteBuilder.jsx:281,299,307`; `src/components/training/SegmentLibraryPanel.tsx:796` | `{lng, lat}` object | in |
| Mapbox Directions / Map Matching API | `src/utils/directions.js`; `src/hooks/useRouteManipulation.js:267,286` | `[lng, lat]` (canonical) | in & out |
| Mapbox Geocoding `feature.center` | `src/utils/geocoding.js:110,133,147`; `src/components/planner/TrainingPlanner.tsx:167`; `src/pages/RouteBuilder.jsx:2329` | `[lng, lat]` (canonical) | in |
| Stadia Maps Valhalla `/route` request | `src/utils/stadiaMapsRouter.js:287` | `{lat, lon}` per location | out |
| Stadia Maps decoded polyline geometry | `src/utils/stadiaMapsRouter.js:732,767` | `[lng, lat]` (after our decoder) | in |
| Stadia Maps Valhalla `/expansion` request | `src/utils/isochroneService.js:110` | `{lat, lon}` per location | out |
| BRouter request `lonlats=` | `src/utils/brouter.js:35` | `"lon,lat\|lon,lat"` string | out |
| BRouter GeoJSON response | `src/utils/brouter.js:70` | `[lng, lat]` (canonical) | in |
| GraphHopper | `src/utils/graphHopper.js` | TBD — out of immediate scope (no `lat\|lng\|lon` matches; review during conversion work) | both |
| Open-Elevation API request | `src/utils/directions.js:118–121` | `{latitude, longitude}` per location | out |
| Open-Elevation response | `src/utils/directions.js:137` | `{latitude, longitude, elevation}` per result | in |
| OpenTopoData via our `/api/elevation` proxy | `src/utils/elevation.js:19–25,162` | `coordinates: [[lng, lat], …]` request; `{lat, lon, elevation}` per result | both |
| Mapbox Terrain Tilequery | `src/utils/directions.js:153` | URL `/${lon},${lat}.json` | out |
| Mapbox reverse geocoding (segment naming) | `src/utils/segmentNaming.ts:117` | URL `/${lng},${lat}.json` | out |
| Overpass / OSM nodes | `src/utils/osmCyclingService.js:121–122,133–138`; `src/utils/routePOIService.js:290,296,308–309`; `src/utils/surfaceOverlay.js:53,84`; `src/utils/bikeInfrastructureService.js:272` | per-node `{lat, lon}` (OSM convention) | in |
| Strava polyline decode (Google polyline5) | `src/utils/activityRouteAnalyzer.ts:91–127` | Decoded into `{lng, lat}` objects | in |
| FIT files (`record.position_lat`, `position_long`) | `src/utils/fitParser.js:179–182` | `{latitude, longitude}` track points | in |
| FIT course encode (semicircle) | `src/utils/fitCourseEncoder.ts:135–142,180–192` | `{positionLat, positionLong}` records | out |
| GPX track points | `src/utils/gpxParser.js:168–170` | `{latitude, longitude}` track points | in |
| GPX/TCX export (`<wpt>`, `<trkpt>`) | `src/utils/routeExport.ts:139,165,185,248–249,256–257,282–283,301–302` | XML attributes `lat="…" lon="…"` | out |
| OpenWeatherMap (server-side) | `src/hooks/useWeatherForecast.ts:42` (URL query `lat=&lon=`) | URL query | out |
| Supabase `routes.start_latitude/start_longitude/end_latitude/end_longitude` columns | `database/create_routes_table.sql:26–29`; readers in `src/pages/RouteBuilder.jsx:761–765`, `src/utils/enhancedContext.js:694–712`, `src/utils/rideAnalysis.js:37–40` | scalar columns | both |
| Supabase `routes.geometry` JSONB | `database/create_routes_table.sql:22` (`GeoJSON LineString/MultiLineString`) | `[lng, lat]` (canonical) | both |
| Supabase `routes.waypoints` JSONB | `database/create_routes_table.sql:23` (`Array of waypoint objects`) | shape is whatever the writer used. The current frontend writes neither directly (the manual save path drops `waypoints` from `routeData` — see §3c); historical/AI rows may contain `{lat, lng, …}` or `position: [lng, lat]`. **Needs DB-side spot check before Step 8b.** | both |
| `activities.geometry`, `activities.stream_data` (Strava import) | seen in `src/utils/rideAnalysis.js:81–82,294–311` | per-point `{latitude, longitude}` | in |

---

## 2. Storage inventory

### Zustand store (`useRouteBuilderStore`)

| Field | File:line | Shape | Category |
|---|---|---|---|
| `routeGeometry.coordinates` | persists raw GeoJSON | `[lng, lat]` array of arrays | A |
| `waypoints[].position` | `src/hooks/useRouteManipulation.js:46,87`; `src/hooks/useRouteOperations.js:134`; reads at `src/pages/RouteBuilder.jsx:3449–3450,5480–5481,925,1517` | `[lng, lat]` tuple | A (good — but only the field itself is canonical; the surrounding object is custom-shaped, see §3a) |
| `viewport` | `src/stores/routeBuilderStore.js:29–33` | `{latitude, longitude, zoom}` (react-map-gl convention) | **Out of scope** per spec |
| `aiSuggestions[].coordinates` | not persisted (excluded from `partialize`) | `[lng, lat]` per `aiRouteGenerator.js` output | A |

### Supabase JSONB columns

| Column | Migration | Documented shape | Actual shape (per writers) |
|---|---|---|---|
| `routes.geometry` | `create_routes_table.sql:22` | GeoJSON LineString | `[lng, lat]` arrays — canonical |
| `routes.waypoints` | `create_routes_table.sql:23` | "Array of waypoint objects" — undocumented | Frontend currently does not write this column from the manual builder. Historical AI rows and the older Strava-import path are unknown — **needs a spot-check SELECT against production before Step 8b**, exactly as the spec warns. |
| `activities.stream_data` | `migrations/001_*` (not re-checked) | unspecified | Per-point `{latitude, longitude}` per `rideAnalysis.js:81–82` consumers |
| `activity_route_analysis.detected_segments[].coordinates` | `migrations/023_activity_route_analysis.sql` (writer: `activityRouteAnalyzer.ts`) | `[lng, lat]` per `segmentDetector.ts:45` and `RouteSegment.coordinates` typing | A |
| `routes.start_latitude/start_longitude/end_latitude/end_longitude` | `create_routes_table.sql:26–29` | scalar columns | A (named correctly; out of scope for the array-vs-object work, but every reader must keep the swap correct — see §3b) |

### `audit-report.md` (T1.1) already documented the `position: [lng, lat]` waypoint contract — T1.2 does not contradict it. The new work is the surrounding fields, not `position` itself.

---

## 3. High-risk sites — confirmed contract gaps

### 3a. `addWaypoint` / `updateWaypointPosition` API takes `{lng, lat}` even though storage is `[lng, lat]`

- `src/hooks/useRouteManipulation.js:43,84` — both functions accept a Mapbox-style `{lng, lat}` object and immediately destructure into `[lngLat.lng, lngLat.lat]` for `position`.
- Callers (`RouteBuilder.jsx:1027,1107,1130,1180,1181`; `ManualRouteBuilder.jsx:281–308`) pass `{lng, lat}` derived from `event.lngLat`.
- Conversion is **inlined at every call site**, which is exactly what Step 4 wants to remove. The fix is to either (i) accept a `Coordinate = [lng, lat]` directly and force one converter at the Mapbox event boundary, or (ii) keep `{lng, lat}` as the documented "Mapbox event" shape and convert via a named `mapboxEventToCanonical(event.lngLat)` helper. The spec's preference is (i).

### 3b. `calculateDistance([lat, lon], [lat, lon])` parameter order disagrees with every caller's coord array

- `src/utils/directions.js:233` defines `calculateDistance([lat1, lon1], [lat2, lon2])` — `[lat, lon]` ordered.
- Its caller two lines up (`:218–220`) destructures `[lon1, lat1] = coordinates[i - 1]` from canonical arrays and **then re-builds `[lat1, lon1]` arrays to pass in.** The code is correct today, but the helper's parameter order is a footgun: any new caller that passes a canonical `[lng, lat]` straight in will silently swap axes.
- `src/utils/routeEditor.js:33,42–46` has the same pattern — `findNearestPointOnRoute(coordinates, clickLocation)` expects `coordinates` as `[lon, lat]` and `clickLocation` as `{lng, lat}`. The mixed shape on one function call is exactly what T1.2 standardises.
- Fix in Step 4: replace these with the canonical `haversineMeters` / `haversineKm` helpers from `src/utils/distanceUnits.ts` (which take `(lat1, lon1, lat2, lon2)` scalars — order is in the parameter names, not in array packing).

### 3c. The manual save path strips `waypoints` from `routeData`

- `src/hooks/useRouteOperations.js:276–307` builds `routeData` from `routeStats`, `coords`, `track_points`, but never includes `waypoints` at the top level. So the `routes.waypoints` JSONB column is null-or-stale for manual builds today.
- Not a coord-shape bug, but worth flagging: when Step 8b runs the Supabase audit, expect historical rows to dominate. New saves are not adding to the inconsistency.

### 3d. `Coordinate` type in `activityRouteAnalyzer.ts` shadows the canonical name

- `src/utils/activityRouteAnalyzer.ts:11–16` exports `interface Coordinate { lng: number; lat: number; elevation?: number; distance?: number; }`.
- After T1.2, the canonical `Coordinate` will be `readonly [lng: number, lat: number]`. The two types **cannot coexist** under the same name; renaming the local one to `PolylinePoint` or similar in Step 5 will surface every internal consumer via the TypeScript compiler.
- Same story for `RouteCoordinate`/`RouteWaypoint` in `src/utils/routeExport.ts:20–32` (both are `{lng, lat}` shaped; the surrounding code already takes `[lng, lat]` arrays in `RouteData.coordinates`, so the local types are GPX-export-only). These can stay if we rename them to clearly indicate "export-side" shape.

### 3e. Numerous `wp.lng || wp.longitude` fallbacks paper over four different waypoint shapes

- `src/utils/iterativeRouteBuilder.js:633,642,697` and `src/utils/aiRouteGenerator.js:19–37`, `src/utils/claudeRouteService.js:167–173`, `src/utils/enhancedContext.js:448–454`, `src/utils/rideAnalysis.js:548–558` each define a private `normalizeStartLocation`-style helper that accepts **all of**: `[lng, lat]`, `{lng, lat}`, `{lon, lat}`, `{longitude, latitude}`.
- This is Category E — same module, multiple shapes — repeated five times. Step 3 should consolidate these into a single normaliser inside `coordConverters.ts`, deprecate the helpers, and let the TypeScript compiler force callers to one shape.

### 3f. `elevationHoverPosition` uses `{lng, lat, elevation, distance}` ad-hoc shape

- `src/components/ElevationProfile.jsx:19,232–233` returns a `{lng, lat, …}` object via the `onHoverPosition` callback.
- `src/pages/RouteBuilder.jsx:3494–3497,5525` consumes it as `elevationHoverPosition.lng` / `.lat` and feeds it to `<Marker longitude= latitude= />`.
- Spec lists "ad-hoc objects with `{lat, lng, elevation}`" as one of the three formats in flight. This is the smallest one. Convert to canonical `Coordinate` (drop elevation/distance back into a sibling field) in Step 4.

---

## 4. Internal usage inventory (Categories A–E)

### Category A — already canonical `[lng, lat]` internal
| Site | File:line | Note |
|---|---|---|
| Route geometry | `src/stores/routeBuilderStore.js:17`; everywhere via `routeGeometry.coordinates` | Persisted; safe |
| Waypoint `.position` field | `useRouteManipulation.js:46,87`; readers in `RouteBuilder.jsx`, `ManualRouteBuilder.jsx` | Field itself is canonical; surrounding API is not (3a) |
| Smart router / Stadia / BRouter return `.coordinates` | `stadiaMapsRouter.js:380`; `brouter.js:84`; `smartCyclingRouter.js` | All canonical |
| `aiRouteGenerator.js fullCoordinates` / `outboundRoute.coordinates` | `aiRouteGenerator.js:929,932,2662,2665` | Canonical |
| `iterativeRouteBuilder.js allCoordinates` | `iterativeRouteBuilder.js:354,392,421,490,540,724,728,734` | Canonical (file-internal) |
| `gpxParser.js` `trackPoints[].latitude/longitude` → consumer flips to `[longitude, latitude]` | `useRouteOperations.js:134,141` | Canonical at consumer boundary |
| `fitParser.js trackPoints[].latitude/longitude` | `fitParser.js:181–182` | Internal to FIT pipeline; converted on consumption |
| `RoutePreviewMap.tsx:67 getCoordinates(geometry)` | `RoutePreviewMap.tsx:67–135` | Canonical `number[][]` |
| Strava polyline decode (Google polyline5) — but see 3d about the type | `activityRouteAnalyzer.ts:91–127,123` | Internal to that module |

### Category B — external shape used internally beyond a boundary
| Site | File:line | Current shape | Suggested action |
|---|---|---|---|
| `addWaypoint(lngLat)` | `useRouteManipulation.js:43` | `{lng, lat}` | Replace with `addWaypoint(coord: Coordinate)`. Convert at the Mapbox event boundary in `RouteBuilder.jsx:1027` and `ManualRouteBuilder.jsx:281`. |
| `updateWaypointPosition(id, newPosition)` | `useRouteManipulation.js:84` | `{lng, lat}` | Same as above. |
| Waypoint export shape `{lat, lng, name, type}` | `useRouteOperations.js:57–62`; `RouteBuilder.jsx:1516–1521` | `{lat, lng}` | This is a **GPX/TCX export boundary**, not internal. Keep but rename the type in `routeExport.ts` to `GpxExportWaypoint` or similar to make the boundary explicit. |
| `elevationHoverPosition` `{lng, lat, elevation, distance}` | `ElevationProfile.jsx:232–233`; `RouteBuilder.jsx:3496–3497` | `{lng, lat}` | Replace with `{ coordinate: Coordinate, elevation, distance }` shape. |
| `geocoding.js matchRouteToOSM({…}, {lat, lng})` | `geocoding.js:33–36` | `{lat, lng}` proximity | Convert at boundary: the helper takes a `Coordinate`, geocoder converts inside. |
| `osmCyclingService.extractCyclingFeatures` returns `{lat, lng, geometry: [{lat, lng}, …]}` | `osmCyclingService.js:120–146` | `{lat, lng}` everywhere | OSM is the upstream — its API is `{lat, lon}`. Convert at the parser: emit `{name, coordinate: Coordinate, geometry: Coordinate[]}` to consumers. Geometry conversion is `[node.lon, node.lat]`. |
| `routePOIService.js` POI objects `{lat, lon, …}` and the internal `distanceAlongRoute({lat, lon}, …)` call | `routePOIService.js:290–316` | `{lat, lon}` | Convert POIs to `{coordinate: Coordinate, …}` at the Overpass parser; rewrite `distanceAlongRoute` to take a `Coordinate`. |
| `routeEditor.findNearestPointOnRoute(coords, {lng, lat})` and `detectRouteClick(coords, {lng, lat}, …)` | `routeEditor.js:33,71` | mixed (array + object) | Take `Coordinate` for `clickLocation`. Callers in `RouteBuilder.jsx:1038,1081,1211` just produce the `{lng, lat}` from `event.lngLat` — convert at the call site. |
| `directions.calculateDistance([lat, lon], [lat, lon])` | `directions.js:233` | inverted-order array | Delete this private helper; callers should use `haversineKm/Meters` from `distanceUnits.ts`. |
| `surfaceOverlay.findClosestWay(lon, lat, index)` and grid keys | `surfaceOverlay.js:53,66–84` | scalar `(lon, lat)` parameters | Could stay scalar — the function isn't holding a coord object. Acceptable; document param order in JSDoc. |
| `bikeInfrastructureService.getGridCell(lat, lng)` | `bikeInfrastructureService.js:120` | scalar `(lat, lng)` — **parameter order disagrees with `surfaceOverlay`** | Standardise on `(lng, lat)` to match canonical ordering, or accept a `Coordinate`. |

### Category C — external shape at a real boundary (needs a named converter)
| Boundary | File:line | Converter name |
|---|---|---|
| Stadia Maps `/route` request | `stadiaMapsRouter.js:287` | `canonicalToValhalla(c: Coordinate): { lat, lon }` |
| Stadia Maps `/expansion` request | `isochroneService.js:110` | same `canonicalToValhalla` |
| BRouter `lonlats=` query string | `brouter.js:35` | `canonicalToBRouter(coords: Coordinate[]): string` |
| Open-Elevation request | `directions.js:118–121` | `canonicalToOpenElevation(c: Coordinate): { latitude, longitude }` |
| Open-Elevation response | `directions.js:137` | `openElevationToCanonical(r): { coordinate: Coordinate; elevation: number }` |
| Mapbox Terrain Tilequery URL | `directions.js:153` | inline string template is fine — but extract a helper `mapboxTerrainTileUrl(c, token)` |
| Mapbox reverse-geocode URL | `segmentNaming.ts:117` | `mapboxReverseGeocodeUrl(c, token)` |
| FIT course export (semicircles) | `fitCourseEncoder.ts:141–142,191–192` | already done inline via `degreesToSemicircles(lat)`/`(lng)` — keep, but the caller should destructure from a `Coordinate` rather than `{lat, lng}` (see waypoint shape in `routeExport.ts`) |
| GPX/TCX export XML | `routeExport.ts:139,165,185,248–283,301–302` | converters are inherent to the XML structure (lat/lon attributes); the input `coordinates: [[lng, lat]]` is already canonical |
| Mapbox GL `event.lngLat` (DOM event) | `RouteBuilder.jsx`, `ManualRouteBuilder.jsx` (multiple sites) | `mapboxEventToCanonical(e.lngLat): Coordinate` (one-liner: `[e.lng, e.lat]`) |
| FIT/GPX/Strava activity import (per-point `{latitude, longitude}`) | `gpxParser.js:168–170`; `fitParser.js:181–182`; `rideAnalysis.js:81–82,294–311,341–342,906–907` | `activityPointToCanonical(p): Coordinate` — applied at every site that hands the track-point stream to downstream analysis. Spec calls this out as a hidden landmine. |
| `routes.start_latitude/start_longitude` scalar columns | `RouteBuilder.jsx:761–765`; `enhancedContext.js:694–712`; `rideAnalysis.js:37–40` | `routeRowStartToCanonical(row): Coordinate` — extracts `[row.start_longitude, row.start_latitude]` with a single tested helper |

### Category D — reversed by accident
| Site | File:line | Current bug |
|---|---|---|
| Nothing detected during this audit. | — | The only suspect was `directions.js:233 calculateDistance([lat, lon], …)`, but every caller swaps before passing. It is a footgun (3b) not an active bug. Visual route verification (spec's "Risk notes") is still required after Step 8 to be sure. |

### Category E — mixed shapes in the same module
| Module | File:line | Shapes used | Action |
|---|---|---|---|
| `aiRouteGenerator.js` | header normaliser accepts 3 shapes (`:19–37`); `mock` waypoints use `{lon, lat}` (`:1385–1386`); `outboundRoute.coordinates` is canonical (`:929,932`) | array + object + Strava-shape | Replace the local normaliser with the central `coordConverters` one; rewrite `mock` builders to produce canonical arrays. |
| `claudeRouteService.js` | `:167–173,183` | same 3-shape normaliser as above | Same. |
| `enhancedContext.js` | `:448–464,694–712` | same 3-shape normaliser; later destructures `[longitude, latitude] = startLocation` (correct) but also reads scalar `route.start_latitude / start_longitude` columns | Use central normaliser; route-row reader uses Category C converter. |
| `rideAnalysis.js` | `:37–40,81–82,294–311,341–342,548–558,906–907` | scalar DB columns + per-point `{latitude, longitude}` + `{lat, lon}` cluster shapes + array `[lng, lat]` for bearings | Multiple internal shapes. The bearing/cluster pipeline can be rewritten to operate on canonical arrays end-to-end; the DB-row reader is a boundary. |
| `iterativeRouteBuilder.js` | `:633,642,697` | accepts both arrays and `{lng/lat or longitude/latitude}` objects | Same central normaliser; remove inline fallbacks. |
| `RouteBuilder.jsx` | `:1027,1180,1210,1211` (`{lng, lat}` from events) vs `:925,1515,1644,1658,2084` (`[lng, lat]` arrays) | mixed, but with clean call-site boundaries | Once `addWaypoint`/`updateWaypointPosition` take `Coordinate`, the inline `event.lngLat` conversion happens once each via `mapboxEventToCanonical`. |

---

## 5. Files touched count

Of the 28 files matching `lat|lng|lon|latitude|longitude` literals in `src/`, the breakdown is:

| Category | Count | Files |
|---|---|---|
| A only (no work) | 6 | `RoutePreviewMap.tsx`, `MapControls.jsx`, `RecentRides.tsx`, `RecentRidesMap.jsx`, `RouteAnalysisPanel.jsx`, `TrainingCalendar.jsx` (last 4 are viewport-only — out of scope) |
| B (internal shape replacement) | 9 | `useRouteManipulation.js`, `useRouteOperations.js`, `ElevationProfile.jsx`, `RouteBuilder.jsx`, `ManualRouteBuilder.jsx`, `RoutePOILayer.jsx`, `routeEditor.js`, `osmCyclingService.js`, `routePOIService.js` |
| C (boundary converter required) | 9 | `stadiaMapsRouter.js`, `isochroneService.js`, `brouter.js`, `directions.js`, `geocoding.js`, `segmentNaming.ts`, `fitParser.js`, `gpxParser.js`, `rideAnalysis.js` |
| D | 0 | — |
| E (mixed in module) | 5 | `aiRouteGenerator.js`, `claudeRouteService.js`, `enhancedContext.js`, `iterativeRouteBuilder.js`, `bikeInfrastructureService.js` (+`surfaceOverlay.js`) |
| Type-shadow concerns | 3 | `activityRouteAnalyzer.ts` (`Coordinate` interface), `routeExport.ts` (`RouteCoordinate`, `RouteWaypoint`), `segmentDetector.ts` (`StreamPoint` is a per-point superset, not a Coordinate — keep) |

(Some files appear in multiple rows; that's fine.)

---

## 6. Open questions for Travis

1. **Viewport scope.** The spec says BBox/viewport types are out of scope. That excludes `useRouteBuilderStore.viewport`, `react-map-gl` viewport props, `MapControls.jsx`, `RecentRidesMap.jsx`, `RecentRides.tsx`, `RouteAnalysisPanel.jsx`, `TrainingCalendar.jsx`, the `weatherCoords` state in `TrainingPlanner.tsx`, and the `userLocation: {latitude, longitude}` shape used by `geolocation.coords`. Confirm.
2. **Waypoint object shape.** Step 5 of the spec proposes `interface Waypoint { coordinate: Coordinate; name?: string; }`. The current waypoint has `{id, position, type, name}`. Two equally valid choices:
   - (a) Rename `position` → `coordinate` and migrate (breaking for localStorage, fixed by hydration migration; breaking for `routes.waypoints` JSONB column, fixed by Step 8b).
   - (b) Keep field name `position` (it's already canonical) and just tighten its type to `Coordinate`. No data migration.
   I lean toward (b) — same value-level shape, no rename churn, less risk to old localStorage rows. The spec's example in Step 5 is illustrative rather than prescriptive. Your call.
3. **Open-Elevation vs OpenTopoData.** `src/utils/directions.js` calls Open-Elevation directly (`{latitude, longitude}` request, `result.{latitude, longitude}` response). `src/utils/elevation.js` calls our own `/api/elevation` proxy which speaks OpenTopoData. The proxy already accepts canonical `coordinates: [[lng, lat]]`, but returns per-result `{lat, lon, elevation}`. There are two different elevation pipelines and only one was previously documented. Step 3's converter set needs entries for **both**.
4. **`routes.waypoints` JSONB shape.** I cannot tell from the code what historical AI-saved rows store (the manual save path doesn't write it). Before Step 8b, please SELECT a few rows out of production to confirm. The migration script needs to handle whatever shapes exist.
5. **`activities.stream_data` is out of scope, right?** It uses `{latitude, longitude}` per point but that's a Strava/Garmin import pipeline storage detail — converting it would require a separate sweep that touches activity reads everywhere. The spec lists "Activity import is a hidden landmine" specifically for *new* imports (apply `activityPointToCanonical` at the seam), not for back-converting existing rows. Please confirm.
6. **GraphHopper status.** `src/utils/graphHopper.js` is in the routing-provider list but matched zero lat/lng-literal hits during the audit. Skim during Step 6 to confirm it's already canonical (it appears to wrap a coordinate array directly).
7. **`directions.js calculateDistance` swap.** Step 4 should delete this helper and route its two callers through `haversineKm` from `distanceUnits.ts`. T1.1 already established the canonical helper. Confirm I can do this drive-by.

---

## 7. Estimated work after approval

| Step | Effort | Notes |
|---|---|---|
| 2. `src/types/geo.ts` (canonical type, `isValidCoordinate`, `assertCoordinate`) | 0.25d | Per spec |
| 3. `src/utils/coordConverters.ts` with named converters from §1 | 0.5d | ~10 converters |
| 4. Replace internal `{lng, lat}` / `{lat, lon}` / `{lat, lng}` shapes (Category B) | 1.0d | The big block — driven by TS compiler errors |
| 5. Type updates (rename `activityRouteAnalyzer.Coordinate`, tighten `Waypoint`, etc.) | 0.25d | Mechanical |
| 6. Route the 9 Category C sites through converters | 0.25d | Includes deleting `directions.calculateDistance` |
| 7. Runtime assertions (`assertCoordinate`) at boundaries | 0.25d | Per spec's high-risk-site list |
| 8a. Zustand hydration migration | 0.1d | Existing `onRehydrateStorage` from T1.1 already handles partial migration; just extend |
| 8b. Supabase audit + migration script (dry-run mode + reviewed, **not yet applied**) | 0.5d | Heuristic-based detection; requires Travis approval to run |
| 9. Tests (≥6 per spec) | 0.5d | Converter unit tests + migration tests |
| 10. CONTRIBUTING.md update | 0.1d | Single paragraph |
| **Total** | **~3.5d** | Above the spec's 1–2 day estimate. The miss is mostly Category E call sites (5 modules with private normalisers, all of which need TypeScript-driven cleanup) and the proliferation of OSM/POI consumers that took the OSM `{lat, lon}` shape inward instead of converting at the parser. |

If the timeline matters more than perfection, a smaller PR could:
- Land Steps 2, 3, 7, 8a, 9, 10.
- Land Step 4/5/6 only for the **router and elevation seams** (Category C + the half-dozen highest-traffic Category B sites: waypoint API, elevation hover, `routeEditor.findNearestPointOnRoute`).
- Defer the OSM/POI/Overpass internal-shape cleanup to a follow-up like the spec's §"Out of scope" T1.1 tail.

I'd recommend doing the whole thing — the executor in T2 needs the contract enforced end-to-end — but flagging the option in case T2 is time-pressed.

---

**Stop point:** awaiting your decisions on §6 before writing any code.
