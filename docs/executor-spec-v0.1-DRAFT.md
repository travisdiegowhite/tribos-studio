# Tribos Route Builder — RouteOperationExecutor Specification

**Status:** Draft v0.1 — pending review
**Scope:** The shared execution layer for all route mutations (LLM-driven) and manual actions (UI-driven). Implements the executor invariant from Turn Model Spec §3.2.
**Depends on:** Turn Model Spec v1.0 (LOCKED)
**Owner:** Travis

---

## 0. Purpose

The `RouteOperationExecutor` is the **single source of truth** for how routes mutate. Every code path that changes a route — whether triggered by an LLM mutation or a user's manual action — flows through this module.

This spec defines:
- The module's public API (two entry points)
- The internal architecture (mutation translator + router client + service state)
- The `RouteContext` object passed to handlers
- One handler per mutation type and per ManualAction
- Failure modes and rollback behavior
- The `optimize_for` LLM-expansion contract
- Tests required for implementation lock

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Public API (Facade)                      │
│  ─ applyMutation(route, context, mutation) → Result         │
│  ─ applyManualAction(route, context, action) → Result       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌──────────────────┐                  ┌──────────────────┐
│ MutationHandlers │                  │  ManualHandlers  │
│  one per type    │                  │  one per action  │
└────────┬─────────┘                  └────────┬─────────┘
         │                                     │
         └──────────────┬──────────────────────┘
                        ▼
         ┌─────────────────────────────┐
         │  Constraint → Route Layer   │
         │  ─ ConstraintBuilder        │
         │  ─ RouterClient (service)   │
         │     - provider registry     │
         │     - fallback chain        │
         │     - request dedup         │
         │     - response cache        │
         │     - metrics               │
         └─────────────────────────────┘
```

**Pure facade, stateful service** (Tension 1, locked): handlers are pure functions taking `(route, context, input) → Result`. Internally they call into a singleton `RouterClient` service that holds state (caches, metrics, provider registry). Tests can inject a mock `RouterClient`; production wires the real one.

**Two modules, not one** (Tension 2, locked): `MutationHandlers` is logic-only (intent → constraint). `RouterClient` is I/O-only (constraint → route via providers). Neither knows about the other's internals.

---

## 2. Public API

### 2.1 Result type

Every executor entry point returns the same shape:

```ts
type ExecutorResult =
  | { ok: true; route: RouteSnapshot; metadata: ExecutionMetadata }
  | { ok: false; reason: ExecutorFailure; partial?: RouteSnapshot };

type ExecutionMetadata = {
  provider_used: "stadia" | "brouter" | "mapbox";
  duration_ms: number;
  cache_hit: boolean;
  constraint_relaxations?: string[]; // e.g. ["increased_search_radius"]
};

type ExecutorFailure =
  | { kind: "router_unavailable"; providers_tried: string[] }
  | { kind: "constraint_infeasible"; constraint: string; explanation: string }
  | { kind: "waypoint_unreachable"; waypoint_index: number }
  | { kind: "mutation_not_supported"; mutation_type: string }
  | { kind: "context_missing"; required_field: string }
  | { kind: "internal_error"; message: string };
```

The Turn Model dispatcher (Doc 2b) translates `ExecutorFailure` kinds into TurnResponse types — typically `pushback`, but `internal_error` becomes a synthetic `clarify`.

### 2.2 Entry points

```ts
// LLM-driven path
async function applyMutation(
  route: RouteSnapshot | null,    // null for cold_start / replace
  context: RouteContext,
  mutation: Mutation
): Promise<ExecutorResult>;

// LLM-driven path for compositional asks (per Turn Model §9)
async function applyMutations(
  route: RouteSnapshot | null,
  context: RouteContext,
  mutations: Mutation[]
): Promise<ExecutorResult>;

// LLM-driven path for cold_start / replace / alternatives
async function generate(
  context: RouteContext,
  constraints: GenerationConstraints,
  count?: number  // for alternatives; default 1
): Promise<ExecutorResult | ExecutorResult[]>;

// UI-driven path
async function applyManualAction(
  route: RouteSnapshot,
  context: RouteContext,
  action: ManualAction,
  payload: ManualActionPayload
): Promise<ExecutorResult>;
```

`ManualActionPayload` carries the action's parameters — e.g., for `drag_waypoint`, the waypoint index and new coordinate; for `add_waypoint`, the coordinate and optional insertion index.

```ts
type ManualActionPayload =
  | { action: "drag_waypoint"; waypoint_index: number; new_coord: Coordinate }
  | { action: "add_waypoint"; coord: Coordinate; insert_at?: number }
  | { action: "remove_waypoint"; waypoint_index: number }
  | { action: "reverse_route" }
  | { action: "clear_route" };
