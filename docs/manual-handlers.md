# ManualHandlers

**Status:** Shipped in T2.4 (no production callers — T2.5 Executor facade wires it in).
**Module:** `src/routing/executor/ManualHandlers/`
**Depends on:** T2.1 (RouterClient), T1.4 (telemetry).
**Blocks:** T2.5 (Executor facade).

## What this is

ManualHandlers is the **UI-driven path** of the executor — the mirror of
MutationHandlers (T2.3) for user-initiated direct edits. It receives a
`ManualAction` plus a discriminated `ManualActionPayload` and produces an
updated `RouteSnapshot` (or a structured `ExecutorFailure` if the action
can't be carried out).

Unlike LLM-driven mutations, manual actions carry **direct geometric
instructions** rather than intent. They bypass ConstraintBuilder entirely
and go straight to `RouterClient.connect`. The "partial re-routing"
behaviour the UI wants (geometry only changes around the affected
waypoint) is implicit: `connect(waypoints, context)` takes the full
waypoint array, and the router naturally produces that effect.

After T2.4, both halves of the executor's mutation surface are
functionally complete: the LLM-driven path (T2.3) and the UI-driven path
(T2.4). T2.5 just exposes them through a clean public API.

## Public API

```ts
import { applyManualAction } from '@/routing/executor/ManualHandlers';

const result = await applyManualAction(route, context, action, payload);
```

```ts
function applyManualAction(
  route: RouteSnapshot,
  context: RouteContext,
  action: ManualAction,
  payload: ManualActionPayload,
): Promise<ExecutorResult>;
```

One function. Dispatches internally by `action`. Always returns an
`ExecutorResult`; never throws.

### Action / payload contract

`ManualActionPayload` is a discriminated union; the `payload.action`
field must match the `action` argument. The dispatcher enforces this at
runtime — sloppy callers that pass an `action: 'drag_waypoint'` with a
`payload: { action: 'add_waypoint', ... }` get an `internal_error`
result, not silent misroute.

```ts
type ManualAction =
  | 'drag_waypoint'
  | 'add_waypoint'
  | 'remove_waypoint'
  | 'reverse_route'
  | 'clear_route';

type ManualActionPayload =
  | { action: 'drag_waypoint'; waypoint_index: number; new_coord: Coordinate }
  | { action: 'add_waypoint'; coord: Coordinate; insert_at?: number }
  | { action: 'remove_waypoint'; waypoint_index: number }
  | { action: 'reverse_route' }
  | { action: 'clear_route' };
```

## Per-handler summary

| Handler | Logic | Validation | Failure modes |
|---|---|---|---|
| `drag_waypoint` | Replace waypoint at index, call `RouterClient.connect` | `0 ≤ waypoint_index < waypoints.length`; `new_coord` valid via `isValidCoordinate` | `internal_error` (bounds / coord); router passthroughs |
| `add_waypoint` | Splice new waypoint at `insert_at` (or nearest-segment), call `RouterClient.connect` | `coord` valid; if `insert_at` set: `0 ≤ insert_at ≤ waypoints.length` and integer | `internal_error` (bounds / coord); `constraint_infeasible` if <2 waypoints after; router passthroughs |
| `remove_waypoint` | Filter out the waypoint at index, call `RouterClient.connect` | `0 ≤ waypoint_index < waypoints.length` | `internal_error` (bounds); `constraint_infeasible` if removal leaves <2 waypoints; router passthroughs |
| `reverse_route` | Reverse waypoint array, call `RouterClient.connect` | None | Router passthroughs (rare; one-way streets in the reversed direction) |
| `clear_route` | Return empty `RouteSnapshot` directly | None | None — always succeeds |

### Nearest-segment insertion (`add_waypoint` with no `insert_at`)

For each consecutive waypoint pair `(W[i], W[i+1])`, compute the
perpendicular distance from the new coordinate to that segment via
`@turf/turf`'s `pointToLineDistance`. Insert at the index immediately
after the start of the closest segment. Linear scan; routes typically
have <100 waypoints so O(n) is fine. Turf was chosen over a hand-rolled
implementation because perpendicular-distance math is easy to get
subtly wrong and Turf's primitives are well-tested.

## Failure semantics — `partial: route`

**Every failure path returns the pre-action route as `partial`.** The UI
treats `!result.ok` as a revert signal: it restores the user's view to
the `partial` route (which is the snapshot taken before the action
fired). The semantics are uniform across all failure kinds — the UI
doesn't need to distinguish.

The two exceptions in spirit:
- **`clear_route`** can't fail by construction; there's no `partial` to
  worry about.
- **Action/payload mismatch** fails before the handler dispatch but
  still returns `partial: route` so the UI behaves consistently.

## Telemetry

All events go through `trackRouteBuilder` (T1.4), so they arrive in
PostHog as `route_builder_manual_handler_*`.

| Event | When | Properties |
|---|---|---|
| `manual_handler_started` | Entry to a valid `applyManualAction` call (after the mismatch check) | `action` |
| `manual_handler_succeeded` | Successful return | `action`, `duration_ms`, `provider_used` (nullable for `clear_route`), `cache_hit` |
| `manual_handler_failed` | Failure return inside the dispatch | `action`, `duration_ms`, `failure_kind` |

### Relationship to T1.4 `route_edit_applied`

T1.4 emits `route_edit_applied` at the **application layer** — "a UI
edit was dispatched". The `manual_handler_*` events live at the
**executor layer** — "the executor processed it". Both fire for every
manual edit, at different times for different reasons. Do not collapse
them.

### `provider_used: null` semantics

`ExecutionMetadata.provider_used` is `ProviderName | null`. It is
`null` for operations that don't contact a routing provider — namely
`clear_route`. RouterClient and MutationHandlers already supported this
shape, so no upstream change was needed for T2.4.

## Deliberate departures from spec

### `reverse_route` skips ConstraintBuilder

Strict reading of Executor Spec §3.2 says all reverses (mutation or
manual) should go through ConstraintBuilder so there's exactly one
implementation of the capability. T2.4's `reverse_route` handler
**bypasses ConstraintBuilder** and calls `RouterClient.connect`
directly with a reversed waypoint array.

Rationale: ConstraintBuilder's `reverse_route` handler does the same
thing — reverse the waypoint array. There's no intent translation to
share. Going through ConstraintBuilder would add a hop with no
behavioural benefit. The shared-executor invariant is preserved at the
*capability* level (both paths produce reversed routes via
`RouterClient.connect`), not at the *implementation* level.

### `clear_route` skips RouterClient

`clear_route` returns an empty `RouteSnapshot` directly with no router
call. No provider can produce "no route" more cheaply than not asking
for one.

## Out of scope

These are explicitly **not** in T2.4:

- Undo / redo — separate concern, not in v1 executor.
- Validation that an action is *appropriate* (e.g. dragging into the
  ocean). That's a UI concern; T2.4 just handles whatever payload
  arrives.
- Compositional manual actions. Per Turn Model Spec, each manual action
  is one turn. There's no `applyManualActions` analog to T2.3's
  `applyMutations`.
- Caching at the manual-action level. `RouterClient.connect` already
  caches.

## Testing

```bash
# Unit + handler tests (no network)
npm run test:run -- src/routing/executor/ManualHandlers

# Integration tests (real routing APIs, network required)
RUN_INTEGRATION_TESTS=1 npm run test:run -- src/routing/executor/ManualHandlers

# Dev smoke
npx tsx scripts/manual-handler-smoke.ts
```
