# Legacy Routing Module Notes — Reference for T2.1 RouterClient

**Status:** Reference doc for T2.1 implementation
**Source files audited:**
- `src/utils/smartCyclingRouter.js` (431 lines)
- `src/utils/stadiaMapsRouter.js` (802 lines)
- `src/utils/brouter.js` (176 lines)
- `src/utils/directions.js` (706 lines, Mapbox)

This document enumerates the behavior the new `RouterClient` wrappers must
preserve. Each provider adapter wraps its legacy module — it does not
re-implement routing logic. The goal of this audit is to make sure no
hard-won knowledge encoded in the legacy modules is silently lost.

---

## 1. `smartCyclingRouter.js` — fallback orchestration

This is the module being conceptually replaced by `RouterClient`. The new
class hoists its behavior into a registry + iteration loop.

### Profile branching (lines 39–146)

The fallback order is hardcoded by profile:

| Profile          | Primary | Secondary | Tertiary |
|------------------|---------|-----------|----------|
| `gravel`         | brouter | stadia    | mapbox   |
| `mountain`       | brouter | stadia    | mapbox   |
| `road`           | stadia  | brouter   | mapbox   |
| `commuting`      | stadia  | brouter   | mapbox   |

`RouterClient` registry mirrors this exactly. Note: the spec lists `mtb`
and `commute` as profile names; legacy uses `mountain` and `commuting`.
The provider adapters accept either spelling and the registry must too
(see §6 below — profile alias map).

### Confidence values per source

The legacy module decorates each result with a `confidence` and `source`
string. These propagate to the route consumer:

| Source         | Confidence | When                                         |
|----------------|-----------:|----------------------------------------------|
| `brouter_gravel` | 1.0      | BRouter succeeded for gravel/mountain        |
| `stadia_maps`    | 1.0      | Stadia succeeded as primary (road/commute)   |
| `stadia_maps`    | 0.8      | Stadia succeeded as fallback for gravel/mtb  |
| `brouter`        | 0.9      | BRouter succeeded as fallback for road/commute |
| `mapbox_fallback`| 0.7      | Mapbox final fallback                         |

