# ConstraintBuilder

**Status:** Shipped in T2.2 (no production callers — T2.3 MutationHandlers wires it in).
**Module:** `src/routing/executor/ConstraintBuilder/`
**Depends on:** T1.1 (distance units), T1.2 (coordinate format), T1.4 (telemetry), T2.1 (RouterClient).
**Blocks:** T2.3 (MutationHandlers), T2.5 (Executor facade).

## What this is

ConstraintBuilder is the pure-logic translation layer between mutations (the LLM's expressed intent) and `RouteConstraint` objects (the router's input). Every one of the 19 mutation types from Turn Model Spec §3.1 has a corresponding `buildConstraintFor<MutationType>` function. The top-level `buildConstraint` dispatches based on `mutation.type`.

Single-shot architecture: each mutation produces exactly one `RouteConstraint`. No iteration, no I/O, no re-routing. RouterClient (T2.1) handles "go from A to B"; ConstraintBuilder decides what A and B should be given an intent like "reduce climbing moderately."

## Public API

```ts
import { buildConstraint, ConstraintBuilderError } from '@/routing/executor/ConstraintBuilder';

const constraint = buildConstraint(route, context, mutation);
```

Signature:

```ts
function buildConstraint(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Mutation,
): RouteConstraint;
```

Throws `ConstraintBuilderError` with one of three `kind` values:

- `context_missing` — required RouteContext field absent (e.g., `avoid_exposure(wind)` without `weather.wind_direction_deg`)
- `unsupported_mutation` — handler is a stub, or the safety-net `optimize_for` was emitted
- `infeasible_constraint` — input arithmetic doesn't make sense (e.g., trim 999km from a 10km route)

T2.3 MutationHandlers will catch these and map to `ExecutorFailure`:

| ConstraintBuilderError.kind | ExecutorFailure.kind |
|---|---|
| `context_missing` | `context_missing` |
| `unsupported_mutation` | `mutation_not_supported` |
| `infeasible_constraint` | `constraint_infeasible` |

## Confidence ratings

Per the spec, each handler is labeled. The ratings inform post-beta tuning priorities and tell the conversational layer (Doc 2b) where the LLM should set user expectations.

| Mutation | Rating | Notes |
|---|---|---|
| `extend_distance` | reliable | |
| `shorten_distance` | reliable | |
| `trim_route` | reliable | |
| `reverse_route` | reliable | trivial |
| `smooth_route` | best-effort | segment-ID attribution stubs out v1 |
| `change_route_shape` | best-effort | out_and_back midpoint may land on non-roads |
| `increase_climbing` | reliable | |
| `reduce_climbing` | reliable | empty avoid_segments in v1 |
| `change_climb_character` | experimental (STUB) | requires segment classification |
| `change_surface_mix` | reliable | |
| `change_traffic_preference` | reliable | |
| `avoid_exposure` | experimental | weather integration lands v1.5 |
| `anchor_through` | reliable | |
| `anchor_at_poi` | best-effort (STUB) | requires Overpass API |
| `avoid_segment` | reliable | |
| `avoid_segment_by_property` | best-effort (STUB) | requires segment classification |
| `swap_to_familiar` | reliable | |
| `swap_to_unfamiliar` | reliable | |
| `optimize_for` | safety-net | LLM-expansion contract; throws on fire |

The constant `CONFIDENCE_RATINGS` is exported for tooling.

## The three stubs

All three throw `ConstraintBuilderError { kind: 'unsupported_mutation' }`. They are NOT to be implemented opportunistically — discuss with Travis first.

### `change_climb_character`
Character mutations need either segment-level classification of climb types, iterative search (excluded by v1 architecture), or heuristic prompt-engineering. None is settled.

### `anchor_at_poi`
Needs Overpass API integration. Open questions:
1. POI lookup inside ConstraintBuilder (violates pure-function rule) or upstream in T2.3?
2. Ambiguity handling when multiple POIs match?
3. POI type enum?
4. Caching strategy?

### `avoid_segment_by_property`
Needs the route's segment property analysis layer. Some classification work exists in `routeScoring.js` and `activityRouteAnalyzer.ts` but the integration boundary is undefined.

## The `optimize_for` safety net

Per Option Y, the LLM must expand `optimize_for { criterion }` into component mutations *before* emitting. If a raw `optimize_for` reaches ConstraintBuilder, the LLM violated its contract. The handler throws so the dispatcher can issue a `pushback` and re-prompt the LLM.