```

---

## 3. RouteContext

A single object passed to every handler. Bundles everything a mutation might need to translate intent to constraint.

```ts
type RouteContext = {
  // User identity
  user_id: string;

  // Geographic context
  start_coord: Coordinate;           // where the user starts (home, or explicit start)
  current_region_bbox: BBox;         // bounding box of current route or search region

  // Training context
  training_goal: TrainingGoal;       // current goal bucket
  duration_target_minutes?: number;  // user-specified or inferred
  distance_target_km?: number;       // user-specified or inferred

  // User profile
  speed_profile: SpeedProfile;       // kph by terrain type, used for time→distance
  preferences: UserPreferences;      // bike infra, road preferences, surface bias

  // History
  familiar_segments: SegmentId[];    // segments user has ridden (from Strava)
  recent_rides: RideSummary[];       // last N rides for "like Tuesday's ride" references

  // Memory
  persistent_facts: MemoryFact[];    // long-lived user facts
  session_facts: MemoryFact[];       // current-session-only facts

  // Environmental
  weather?: WeatherContext;          // optional; may be unavailable
  time_of_day?: string;              // ISO 8601; affects sun exposure routing
};
```

**Construction rule:** `RouteContext` is built **once per turn** by the prompt-assembly pipeline (Doc 2b) and passed to the executor. Handlers must not mutate it. If a handler needs a field that's missing, it returns `ExecutorFailure { kind: "context_missing" }` rather than fetching it itself. This keeps the executor pure and the context-fetch logic centralized.

---

## 4. Internal Architecture

### 4.1 MutationHandlers

One handler function per mutation type. Each handler:
1. Validates required `RouteContext` fields
2. Translates the mutation into a `RouteConstraint`
3. Calls `RouterClient.solve(constraint, context)` for the new geometry
4. Returns `ExecutorResult`

```ts
type MutationHandler = (
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Mutation
) => Promise<ExecutorResult>;

const mutationHandlers: Record<Mutation["type"], MutationHandler> = {
  extend_distance: handleExtendDistance,
  shorten_distance: handleShortenDistance,
  // ...one per mutation type (19 total)
};
```

### 4.2 ManualHandlers

One handler per ManualAction. Each handler:
1. Computes the new waypoint array from the action
2. Calls `RouterClient.connect(waypoints, context)` to get geometry through them
3. Returns `ExecutorResult`

```ts
type ManualHandler = (
  route: RouteSnapshot,
  context: RouteContext,
  payload: ManualActionPayload
) => Promise<ExecutorResult>;

const manualHandlers: Record<ManualAction, ManualHandler> = {
  drag_waypoint: handleDragWaypoint,
  add_waypoint: handleAddWaypoint,
  remove_waypoint: handleRemoveWaypoint,
  reverse_route: handleReverseRoute,
  clear_route: handleClearRoute,
};
```

### 4.3 ConstraintBuilder

A pure utility module. Takes a mutation + current route + context and emits a `RouteConstraint`. This is where the intent-to-constraint logic lives.

```ts
type RouteConstraint = {
  // Required
  waypoints: Coordinate[];          // ordered points the route must pass through

  // Optional preferences (router treats as soft constraints)
  target_distance_km?: number;
  target_elevation_gain_m?: number;
  surface_preference?: SurfaceMix;
  traffic_preference?: "low" | "minimal";
  avoid_segments?: SegmentId[];
  prefer_segments?: SegmentId[];    // familiar roads when swap_to_familiar fires
  exclude_segments?: SegmentId[];   // unfamiliar avoidance when swap_to_familiar fires
  profile: RoutingProfile;          // road / gravel / mtb / commute
  shape: "loop" | "out_and_back" | "point_to_point";
};
```

Each mutation handler imports `buildConstraintFor<MutationType>` from ConstraintBuilder. Example:

```ts
async function handleReduceClimbing(route, context, mutation) {
  const currentElev = route.stats.elevation_gain_m;
  const targetReduction = MAGNITUDE_TO_FRACTION[mutation.magnitude]; // 0.15/0.30/0.50
  const targetElev = currentElev * (1 - targetReduction);

  const constraint = ConstraintBuilder.forReducedClimbing({
    currentRoute: route,
    targetElevation_m: targetElev,
    scope: mutation.scope,
    context,
  });

  return RouterClient.solve(constraint, context);
}
```

### 4.4 RouterClient (the stateful service)

The only stateful component. Responsibilities:

- **Provider registry:** maps `profile → ordered provider list` (configurable, replacing current hardcoded if/else)
- **Fallback chain:** tries providers in order; falls through on failure
- **Request dedup:** identical constraint within 100ms → single network call
- **Response cache:** keyed by `hash(constraint)`, TTL 5min, capped at ~100 entries (LRU)
- **Metrics:** records `provider_used`, `duration_ms`, `cache_hit` per call (logged for later analysis)

```ts
class RouterClient {
  async solve(
    constraint: RouteConstraint,
    context: RouteContext
  ): Promise<ExecutorResult>;

