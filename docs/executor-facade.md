# Executor Facade (T2.5)

**Status:** Shipped — completes Tier 2 executor build.
**Owner:** Travis
**Depends on:** T2.1 RouterClient, T2.2 ConstraintBuilder, T2.3 MutationHandlers, T2.4 ManualHandlers.

---

## What this is

`src/routing/executor` is the single public API for every route-changing
operation in tribos.studio. Production code imports from
`src/routing/executor` — never from the submodules directly. The
top-level barrel re-exports the `Executor` class, the singleton
accessors, and the public type surface.

```ts
import { getExecutor } from 'src/routing/executor';
import type { RouteContext, GenerationConstraints } from 'src/routing/executor';

const executor = getExecutor();
const result = await executor.generate(context, { duration_minutes: 90 });
```

The facade wraps four operations from Executor Spec §2.2 into a single
class:

| Method | Behavior |
|---|---|
| `applyMutation(route, context, mutation)` | Delegates to `MutationHandlers.applyMutation`. |
| `applyMutations(route, context, mutations[])` | Delegates to `MutationHandlers.applyMutations` (sequential, all-or-nothing rollback). |
| `applyManualAction(route, context, action, payload)` | Delegates to `ManualHandlers.applyManualAction`. |
| `generate(context, constraints, count?)` | Novel — see below. |

Three of the four operations are pure delegation. The novel piece is
`generate()`.

---

## `generate()` semantics

`generate()` is the cold-start / replace / alternatives path. There is
no current route to mutate, so the executor maps `GenerationConstraints`
directly to a `RouteConstraint` and calls `RouterClient.solve` — it does
**not** go through `ConstraintBuilder`. ConstraintBuilder's job is
intent → constraint translation; cold-start has no mutation to
translate.

### `count: 1` (default)

Returns a single `ExecutorResult`. The discriminated overload signature
lets callers avoid unwrapping an array:

```ts
const result = await executor.generate(context, constraints);
// result is ExecutorResult, not ExecutorResult[]
```

Implementation:

1. Translate `GenerationConstraints` → `RouteConstraint`:
   - `waypoints` = seeded from `like_ride_id` if present and resolvable,
     otherwise a radial loop from `start_coord`.
   - `target_distance_km` = `distance_km` if set, else derived from
     `duration_minutes * (speed_profile.flat_kph / 60)`.
   - `profile` = `context.profile ?? 'road'`.
   - `shape` = `'loop'`.
2. Call `RouterClient.solve(constraint, context)`.
3. Return its `ExecutorResult` unchanged.

### `count: 3` (alternatives)

Returns an array of three `ExecutorResult`s, produced in parallel:

```ts
const alts = await executor.generate(context, constraints, 3);
// alts.length === 3, each entry independently ok/!ok
```

Implementation:

1. Translate constraints once into a base `RouteConstraint`.
2. Produce three variety perturbations of the base (see below).
3. Call `RouterClient.solve` three times **in parallel** via
   `Promise.all`. Each call is independent; one alternative failing
   does not abort the others.
4. Failures land in the array as `{ ok: false, reason: ... }` entries
   — `generate()` never throws on routing failure.

If constraint construction itself fails (e.g., `context_missing`), the
array still has length 3 — every entry carries the same failure shape.
Callers can treat the result uniformly.

### `like_ride_id` resolution

If `constraints.like_ride_id` is set, `generate()` looks up the matching
ride in `context.recent_rides`. On hit, it reuses the past ride's
waypoints as the seed (the router re-snaps geometry through the modern
road network). On miss (ride ID not in `recent_rides`, or
`recent_rides` undefined), it silently falls through to the radial loop
seed.

This is by design — the executor doesn't fail closed on missing context
references; the upstream pipeline is responsible for populating
`recent_rides` correctly. If beta users report "I asked for a route
like Tuesday's but got something random," check `recent_rides`
upstream.

---

## Variety strategy

`generate({ count: 3 })` produces three alternatives by perturbing the
base constraint along three cardinal directions: north, east, south.
West is deliberately omitted — three matches the existing AI Mode UX
(3 suggestions).

```ts
varietyPerturbation(base, 'cardinal_north') // seed midpoint due north
varietyPerturbation(base, 'cardinal_east')  // seed midpoint due east
varietyPerturbation(base, 'cardinal_south') // seed midpoint due south
```

Each perturbation replaces the base waypoints with a loop seed:
`[start, seed_midpoint, start]`. The seed midpoint sits
`target_distance_km / 4` away from start in the chosen direction. The
router fills in real geometry through real roads; the perturbation only
biases the search neighborhood.

**v1 limitations (intentional):**

- West direction is missing — three perturbations, not four.
- The same target_distance is used for all three; no per-alternative
  distance variation.
- No surface, elevation, or familiarity variation.

**Post-beta tuning targets** (if alternatives feel too similar):

- Vary surface mix (e.g., one alternative biased toward gravel).
- Vary elevation emphasis (one flatter, one hillier).
- Vary familiar/unfamiliar bias when `familiar_segments` is rich.
- Daily rotation per `routeGenerationFallback` Tier 2 pattern
  (`new Date().getDay() % cardinals.length` selects the starting
  bearing).

---

## Singleton access

The facade is a class with a singleton accessor mirroring the
`RouterClient` pattern:

```ts
export function getExecutor(): Executor;        // production accessor
export function setExecutor(e: Executor | null): void;  // test injection
```

`getExecutor()` lazy-instantiates on first call and returns the same
instance on subsequent calls. Tests reset between runs via
`setExecutor(null)` in `afterEach`. The hot-reload caveat from
RouterClient applies — in Vite dev mode the executor may instantiate
multiple times across hot reloads; acceptable for dev.

---

## Telemetry events

All telemetry routes through `trackRouteBuilder` (T1.4), which prefixes
events with `route_builder_`. The facade adds an additional
`executor_` prefix for `generate()` events; the three passthrough
methods inherit telemetry from the layers they delegate to
(`mutation_handler_*`, `manual_handler_*`, `routerclient_*`).

| Event | When | Properties |
|---|---|---|
| `route_builder_executor_generate_called` | Entry to `generate()` | `count`, `has_like_ride_id`, `target_distance_km` |
| `route_builder_executor_generate_succeeded` | All-paths success | `count`, `duration_ms`, `provider_used` (most-used across alternatives) |
| `route_builder_executor_generate_partial` | Some alternatives failed (count: 3 only) | `successful_count`, `failed_count`, `duration_ms` |
| `route_builder_executor_generate_failed` | All paths failed | `count`, `duration_ms`, `failure_kind` |

---

## Import convention

**Production code imports only from `src/routing/executor`.** Never
from the submodules. The submodules are implementation details and
may be reorganised without notice.

```ts
// ✅ correct
import { getExecutor, type Mutation } from 'src/routing/executor';

// ❌ wrong — internal module path
import { applyMutation } from 'src/routing/executor/MutationHandlers';
```

Test code may reach into submodules for stubbing
(`setRouterClient` from `src/routing/RouterClient` is the canonical
test injection point).

---

## Smoke test

`scripts/executor-smoke.ts` exercises all four facade methods against
the real RouterClient + routing providers. Manual sanity check, not
wired into `npm run test`.

```bash
npx tsx scripts/executor-smoke.ts
```

Requires the usual `VITE_MAPBOX_TOKEN` (and any other provider keys)
in the environment.
