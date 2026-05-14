# RouterClient — Stateful Routing Service

**Status:** Shipped in T2.1 with zero production callers.
**Wired in by:** T2.5 (Executor facade), then T3.x (conversational layer).
**Replaces (eventually):** `src/utils/smartCyclingRouter.js`.
**Module root:** `src/routing/RouterClient/`.

This document is the API reference. The implementation rationale and
the audit of preserved legacy behavior live in
[`legacy-routing-notes.md`](./legacy-routing-notes.md). The architectural
context lives in [`executor-spec-v0.1-DRAFT.md`](./executor-spec-v0.1-DRAFT.md) §4.4.

---

## What it is

A single class that wraps the three cycling routing providers
(Stadia Maps / Valhalla, BRouter, Mapbox) behind a uniform interface.
Responsibilities, per executor spec §4.4:

- **Provider registry** — maps `profile → ordered provider list`
- **Fallback chain** — tries providers in order; advances on failure
- **Request dedup** — identical constraints inside 100 ms join a single
  in-flight call
- **Response cache** — LRU, 100 entries, 5-minute TTL
- **Telemetry** — `routerclient_*` PostHog events per call

`RouterClient` is the only stateful piece of the executor architecture.
The handler layer that consumes it (T2.3, T2.4) is pure.

---

## API

```ts
import {
  getRouterClient,
  createRouterClient,
  type RouteConstraint,
  type RouteContext,
  type ExecutorResult,
} from '@/routing/RouterClient';

const client = getRouterClient(); // process-wide singleton

const result: ExecutorResult = await client.solve(constraint, context);
const connected: ExecutorResult = await client.connect(waypoints, context);
```

### `solve(constraint, context)`

Full preference-aware routing. The LLM-driven path. Reads `profile`,
`waypoints`, surface/traffic preferences, and segment lists from the
constraint; reads `training_goal`, `user_speed_kph`, `preferences`,
`mapbox_token` from the context.

### `connect(waypoints, context)`

Connect-the-dots geometry through an ordered waypoint list. The
UI-driven manual-edit path (drag, add, remove waypoint). No training-
goal or traffic-tolerance layering — minimal default road costing.

### Both return `ExecutorResult`

```ts
type ExecutorResult =
  | { ok: true; route: RouteSnapshot; metadata: ExecutionMetadata }
  | { ok: false; reason: ExecutorFailure; partial?: RouteSnapshot };
```

`metadata` carries `provider_used`, `duration_ms`, `cache_hit`,
`attempts_tried`. `reason.kind` is one of `router_unavailable`,
`constraint_infeasible`, `waypoint_unreachable`, `context_missing`,
`internal_error`.

---

## Provider registry

Profile → ordered fallback list. Mirrors the legacy `smartCyclingRouter.js`
ordering exactly.

| Profile   | 1st       | 2nd       | 3rd       |
|-----------|-----------|-----------|-----------|
| `road`    | `stadia`  | `brouter` | `mapbox`  |
| `commute` | `stadia`  | `brouter` | `mapbox`  |
| `gravel`  | `brouter` | `stadia`  | `mapbox`  |
| `mtb`     | `brouter` | `stadia`  | `mapbox`  |

The registry is a `const` array in `src/routing/RouterClient/registry.ts`.
Override via `createRouterClient({ registry: customRegistry })` (tests).

Legacy profile aliases are accepted and normalised on entry:
- `'mountain'` → `'mtb'`
- `'commuting'` → `'commute'`

---

## Cache behavior

- **Capacity:** 100 entries (LRU eviction)
- **TTL:** 5 minutes
- **Key:** FNV-1a 32-bit hash of canonicalised JSON of the constraint:
  - Coordinates quantized to 6 decimal places (~10 cm)
  - Object keys sorted recursively
  - `avoid_segments` / `prefer_segments` / `exclude_segments` sorted
    (set semantics)
- **Scope:** in-memory only, per RouterClient instance (per tab in
  production once wired in)

Cache hits set `metadata.cache_hit = true` and skip provider calls
entirely. The cached result's other metadata (e.g. `provider_used`,
original `duration_ms`) is preserved.

`solve()` and `connect()` use disjoint cache keyspaces — calling
`connect(waypoints)` does not collide with a `solve(constraint)` whose
waypoints happen to match.

---

## Dedup behavior

- **Window:** 100 ms
- **Key:** same as cache key
- Two simultaneous calls with the same key share a single provider
  invocation and resolve from the same promise.

This catches double-clicks and UI race conditions. The window is short
enough that returning a "stale" result is not a real concern — the
in-flight call hasn't finished yet.

---

## Telemetry events

All events use the `trackRouteBuilder` helper (T1.4), which prefixes
each event with `route_builder_`. The RouterClient events themselves
are prefixed with `routerclient_`. Final event names in PostHog look
like `route_builder_routerclient_solve_called`.

| Event                              | When                              | Properties                                                                |
|------------------------------------|-----------------------------------|---------------------------------------------------------------------------|
| `routerclient_solve_called`        | Every `solve()` entry             | `profile`, `waypoint_count`                                               |
| `routerclient_solve_cache_hit`     | Cache returned a result           | `key`                                                                     |
| `routerclient_solve_dedup_joined`  | Dedup joined an in-flight call    | `key`, `wait_ms`                                                          |
| `routerclient_provider_attempted`  | Provider invocation starts        | `provider`, `profile`, `attempt_index`                                    |
| `routerclient_provider_succeeded`  | Provider returned a route         | `provider`, `duration_ms`, `attempt_index`                                |
| `routerclient_provider_failed`     | Provider failed                   | `provider`, `duration_ms`, `failure_kind`, `attempt_index`                |
| `routerclient_solve_completed`     | Final result returned             | `total_duration_ms`, `provider_used` (nullable), `cache_hit`, `attempts_tried` |
| `routerclient_connect_called`      | Every `connect()` entry           | `waypoint_count`                                                          |
| `routerclient_connect_cache_hit`   | Cache hit on a connect call       | `key`                                                                     |
| `routerclient_connect_dedup_joined`| Dedup joined an in-flight connect | `key`, `wait_ms`                                                          |
| `routerclient_connect_completed`   | Final connect result              | `total_duration_ms`, `provider_used`, `cache_hit`, `attempts_tried`       |