  async connect(
    waypoints: Coordinate[],
    context: RouteContext
  ): Promise<ExecutorResult>;
}
```

Provider registry format:

```ts
type ProviderConfig = {
  profile: RoutingProfile;
  providers: ProviderName[];  // ordered, first = preferred
};

const REGISTRY: ProviderConfig[] = [
  { profile: "gravel", providers: ["brouter", "stadia", "mapbox"] },
  { profile: "mtb",    providers: ["brouter", "stadia", "mapbox"] },
  { profile: "road",   providers: ["stadia", "brouter", "mapbox"] },
  { profile: "commute", providers: ["stadia", "brouter", "mapbox"] },
];
```

This replaces the hardcoded fallback in current `smartCyclingRouter.js`. Registry is a const array but the data shape supports future user-level overrides ("always use BRouter for me").

---

## 5. Mutation Handler Specifications

Specifies what each of the 19 mutation handlers does. Each entry includes: required context, constraint construction, and the failure modes specific to that mutation.

### 5.1 Geometric

**`extend_distance { delta_km, scope? }`**
- Required context: `speed_profile`, `start_coord`
- Constraint: keep all current waypoints; if scope is set, add intermediate waypoints within scope that increase length; if unscoped, extend after the last waypoint by adding a detour loop. Target distance = current + delta_km.
- Failure modes: infeasible if extension would exit serviceable area (return `constraint_infeasible`).

**`shorten_distance { delta_km, scope? }`**
- Required context: none beyond defaults
- Constraint: if scoped, remove waypoints within scope; if unscoped, trim from end (default behavior — `trim_route` is the explicit version).
- Failure modes: cannot shorten below ~2km minimum useful route (return `constraint_infeasible`).

**`trim_route { from, amount_km }`**
- Required context: none
- Constraint: directly truncate geometry; recompute waypoints. No router call needed unless trim creates a disconnected segment.
- Failure modes: trim amount ≥ route length (return `constraint_infeasible`).

**`reverse_route`**
- Required context: none
- Constraint: reverse waypoint array; re-route through them. Routing direction may differ from straight reversal due to one-way streets.
- Failure modes: rare; if reversed direction has unreachable segments, return `waypoint_unreachable`.

**`smooth_route { target }`**
- Required context: none
- Constraint:
  - `remove_doublebacks`: detect segments traversed in both directions; reroute to skip
  - `remove_dead_ends`: detect out-and-back tails that aren't endpoints; trim
  - `simplify_turns`: reduce waypoint count via Douglas-Peucker, then re-route
- Failure modes: if smoothing would change distance by >20%, return `constraint_infeasible` (user probably wants a different mutation).

**`change_route_shape { target }`**
- Required context: `start_coord`
- Constraint:
  - `loop`: enforce end = start (close to start_coord)
  - `out_and_back`: select midpoint, route start→midpoint, reverse-replicate
  - `point_to_point`: relax loop closure if currently enforced
- Failure modes: out_and_back from current loop may not preserve total distance well; report relaxation in metadata.

### 5.2 Climbing

**`increase_climbing { magnitude, scope? }`** / **`reduce_climbing { magnitude, scope? }`**
- Required context: `familiar_segments` (helps find known climbs nearby)
- Constraint: target elevation = current ± `MAGNITUDE_TO_FRACTION[magnitude]`. Magnitude mapping:
  ```
  small:    0.15   (±15%)
  moderate: 0.30   (±30%)
  large:    0.50   (±50%)
  ```
- For `increase`: prefer waypoints near known climbing roads in region
- For `reduce`: avoid waypoints with elevation gain > target/length proportionally
- Failure modes: cannot increase if region has no significant elevation (return `constraint_infeasible`).

**`change_climb_character { target, scope? }`**
- Required context: none beyond defaults
- Constraint: this is more about *how* elevation is distributed than total amount.
  - `punchy`: bias toward roads with multiple climbs >5% lasting <2min each
  - `sustained`: bias toward single longer climbs at 3-6%
  - `rolling`: alternating up/down, no climb >5min
  - `flat`: strict elevation ceiling (~50ft/mi)
- Implementation: routing layer needs segment classification by climb type; ConstraintBuilder emits `prefer_segments` / `avoid_segments` based on classification.
- Failure modes: if region lacks the requested character (e.g., "punchy" in flat plains), return `constraint_infeasible` with explanation.

### 5.3 Routing preferences

**`change_surface_mix { target, scope? }`**
- Required context: none
- Constraint: pass `surface_preference: target` to router. Different providers handle this differently:
  - BRouter: native gravel/road profile selection
  - Stadia: costing parameter weights
  - Mapbox: limited; falls back to road-only with warning in metadata
- Failure modes: requested mix infeasible in region (e.g., 80% gravel in Manhattan).

**`change_traffic_preference { target, scope? }`**
- Required context: none
- Constraint: pass `traffic_preference: target` to router.
  - `low`: avoid arterials and highways
  - `minimal`: avoid anything but residential/bike-priority roads
- Failure modes: `minimal` may produce disconnected route in some regions; falls back to `low` with relaxation noted.

**`avoid_exposure { exposure_type, condition? }`**
- Required context: `weather` (for wind direction), `time_of_day` (for sun position)
- Constraint:
  - `wind`: identify exposed roads (north-south, no tree cover) and avoid based on wind direction
  - `sun`: avoid east-west roads during low-sun hours
- Failure modes: if weather context unavailable, return `context_missing { required_field: "weather" }`. v1 may always return this; v1.5 wires weather.

### 5.4 Anchoring & avoidance

**`anchor_through { coordinate }`**
- Required context: none
- Constraint: insert coordinate as waypoint; route through it. Insertion position: nearest to current geometry (minimize detour distance).
- Failure modes: coordinate unreachable from existing waypoints (return `waypoint_unreachable`).

**`anchor_at_poi { poi_query, poi_type?, position_hint? }`**
- Required context: none
- Constraint:
  1. POI lookup via Overpass (cached): query string + optional type filter
  2. If multiple matches, pick by `position_hint` (`start`/`middle`/`end` of current route) or nearest to route geometry
  3. Insert resolved coordinate as anchor_through
- Failure modes: no POI matches (return `constraint_infeasible` with explanation "no [query] found near route"); ambiguous matches → ConstraintBuilder picks closest but logs alternatives in metadata.

**`avoid_segment { segment_id }`**
- Required context: none
- Constraint: pass segment_id to router's `avoid_segments` list.
- Failure modes: avoiding segment makes route impossible (return `constraint_infeasible`).

**`avoid_segment_by_property { property, locator? }`**
- Required context: route already analyzed for segment properties (current route's analysis layer)
- Constraint:
  1. Find segments in current route matching property (+ locator narrowing)
  2. Add to `avoid_segments`
  3. Re-route
- Failure modes: no segments match property in current route (return `constraint_infeasible` — model should have emitted `explain` instead).

### 5.5 Familiarity

**`swap_to_familiar { region }`** / **`swap_to_unfamiliar { region }`**
- Required context: `familiar_segments`
- Constraint:
  - `familiar`: `prefer_segments: intersect(familiar_segments, region)`
  - `unfamiliar`: `exclude_segments: intersect(familiar_segments, region)`
- Failure modes:
  - `familiar` with no familiar segments in region: return `constraint_infeasible` ("no rides logged in this area")
  - `unfamiliar` where entire region is familiar: route may use familiar roads anyway with warning in metadata

### 5.6 High-level

**`optimize_for { criterion }`**

**Per locked design (Tension 5, Option Y): the LLM is required to expand this mutation into component mutations BEFORE the executor sees it.** The executor handler for `optimize_for` exists only as a safety net.

```ts
async function handleOptimizeFor(route, context, mutation) {
  // The LLM should have expanded this. If we get here, the LLM violated the contract.
  return {
    ok: false,
    reason: {
      kind: "mutation_not_supported",
      mutation_type: "optimize_for (must be LLM-expanded)"
    }
  };
}
```

The Turn Model dispatcher (Doc 2b) will convert this to a `pushback` and re-prompt the LLM with stronger guidance. After two failed expansions, the system falls back to a hardcoded default expansion (defined in Doc 2b §X — TBD).

Initial expansion guidance for the LLM (lives in the system prompt):
- `scenery`: bike paths preferred, low traffic, avoid commercial corridors. Expand to: `change_surface_mix { path: 0.4, road: 0.5, gravel: 0.1 }`, `change_traffic_preference { target: "low" }`
- `training_value`: matches current training goal exactly; expand to constraints derived from `context.training_goal`
- `speed`: minimize stops/turns. Expand to: `smooth_route { target: "simplify_turns" }`, `change_traffic_preference { target: "low" }`
- `social`: routes near common ride start points / coffee stops. Expand to: `anchor_at_poi { poi_query: "popular cycling cafe" }` + region-bias toward known group ride routes (memory facts).

**Open: the LLM's expansion is *suggested* not *prescribed*.** The LLM may emit a different valid expansion if context warrants. This is what makes `optimize_for` the "conversational moat" — the LLM uses cycling expertise + user context to define the criterion contextually. The cost is reduced determinism, which is exactly what option Y trades.

---

## 6. ManualHandler Specifications

### 6.1 `drag_waypoint`
- Payload: `{ waypoint_index, new_coord }`
- Behavior: replace waypoints[index] with new_coord; call `RouterClient.connect(waypoints, context)` for new geometry between neighbors of dragged point.
- Optimization: only re-route the affected segments (between index-1 → index and index → index+1), not the entire route.
- Failure modes: new_coord unreachable from neighbors (return `waypoint_unreachable`); revert handled by Turn Model dispatcher per §11 of Turn Model spec.

### 6.2 `add_waypoint`
- Payload: `{ coord, insert_at? }`
- Behavior:
  - If `insert_at` provided: splice coord into waypoints at that index
  - Otherwise: find nearest segment of current route to coord, splice between those waypoints
- Re-route affected segments only.

### 6.3 `remove_waypoint`
- Payload: `{ waypoint_index }`
- Behavior: remove waypoints[index]; re-route between index-1 and index+1.
- Failure modes: removing leaves fewer than 2 waypoints → return `constraint_infeasible`.

### 6.4 `reverse_route`
- Payload: none
- Behavior: same as `reverse_route` mutation handler. (Shared implementation; both entry points call the same internal function.)

### 6.5 `clear_route`
- Payload: none
- Behavior: returns empty route. No router call.
- This is the only handler that returns a route with `geometry: []` and `waypoints: []`.

---

## 7. Failure Handling & Rollback

### 7.1 Single-mutation failure
`applyMutation` returns `{ ok: false, reason }`. Caller (Turn Model dispatcher) decides UX.

### 7.2 Compositional mutation failure (Turn Model spec §9)
`applyMutations(route, context, mutations[])` applies sequentially. On any failure:
1. Discard all mutations applied so far
2. Return `{ ok: false, reason }` where `reason.kind` reflects the failing mutation
3. The route passed to subsequent dispatch remains the pre-turn state

Implementation: applyMutations holds the original route, threads each handler's output as the next handler's input, and returns the final result only if all succeeded.

```ts
async function applyMutations(originalRoute, context, mutations) {
  let current = originalRoute;
  for (const mutation of mutations) {
    const result = await applyMutation(current, context, mutation);
    if (!result.ok) {
      return { ok: false, reason: result.reason, partial: originalRoute };
    }
    current = result.route;
  }
  return { ok: true, route: current, metadata: /* aggregated */ };
}
```

### 7.3 ManualAction failure
`applyManualAction` returns `{ ok: false, reason }`. The Turn Model dispatcher reverts the route to `before` state per Turn Model spec §12.

### 7.4 Router unavailable
If all providers in the fallback chain fail, `RouterClient.solve` returns `{ ok: false, reason: { kind: "router_unavailable", providers_tried: [...] } }`. Mutation handler propagates.

---

## 8. Caching

### 8.1 RouterClient response cache
- Key: `hash(constraint)` where constraint is canonicalized JSON (sorted keys, normalized coords to 6-decimal precision)
- TTL: 5 minutes
- Capacity: 100 entries, LRU eviction
- Scope: in-memory only (no localStorage), per-tab
- Cache hits set `metadata.cache_hit = true`

### 8.2 POI lookup cache (for `anchor_at_poi`)
- Key: `(poi_query, region_bbox_quantized)`
- TTL: 1 hour
- Scope: in-memory

### 8.3 What is NOT cached
- Elevation profiles (recomputed each time — cheap)
- Segment property analysis (route-specific, recomputed)
- RouteContext fields (built fresh each turn by Doc 2b)

---

## 9. Metrics

Every successful or failed execution emits a metric event:

```ts
type ExecutorMetric = {
  event: "mutation_executed" | "manual_action_executed" | "executor_failure";
  mutation_type?: Mutation["type"];
  action?: ManualAction;
  duration_ms: number;
  provider_used?: string;
  cache_hit?: boolean;
  failure_kind?: ExecutorFailure["kind"];
  user_id: string;
  timestamp: string;
};
```

Logged to PostHog. Enables:
- Which mutations succeed/fail most often (informs LLM prompt iteration)
- Which providers handle which mutations best (informs registry tuning)
- Cache effectiveness (informs TTL/capacity tuning)
- Latency budgets (informs which mutations need optimization)

---

## 10. Coordinate & Distance Invariants

Per Turn Model spec §10–§11:
- All coordinates are `[lng, lat]`
- All distances are kilometers with `_km` suffix; meters use `_m` suffix
- ConstraintBuilder and RouterClient enforce these at module boundaries (runtime asserts in dev; lint rules in prod build)

---

## 11. Testing Requirements

The executor is the load-bearing component. Test coverage is non-negotiable.

### 11.1 Unit tests (target: 90% coverage)
- One positive test per mutation handler (happy path)
- One negative test per mutation handler (most likely failure mode)
- One test per ManualAction
- ConstraintBuilder: pure function tests for each `buildConstraintFor*`
- RouterClient: mocked-provider tests for fallback chain, dedup, cache, metrics

### 11.2 Integration tests
- `applyMutations` rollback on failure
- ManualAction → executor → router → result, with real (or test-environment) router
- `optimize_for` LLM-violation path: emit raw `optimize_for`, verify `mutation_not_supported` returned
- Cache hit/miss behavior

### 11.3 Contract tests
- Shared executor invariant: enumerate all Mutation types and verify exactly one handler exists; enumerate all ManualAction types and verify same
- ExecutorResult shape: every entry point returns a valid result shape

### 11.4 Property tests (recommended, not required)
- For any RouteSnapshot + Mutation, applyMutation either returns a valid RouteSnapshot or a valid ExecutorFailure (never throws, never returns invalid shape)

---

## 12. Open Questions (resolve before lock)

1. **`smooth_route` distance change threshold.** I picked 20% as the cutoff for "this changed too much, return infeasible." Probably needs tuning post-beta.
2. **Magnitude → fraction mapping for climbing.** Picked 0.15/0.30/0.50. Worth checking against real ride data — does "moderate" reduction feel like 30% or 20%?
3. **Cache capacity (100 entries).** Probably enough for a single user session; revisit if memory profiling shows pressure.
4. **`anchor_at_poi` ambiguity handling.** When multiple POIs match, I picked "nearest to route geometry" as the heuristic. Could instead emit `clarify`. Latter is more conversational but adds a round-trip.
5. **`optimize_for` fallback expansion.** Doc 2b needs to define the hardcoded fallback when the LLM fails to expand. Listed in §5.6.

---

## 13. Amendments to Turn Model Spec (LOCKED v1.0)

§3.2 of Turn Model Spec says "The executor exposes one handler per mutation type and one per ManualAction." This is true but undersells the architecture. Proposed amendment language for v1.1 of Turn Model Spec:

> §3.2 (revised): The `RouteOperationExecutor` exposes two entry points — `applyMutation` for LLM-driven changes and `applyManualAction` for UI-driven changes. Both entry points dispatch to a shared internal handler layer with one handler per mutation type (19) and one per ManualAction (5). The handler layer is pure; routing I/O and state live in a separate `RouterClient` service. Detailed specification in the RouteOperationExecutor Specification document.

Travis to decide: amend Turn Model v1.0 → v1.1, or leave as-is and treat this doc as the authoritative elaboration.

---

**Next doc:** Doc 2b — Conversational AI Pipeline (the prompt template, dispatcher, Claude API integration). The executor is the engine; Doc 2b is the steering wheel.