If telemetry shows `constraint_failed` events with `mutation_type: optimize_for` in production, the LLM prompt needs correction — not the executor.

## Magnitude semantics

```ts
const MAGNITUDE_TO_FRACTION = { small: 0.15, moderate: 0.30, large: 0.50 };
```

Applied to climbing and (indirectly) distance mutations:
- `increase_climbing { magnitude: 'moderate' }` targets `current_gain × 1.30`
- `reduce_climbing { magnitude: 'large' }` targets `current_gain × 0.50`

These values are gut-feel. Beta data will tell us whether "moderate" should be 30% or 20%. **Locked for v1** — flagged with a `TODO` in `shared/magnitudes.ts` for post-beta revisit. Do not tune now.

## Scope semantics

Scoped mutations (`extend_distance`, `shorten_distance`, `increase_climbing`, `reduce_climbing`, `change_climb_character`, `change_surface_mix`, `change_traffic_preference`) accept `scope?: { start_km, end_km }`.

Helper functions in `shared/scopeUtils.ts`:
- `cumulativeKmAlongGeometry(geometry)` — running km tally per point
- `totalDistanceKm(route)` — full route km
- `waypointKmOffsets(route)` — km offset for each waypoint (snap-to-geometry)
- `waypointsInScope(route, scope)` — waypoints whose offset is in the window
- `splitByScope(route, scope)` — partitions geometry into before / within / after
- `geometryIndexAtKm(route, targetKm)` — nearest geometry index to a target km

Distances flow through the canonical `haversineMeters` from `src/utils/distanceUnits.ts`.

## Elevation semantics

Helpers in `shared/elevationUtils.ts`:
- `totalElevationGain_m(route)` — sum of positive per-point deltas, falls back to `stats.elevation_gain_m`
- `elevationGainInScope_m(route, scope)` — scope-bounded gain, pro-rates by distance fraction when per-point elevations missing
- `maxSustainedGrade(route, windowMinLengthM)` — sliding-window max grade

When `route.elevations_m` is absent, scope-restricted gains are approximated proportionally — accurate enough for "reduce by 30%" intent translation; not accurate enough for fine-grained segment surgery.

## Telemetry

ConstraintBuilder is pure but emits debug events via `trackRouteBuilder` (T1.4). All event names are prefixed `route_builder_`.

| Event | When | Properties |
|---|---|---|
| `constraint_built` | Successful translation | `mutation_type`, `scoped`, `confidence` |
| `constraint_failed` | Handler threw `ConstraintBuilderError` | `mutation_type`, `error_kind`, `error_message` (truncated to 200 chars) |
| `constraint_stub_called` | One of the three stubs fired | `mutation_type` |

`constraint_stub_called` is the signal that tells the team which stubs the LLM is actively trying to emit — a prioritization input for post-launch stub implementation.

## Path to graduation

The ratings are statements about v1, not permanent grades. A handler graduates when its dependent layer matures:

- `smooth_route` → reliable once segment IDs are attached to geometry
- `reduce_climbing` → upgraded once steep-segment detection lands
- `change_route_shape` → reliable once out_and_back midpoint selection respects the road network
- `avoid_exposure` → best-effort once weather integration ships (v1.5); reliable once exposure heuristics are tuned
- All three stubs → see the open questions above; each unblocks separately

## What ConstraintBuilder is NOT

- Not an iterator. Single shot. If a result doesn't perfectly match intent, that's acceptable for v1.
- Not a router. It doesn't call RouterClient. It produces the input.
- Not a stylist. It doesn't decide rendering, prose, or chat replies — that's Doc 2b's conversational layer.
- Not the place to fix router-capability gaps. If `extend_distance { delta_km: 100 }` produces a 30km route, that's a router/provider issue.

## File map

```
src/routing/executor/
  types.ts                          # RouteConstraint, Mutation, RouteContext, …
  ConstraintBuilder/
    index.ts                        # public exports
    ConstraintBuilder.ts            # dispatcher + CONFIDENCE_RATINGS
    ConstraintBuilderError.ts       # error class
    handlers/
      *.ts                          # one per mutation type (19 files)
    shared/
      magnitudes.ts                 # MAGNITUDE_TO_FRACTION
      scopeUtils.ts                 # km-offset + scope helpers
      elevationUtils.ts             # gain + grade helpers
    __tests__/
      ConstraintBuilder.test.ts     # dispatcher + telemetry tests
      fixtures.ts                   # shared test fixtures
      shared/                       # utility tests
      handlers/                     # per-category handler tests
```