These are confidence scores assigned by `smartCyclingRouter`, not the
underlying providers (Stadia's own `confidence` field is internal). The
new adapters do not reproduce this exact mapping in `RouteSnapshot`
(the executor spec uses `metadata.provider_used` + `metadata.constraint_relaxations`
instead), but the legacy module preserves the data and we should not
regress it.

### Validity filter: `coordinates.length > 10`

Each provider's result is treated as "successful" only if
`result.coordinates.length > 10`. Routes with ≤10 points are discarded
and the next provider is tried. This is a crude but effective
"did we get a real route?" check — empty/degenerate responses can come
back HTTP 200.

**RouterClient must apply this filter** when deciding whether a
provider succeeded — otherwise the fallback chain will short-circuit
on degenerate-but-non-error responses.

### BRouter profile selection (line 130)

For non-gravel routes, BRouter uses `selectBRouterProfile(trainingGoal, surfaceType)`
to map training goals to BRouter profile names. The mapping is in
`brouter.js`:

| Training Goal | BRouter Profile |
|---------------|-----------------|
| `intervals`   | `fastbike`      |
| `tempo`       | `fastbike`      |
| `hills`       | `mtb`           |
| `recovery`    | `safety`        |
| `endurance` (default) | `trekking` |
| `surfacePreference === 'gravel'` | `gravel` (overrides goal) |

For gravel/mountain profiles, the BRouter profile is forced to `gravel`
or `mtb` respectively, ignoring training goal.

**RouterClient note:** training goal lives in `RouteContext`, not
`RouteConstraint`. The BRouterProvider adapter must read it from the
context object passed to `solve()`.

### Telemetry events fired today (must be preserved or superseded)

```
generation_routing_called    { provider, profile, waypoint_count }
generation_routing_succeeded { provider, duration_ms }
generation_routing_failed    { provider, duration_ms, failure_reason }
provider_fallback_chain_advanced { from_provider, to_provider, failure_reason }
```

T2.1 adds `routerclient_*` events alongside these. We do **not** remove
the legacy events — the legacy module still runs in production until
T3 cutover. The new RouterClient events have a different prefix so
there's no collision.

---

## 2. `stadiaMapsRouter.js` — Valhalla wrapper

### Costing-options layering (lines 67–289)

Stadia routes are produced by layering four costing-parameter sources:

1. **Base profile costing** (`ROUTE_PROFILE_COSTING`, lines 67–97). Sets
   `bicycle_type`, `use_roads`, `use_hills`, `cycling_speed`,
   `avoid_bad_surfaces`.
2. **`use_ferry = 0` hard-override** (line 209). Cyclists never get
   routed onto ferries.
3. **Personalized speed** (line 213). If `options.userSpeed > 0`, it
   replaces `cycling_speed`.
4. **Training goal costing** (`TRAINING_GOAL_COSTING`, lines 109–148).
   Merged with the base using *parameter-specific* combination rules:
   - `maneuver_penalty`: take the MAX of base and goal (additive penalty)
   - `use_roads`: take the MIN (lower = more bike-path-friendly)
   - `use_hills`: take the goal's value DIRECTLY (overrides base)
   - everything else: take the MAX
5. **Traffic tolerance** (`TRAFFIC_TOLERANCE_COSTING`, lines 153–167).
   Layered on top:
   - `use_roads`: take the MIN
   - `use_living_streets`: take the MAX
   - `maneuver_penalty`: only applied if no training goal was set
     (training goal is more specific)
6. **Legacy preferences** (lines 278–288). `avoidTraffic === 'high'`
   forces `use_roads: 0`; `avoidHills` forces `use_hills: 0.1`.

These combination rules are non-trivial calibration. The Stadia adapter
calls `getStadiaMapsRoute` directly — it does NOT re-implement the
costing math.

### Request shape

```ts
{
  locations: [{ lat, lon, type: 'break' }, ...],
  costing: 'bicycle',
  costing_options: { bicycle: {...} },
  directions_type: 'maneuvers',
  units: 'kilometers',
  language: 'en-US',
  id: 'tribos-<timestamp>'
}
```

All waypoints use `type: 'break'` (forces routing through them rather
than treating them as soft hints).

### Timeout: 12 seconds (line 320)

`AbortSignal.timeout(12000)`. If exceeded, the fetch rejects with an
`AbortError`. Adapter must map this to `ProviderFailure { kind: 'timeout' }`.

### Error mapping

| HTTP Status | Legacy message                                    | ProviderFailure kind |
|-------------|---------------------------------------------------|----------------------|
| 401         | "Invalid Stadia Maps API key..."                  | `http_error`         |
| 429         | "Rate limit exceeded..."                          | `http_error`         |
| 400         | "Invalid request: <body>"                         | `http_error`         |
| Other 4xx/5xx | "Stadia Maps API error: <status>"               | `http_error`         |
| `data.trip.legs.length === 0` | "No route found between waypoints" | `no_route_found` |
| `AbortError` from timeout | (fetch rejects)                       | `timeout`            |
| Network failure | (fetch rejects, `TypeError`)                  | `network_error`      |

### Response shape (lines 384–398)

```ts
{
  coordinates: [[lng, lat], ...],   // already canonical via decodePolyline
  distance_m: number,                // meters (sum of leg.summary.length * 1000)
  duration_s: number,                // seconds
  distance: number,                  // legacy alias = distance_m
  duration: number,                  // legacy alias = duration_s
  confidence: 1.0,
  source: 'stadia_maps',
  profile: <profile>,
  maneuvers: {...},                  // see extractManeuverData
  trafficScore: number,              // derived from roadClassification
  quietnessScore: number,            // 1 - trafficScore
  roadClassification: {...},
  raw: <full Valhalla response>
}
```

`maneuvers`, `trafficScore`, `quietnessScore`, `roadClassification` are
**not part of `RouteSnapshot`** per the executor spec. The adapter drops
them. This is a behavior change *for the new path* — legacy callers
keep getting them via `smartCyclingRouter.js`. A future revision of
`RouteSnapshot` may add a `metadata.diagnostics` slot for these.

### `isStadiaMapsAvailable()`

Returns `!!(VITE_STADIA_API_KEY && VITE_USE_STADIA_MAPS !== 'false')`.
StadiaProvider should treat absence as a per-call failure with
`http_error` kind (no API key) rather than silently skipping itself.
The registry-level fallback handles unavailability gracefully.

### Polyline precision

Valhalla uses **precision-6 polyline encoding** (1e-6, line 741), not
the standard Google precision-5. The `decodePolyline` function in
`stadiaMapsRouter.js` handles this. Provider adapter does not need to
reimplement — it delegates to the legacy module.

---

## 3. `brouter.js` — OSM-based wrapper

### Endpoint

`https://brouter.de/brouter?lonlats=<lon,lat|lon,lat|...>&profile=<profile>&alternativeidx=0&format=geojson`

GET request. No API key. Public service.

### Profiles (`BROUTER_PROFILES`, lines 10–16)

```ts
GRAVEL    = 'gravel'    // unpaved priority
TREKKING  = 'trekking'  // balanced
FASTBIKE  = 'fastbike'  // road-cycling
MTB       = 'mtb'       // mountain bike
SAFETY    = 'safety'    // quietest routes
```

### Response shape (lines 67–101)

GeoJSON feature with properties as **strings** that must be parsed:

```
track-length      -> distance_m (already meters)
total-time        -> duration_s (seconds)
filtered ascend   -> elevationGain (meters)
filtered descend  -> elevationLoss (meters)
```

Geometry is GeoJSON `[lng, lat]` — already canonical.

### Failure modes

| Condition                       | ProviderFailure kind |
|---------------------------------|----------------------|
| `coordinates.length < 2`        | `invalid_response` (preflight) |
| HTTP non-200                    | `http_error`         |
| `data.features.length === 0`    | `no_route_found`     |
| `fetch` throws                  | `network_error`      |

Legacy module currently returns `null` for all failures. Adapter must
distinguish them.

### **Undocumented constraint: <30 waypoints**

BRouter's public instance silently fails or returns malformed responses
for waypoint counts ≥ 30. This is mentioned in the T2.1 spec but not
enforced in `brouter.js` today. The adapter should:
1. Pre-check `waypoints.length > 30` and return
   `ProviderFailure { kind: 'invalid_response', message: 'BRouter: too many waypoints (max 30)' }`
2. The fallback chain then advances to the next provider.

(Alternative: chunk and stitch. Out of scope for T2.1 — file as
follow-up if it becomes a real problem.)

### No timeout in legacy

`brouter.js` has no explicit timeout. The adapter should add one
(suggest 15s — BRouter is slower than Stadia) and map to
`ProviderFailure { kind: 'timeout' }`.

---

## 4. `directions.js` — Mapbox wrapper

The Mapbox module is the most sprawling. The relevant pieces for the
`MapboxProvider` adapter:

### Two endpoints used

**Map Matching API** (`mapMatchRoute`, lines 17–97):
- Used for fitting a sequence of waypoints to road geometry.
- Map Matching has a **hard limit of 100 waypoints** (line 25). Adapter
  enforces this.
- **Radius fallback (line 39):** tries `[15, 25, 50]` meter radii in
  order. The first one that returns a match with confidence > min
  (`0.25` for ≤4 waypoints, `0.15` for >4) is accepted. If all three
  radii fail, falls through to Directions API.
- This is the heart of "hard-won knowledge" — DO NOT remove the radius
  fallback. The adapter calls `mapMatchRoute` directly.

**Directions API** (`getCyclingDirections`, lines 339–524):
- Used for routing through waypoints with cycling-optimized constraints.
- Mapbox Directions API as of current docs only supports these
  `exclude` values: `ferry`, `cash_only_tolls`, `unpaved`, `tunnel`.
  Historical excludes (`motorway`, `trunk`, `toll`, `primary`) are
  **no longer valid** (line 363). Do not regress.

### Preference-driven profile switching

The legacy module switches between `cycling` and `walking` profiles
based on preferences:
- `wantsUnpaved` (gravel) → walking profile (trails/unpaved access)
- `trafficTolerance === 'low'` + `quietnessLevel === 'high'` → walking
- `bikeInfrastructure === 'required'` → walking
- Default → cycling

This nuance is *not* required for the new `RouterClient.solve()` v1
contract — `RouteConstraint` carries `profile` (road/gravel/mtb/commute)
and `traffic_preference` (low/minimal). The MapboxProvider:
- For `gravel`/`mtb`: profile = walking, exclude `cash_only_tolls,ferry`
  (NOT unpaved)
- For `traffic_preference: 'minimal'`: profile = walking
- For `traffic_preference: 'low'`: profile = cycling, exclude
  `cash_only_tolls,unpaved,ferry`
- Otherwise: profile = cycling, exclude `ferry`

This is a deliberate simplification — Mapbox is the last-resort fallback
for road/commute and the secondary fallback for gravel. It will produce
weaker routes than Stadia/BRouter. That's acceptable for v1.

### Quiet-road alternative scoring (lines 561–632)

`selectQuietestRoute` scores Mapbox alternatives by distance, turn
density, and congestion to pick the quietest. This is a meaningful
quality boost when `traffic_preference === 'low'`. The adapter retains
this — calls `getCyclingDirections` and lets it handle internally.

### Per-request shape

```
https://api.mapbox.com/directions/v5/mapbox/<profile>/<lon,lat;lon,lat;...>?
  alternatives=<bool>&
  geometries=geojson&
  overview=full&
  steps=false&
  annotations=distance,duration[,congestion]&
  exclude=<comma-separated>&
  access_token=<token>
```

### No timeout in legacy

Same as BRouter — adapter adds 12s timeout.

### Response shape (lines 510–519)

```ts
{
  coordinates: [[lng, lat], ...],   // already canonical
  distance: number,                  // METERS (legacy alias; canonical is also added in smartCyclingRouter)
  duration: number,                  // SECONDS
  confidence: 0.9,
  profile: <profile string>,
  trafficScore: number,
  quietnessScore: number,
  congestionData: [...]
}
```

**Important:** Mapbox `route.distance` is meters (the API contract).
The `smartCyclingRouter` wrapper adds `distance_m`/`duration_s` aliases.
`directions.js` itself does not — its return uses bare `distance`/`duration`.
The MapboxProvider adapter normalizes to `distance_m`/`duration_s` at the
boundary.

### Mapbox does NOT return elevation

`elevationGain` / `elevationLoss` are always 0. The
`RouteSnapshot.stats.elevation_gain_m` for Mapbox-sourced routes is 0
— callers that need elevation must run a separate elevation pass
(`fetchElevationProfile`). Out of scope for T2.1; document.

### `supports(profile)` for MapboxProvider

Per the T2.1 spec: "E.g., Mapbox doesn't do gravel well — returns false
for profile: gravel." But the legacy fallback chain DOES land on Mapbox
for gravel as a final resort. We preserve that: `MapboxProvider.supports`
returns `true` for all profiles, with the understanding that gravel
results will be poor. The registry order is what controls "preferred"
provider — `supports` is the hard filter.

This deviates from the spec example. Rationale: matching legacy
behavior is more important than the spec example. Adapter docstring
notes the trade-off.

---

## 5. Cross-cutting concerns

### Distance units at boundaries

All three legacy providers return `distance_m`/`duration_s` (meters /
seconds) per the T1.1 contract. The `RouteSnapshot.stats` shape per the
executor spec expects `distance_km`. Adapters perform the conversion via
`M_TO_KM` from `src/utils/distanceUnits.ts` at the boundary.

`assertKm(stats.distance_km, 'StadiaProvider.stats.distance_km')` is
called at the seam in dev.

### Coordinate format at boundaries

- **Stadia:** request uses `canonicalToValhalla(coord)` per waypoint;
  response polyline decodes to canonical `[lng, lat]`. Already correct.
- **BRouter:** request uses `canonicalToBRouter(coords)`. GeoJSON
  response is canonical. Already correct.
- **Mapbox:** request and response are canonical `[lng, lat]`. Already
  correct.

`assertCoordinate(waypoint, 'StadiaProvider.waypoints[i]')` is called at
entry of each `solve`/`connect` call in dev.

### `connect` vs `solve` distinction

The executor spec distinguishes:
- `solve(constraint, context)`: full preference-aware routing (used by
  the LLM mutation path)
- `connect(waypoints, context)`: minimal "connect-the-dots" geometry
  through an ordered waypoint list (used by manual edits — drag,
  add, remove waypoint)

For the legacy modules:
- Stadia: `connect` uses the same `/route` endpoint with default
  `bicycle` costing (no training-goal layering, no traffic-tolerance
  layering). Just connect through the waypoints with cycling-default
  costing.
- BRouter: `connect` uses the `trekking` profile (balanced default),
  no preference layering.
- Mapbox: `connect` uses `mapMatchRoute` (the radius-fallback flow)
  rather than `getCyclingDirections` — map matching is the right tool
  for "follow this waypoint sequence." If matching fails, falls back
  to the directions endpoint with default settings.

### Iterative route building is NOT in scope for T2.1

`smartCyclingRouter` is called by `iterativeRouteBuilder.js` and other
higher-level modules that produce long routes segment by segment. That
logic stays untouched. RouterClient is a leaf service — it does not
know about iterative composition.

---

## 6. Profile naming alias

Legacy uses `mountain` and `commuting`. Executor spec uses `mtb` and
`commute`. The registry and provider adapters accept either, normalising
on entry to the spec form (`mtb`, `commute`). Internally:

```
mountain  → mtb
commuting → commute
```

The legacy modules continue to receive their legacy names since the
adapter translates back when calling them.

---

## 7. Behavior the new RouterClient deliberately CHANGES

For traceability, things RouterClient does that legacy doesn't:

1. **Request deduplication** (100ms window). Legacy makes redundant
   calls.
2. **Response cache** (LRU, 5min TTL, 100 entries). Legacy has no
   in-memory cache.
3. **`supports()` filtering per provider.** Legacy tries every provider
   in the chain regardless of profile capability. New chain skips
   providers that report unsupported.
4. **Structured `ProviderFailure` types.** Legacy returns `null` for
   all failures (no distinction between timeout, 4xx, empty result, etc.)
5. **Uniform `RouteSnapshot` output.** Legacy returns provider-specific
   blobs decorated with `source`/`confidence` strings.
6. **No silent ferry routing.** Legacy enforces `use_ferry: 0` only in
   Stadia. The new client preserves Stadia's enforcement; BRouter's
   profile defaults already exclude ferries; Mapbox's `exclude=ferry`
   covers it.

What does NOT change:
- Provider ordering per profile (registry mirrors legacy exactly)
- Costing parameter math (delegated to legacy modules)
- Polyline decoding (delegated)
- Radius fallback in Mapbox map matching (delegated)
- BRouter profile selection from training goal (delegated)
- `coordinates.length > 10` validity check (now enforced at adapter)

---

## 8. Open questions surfaced during the audit

These do not block T2.1, but should be tracked:

1. **`source: 'brouter_gravel'` vs `source: 'brouter'`**: legacy
   differentiates. The new `RouteSnapshot.metadata.provider_used`
   collapses to `'brouter'`. We lose information about which BRouter
   profile produced the route. Acceptable, but if a downstream consumer
   needs it, add `metadata.provider_profile` later.

2. **Confidence drop-off**: legacy reports 0.7/0.8/0.9/1.0 confidence
   bands by source. `RouteSnapshot` has no confidence field. The
   executor spec implicitly treats a returned route as "good enough"
   regardless of source. We may want to surface this later for UI
   "this is a fallback result" messaging.

3. **Maneuver/road-classification data from Stadia** is dropped at
   the adapter boundary. Useful for `change_climb_character` and
   future `avoid_segment_by_property` mutations. File as T2.x follow-up
   for ConstraintBuilder / executor wire-up rather than RouterClient
   itself.

4. **No retry logic.** Neither legacy nor new RouterClient retries a
   provider on transient failure (just falls through to the next
   provider). Acceptable; a single retry per provider could be a v1.5
   enhancement.

---

## 9. Provider→legacy module call map

This is the bottom-line contract the adapters honor.

| Adapter method                | Legacy call                                        |
|-------------------------------|----------------------------------------------------|
| `StadiaProvider.solve`        | `getStadiaMapsRoute(waypoints, {profile, preferences, trainingGoal, userSpeed})` |
| `StadiaProvider.connect`      | `getStadiaMapsRoute(waypoints, {profile: 'road'})` (no training-goal layering) |
| `BRouterProvider.solve`       | `getBRouterDirections(waypoints, {profile: <derived>})` |
| `BRouterProvider.connect`     | `getBRouterDirections(waypoints, {profile: 'trekking'})` |
| `MapboxProvider.solve`        | `getCyclingDirections(waypoints, token, {profile, preferences})` |
| `MapboxProvider.connect`      | `mapMatchRoute(waypoints, token, {profile})` (falls back to `getCyclingDirections` internally) |

Adapter implementation is a thin translation layer around these calls.