The `routerclient_provider_*` events are emitted for both `solve()`
and `connect()`. Connect events include `mode: 'connect'` in
properties to distinguish them.

**No PII in events.** Coordinates never appear; cache keys are
already hashed.

The legacy `smartCyclingRouter.js` emits parallel `generation_routing_*`
and `provider_fallback_chain_advanced` events in the existing PostHog
stream. The two streams will coexist until T3 cutover so we can
compare old and new pipelines on identical inputs.

---

## Provider adapter contract

```ts
interface RouteProvider {
  readonly name: 'stadia' | 'brouter' | 'mapbox';
  supports(profile: RoutingProfile): boolean;
  solve(constraint, context): Promise<ProviderResult>;
  connect(waypoints, context): Promise<ProviderResult>;
}
```

Each adapter wraps its legacy module (`stadiaMapsRouter.js`,
`brouter.js`, `directions.js`) — see `legacy-routing-notes.md` §9 for
the call map. The adapters do NOT re-implement routing logic; they
translate `RouteConstraint` to the legacy module's input shape and
translate the response to `RouteSnapshot`.

### Validity gate

Each adapter applies the legacy `coordinates.length > 10` filter:
routes with ≤10 geometry points are treated as `no_route_found` and
the fallback chain advances. This is "did we get a real route?" —
empty/degenerate responses can come back HTTP 200.

### `supports(profile)`

All current adapters support all four profiles. Quality varies
(Mapbox for gravel is weak, BRouter for road is OK), but the
**registry ordering** is what controls preference — `supports` is a
hard filter for "literally cannot handle this profile". The example
in the T2.1 spec (`MapboxProvider` returning false for `gravel`) is
deliberately not followed; rationale lives in
`legacy-routing-notes.md` §4.

---

## Configuration

`RouterClient` accepts an optional config object:

```ts
new RouterClient({
  cacheMaxSize: 100,     // default 100
  cacheTtlMs: 5*60*1000, // default 5min
  dedupWindowMs: 100,    // default 100ms
  registry: customRegistry,  // override profile → providers
  providers: { stadia, brouter, mapbox },  // inject mock providers
});
```

The `providers` injection is the primary test seam — tests construct
stub providers implementing the `RouteProvider` interface and verify
fallback / cache / dedup behavior without touching real APIs.

---

## Migration plan

T2.1 ships RouterClient with zero production callers. It exists
alongside `smartCyclingRouter.js`, which continues to handle all
production traffic.

| Phase  | Status   | What happens                                                          |
|--------|----------|-----------------------------------------------------------------------|
| T2.1   | Done     | RouterClient lands. No callers.                                       |
| T2.2   | Pending  | ConstraintBuilder lands. No callers.                                  |
| T2.3   | Pending  | MutationHandlers land, calling RouterClient. No callers of handlers.  |
| T2.4   | Pending  | ManualHandlers land. No callers.                                      |
| T2.5   | Pending  | Executor facade lands, wiring the handlers. Still no production use.  |
| T3.x   | Pending  | Conversational layer cuts over to the executor. RouterClient sees its first production traffic. |
| Future | Pending  | `smartCyclingRouter.js` and friends move to `src/routing/legacy/`, eventually deleted once all callers migrated. |

The `legacy/` folder mentioned in the T2.1 spec is **deliberately not
created in this PR**. Existing files stay where they are. A later
cleanup PR can rename/relocate once T3 cutover is complete.

---

## Known follow-ups (not blockers for T2.1)

1. **Source/confidence reporting.** Legacy decorates results with
   `source: 'stadia_maps' | 'brouter' | 'brouter_gravel' | 'mapbox_fallback'`
   and a `confidence` 0.7..1.0 score. RouterClient drops these.
   `metadata.provider_used` partially replaces `source`; a follow-up
   can add `metadata.provider_profile` for the gravel-variant
   distinction and `metadata.confidence` if UI needs it.

2. **Maneuver/road-classification data from Stadia** is dropped at the
   StadiaProvider boundary. Useful for `change_climb_character` and
   `avoid_segment_by_property` mutations later. Add to `metadata.diagnostics`
   when needed — don't extend `RouteSnapshot.stats`.

3. **`trackRouteBuilder` prefix.** The helper hard-codes
   `route_builder_` as the prefix, so RouterClient events arrive in
   PostHog as `route_builder_routerclient_*`. Cleaner alternative:
   extend the helper to accept a configurable prefix. Left as a
   follow-up because changing the helper's signature risks rippling
   into existing telemetry call sites.

4. **No retry logic.** Neither legacy nor new RouterClient retries a
   provider on transient failure. A single retry per provider with
   exponential backoff could be a v1.5 improvement.

5. **Cache scope.** Per-instance (in production, per-tab once wired).
   Cross-tab sharing via `BroadcastChannel` or a server-side cache is
   not in v1.

6. **Performance baseline vs legacy** is currently captured only via
   unit-test timings (sub-1ms per call with mocked providers — meaningless
   except as a smoke check). A live side-by-side comparison is deferred
   to T3 cutover, when there's actual production traffic to compare
   against.
