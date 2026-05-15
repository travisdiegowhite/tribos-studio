# MutationHandlers

**Status:** Shipped in T2.3 (no production callers — T2.5 Executor facade wires it in).
**Module:** `src/routing/executor/MutationHandlers/`
**Depends on:** T2.1 (RouterClient), T2.2 (ConstraintBuilder), T1.4 (telemetry).
**Blocks:** T2.5 (Executor facade).

## What this is

MutationHandlers is the **composition layer** of the executor. It wires
ConstraintBuilder (intent → constraint) and RouterClient (constraint →
route) into a single operation. After T2.3, the LLM-driven path of the
executor is functionally complete: given a `Mutation`, the system
produces a new `RouteSnapshot` or a structured `ExecutorFailure`.

There is **no per-mutation-type handler at this layer**. ConstraintBuilder
already does the per-type dispatch (its 19 `buildConstraintFor*`
functions). MutationHandlers just calls `buildConstraint` and lets it
route internally — both public functions run the same two-step
composition for every mutation type. This is a deliberate departure from
the `Record<Mutation["type"], MutationHandler>` shape sketched in
Executor Spec §4.1: after T2.2 landed, that record-of-handlers became
redundant.

## Public API

```ts
import { applyMutation, applyMutations } from '@/routing/executor/MutationHandlers';

const result  = await applyMutation(route, context, mutation);
const composed = await applyMutations(route, context, [m1, m2, m3]);
```

```ts
function applyMutation(
  route: RouteSnapshot,
  context: RouteContext,
  mutation: Mutation,
): Promise<ExecutorResult>;

function applyMutations(
  route: RouteSnapshot,
  context: RouteContext,
  mutations: Mutation[],
): Promise<ExecutorResult>;
```

Both are `Promise<ExecutorResult>` and **never throw** — every failure,
including unexpected exceptions from the layers below, is structured as
an `ExecutorFailure` inside the result. Callers assert on
`result.ok === false`, never `expect.toThrow`.

`applyMutation` accepts an internal fourth argument (`_isCompositional`,
default `false`) that `applyMutations` sets so the
`mutation_handler_started` telemetry records whether the call is part of
a compositional sequence. Callers outside this module leave it unset.

## Composition flow (`applyMutation`)

```
applyMutation(route, context, mutation)
  ├── emit mutation_handler_started
  ├── ConstraintBuilder.buildConstraint(route, context, mutation)
  │     └── throws ConstraintBuilderError
  │           → translateConstraintBuilderError → ExecutorFailure
  │           → emit mutation_handler_failed (origin: constraint_builder)
  ├── RouterClient.solve(constraint, context)
  │     ├── { ok: true }  → emit mutation_handler_succeeded; return success
  │     └── { ok: false } → emit mutation_handler_failed (origin: router);
  │                          passthrough failure unchanged
  └── (RouterClient is contracted never to throw; a defensive catch maps
       any escaped exception to internal_error, origin: router)
```

## Error translation

ConstraintBuilder signals failures by throwing a typed
`ConstraintBuilderError`. MutationHandlers catches it and maps it onto
the canonical `ExecutorFailure` shape
(`src/routing/executor/MutationHandlers/errorTranslation.ts`):

| `ConstraintBuilderError.kind` | `ExecutorFailure.kind`   | Notes |
|-------------------------------|--------------------------|-------|
| `context_missing`             | `context_missing`        | `required_field` pulled from `error.details.required_field`; falls back to message-parse, then `"unknown"`. |
| `infeasible_constraint`       | `constraint_infeasible`  | `constraint` = `error.mutationType`; `explanation` = `error.message`. |
| `unsupported_mutation`        | `mutation_not_supported` | `mutation_type` = `error.mutationType`. |
| *(any other / future kind)*   | `internal_error`         | Defensive — `ConstraintBuilderErrorKind` is a closed union, so unreachable through the type system. |

**RouterClient failures need no translation.** RouterClient already
returns the canonical `ExecutorFailure` shape (per T2.1), so
MutationHandlers passes `{ ok: false, reason }` through unchanged.

## The four mutations that always produce `mutation_not_supported`

Three are ConstraintBuilder stubs; the fourth is the `optimize_for`
safety net. All four surface as `ExecutorFailure { kind:
'mutation_not_supported', mutation_type }`. T2.3 translates them
uniformly — Doc 2b distinguishes them later by `mutation_type`.

| Mutation                    | Why |
|-----------------------------|-----|
| `change_climb_character`    | Stub — needs segment-character classification. |
| `anchor_at_poi`             | Stub — needs Overpass POI lookup. |
| `avoid_segment_by_property` | Stub — needs route segment-property analysis. |
| `optimize_for` (raw)        | Safety net — the LLM must expand `optimize_for` into component mutations before it reaches the executor. A raw `optimize_for` means the LLM violated its contract. |

## Compositional semantics (`applyMutations`)

Per Turn Model Spec §9:

- Mutations apply **in array order**, **sequentially** — each mutation's
  output route is the input to the next. (Not `Promise.all`: each step
  depends on the previous step's result.)
- If any mutation fails, the whole operation **rolls back
  all-or-nothing**. The result is `{ ok: false, reason, partial:
  originalRoute }`.
- **`partial` is the pre-turn route**, not the partial-progress route.
  If m1 succeeds and m2 fails, `partial` is the *original* input route —
  not m1's output. Nothing was ever persisted, so this is a logical
  rollback. The caller (T2.5, ultimately Doc 2b) must not show
  intermediate state to the user.
- **Empty array is valid**: `applyMutations(route, context, [])` returns
  the original route, success, with zeroed "empty metadata". It does not
  throw and does not call RouterClient.
- **Single-element array** is functionally identical to `applyMutation`.
- A mutation whose router result equals the input route still
  **succeeds** — the unchanged route comes back as `route`, not
  `partial`.

## Metadata aggregation

A compositional success folds N per-mutation `ExecutionMetadata` objects
into one:

| Field                    | Rule |
|--------------------------|------|
| `provider_used`          | The **last** mutation's provider — most relevant to the final route. |
| `duration_ms`            | **Sum** across all steps, so timing budgets work. |
| `cache_hit`              | `true` only if **every** step was a cache hit. |
| `attempts_tried`         | **Sum** of provider attempts across all steps. |
| `constraint_relaxations` | **Accumulated** (flat-mapped) across all steps. |

The empty-array case is special-cased to zeroed metadata
(`provider_used: null`, `duration_ms: 0`, `cache_hit: false`,
`attempts_tried: 0`, `constraint_relaxations: []`) rather than the
misleading `[].every() === true` cache-hit value.

## Telemetry

All events go through `trackRouteBuilder` (T1.4), which prefixes with
`route_builder_`. MutationHandlers events carry an additional
`mutation_handler_` prefix, so they arrive in PostHog as
`route_builder_mutation_handler_*` — the same nesting RouterClient uses
for `routerclient_*`.

| Event | When | Properties |
|---|---|---|
| `mutation_handler_started` | Entry to `applyMutation` | `mutation_type`, `is_compositional` |
| `mutation_handler_succeeded` | Successful return | `mutation_type`, `duration_ms`, `provider_used`, `cache_hit` |
| `mutation_handler_failed` | Failure return | `mutation_type`, `duration_ms`, `failure_kind`, `failure_origin` (`constraint_builder` \| `router`) |
| `mutation_handler_compositional_started` | Entry to `applyMutations` | `mutation_count` |
| `mutation_handler_compositional_succeeded` | Compositional success | `mutation_count`, `total_duration_ms` |
| `mutation_handler_compositional_rolled_back` | Compositional failure → rollback | `mutation_count`, `failed_at_index`, `failure_kind`, `partial_progress_ms` |

`failure_origin` is the load-bearing field for post-launch tuning: it
tells you whether failures concentrate in ConstraintBuilder (tune the
mutation translation) or RouterClient (improve the routing providers).

## What MutationHandlers is NOT

- **Not an iterator.** Single-shot: one mutation → one constraint → one
  RouterClient call → one result. No re-routing.
- **Not a per-type dispatcher.** The 19-way dispatch lives in
  ConstraintBuilder. MutationHandlers is composition only.
- **Not a cache.** RouterClient caches at the constraint level; T2.3
  adds no mutation-level cache.
- **Not a manual-edit path.** Manual edits are T2.4; cold-start /
  replace / alternatives generation is T2.5 (direct RouterClient call).
- It does not modify ConstraintBuilder or RouterClient.

## File map

```
src/routing/executor/MutationHandlers/
  index.ts               # public exports
  MutationHandlers.ts     # applyMutation + applyMutations + metadata aggregation
  errorTranslation.ts     # ConstraintBuilderError → ExecutorFailure
  metrics.ts              # the six telemetry helpers
  __tests__/
    helpers.ts            # stub/fake RouterClient builders, route fixtures
    MutationHandlers.test.ts
    compositional.test.ts # all-or-nothing rollback + metadata aggregation
    errorTranslation.test.ts
    integration.test.ts   # end-to-end with real routing APIs (RUN_INTEGRATION_TESTS=1)
```

## Testing notes

- Unit tests use the **real ConstraintBuilder** (it is pure — no mocking
  needed) and inject a RouterClient via `setRouterClient()`. Two
  injection styles: a *real* `RouterClient` wired to stub providers
  (exercises the genuine registry / fallback / cache seam with no
  network), and a minimal *fake* client for passthrough tests of failure
  kinds the real RouterClient never emits on its own
  (`waypoint_unreachable`, `constraint_infeasible` from `solve`).
- Integration tests (`integration.test.ts`) hit the real Stadia / BRouter
  / Mapbox providers and are gated behind `RUN_INTEGRATION_TESTS=1`.
- The dev smoke script (`scripts/mutation-handler-smoke.ts`) is a manual
  sanity check. Run inside the Vite/vitest environment or with provider
  credentials available — under plain `tsx`, `import.meta.env` is
  undefined and the legacy provider modules can't read their API keys
  (the routing cases then return a structured `internal_error`, which
  itself confirms the never-throws contract holds against a throwing
  dependency).
