# S2 Discovery Report — v2 Rewire to v1 Backend

**Date:** 2026-05-17
**Status:** Complete — implementation can proceed

## TL;DR

The replication is **smaller than feared.** v1's AI edit logic does **not** call
Claude API for edits — it uses keyword classification (`classifyEditIntent`)
plus routing-engine strategies (`applyRouteEdit`). The replication for v2's
chat is therefore a thin wrapper around two existing v1 functions, not a
prompt-engineering job.

v1's generate path is also already wrapped — the existing
`rb1Generator.ts` adapter calls `generateAIRoutes` directly. The S2 rewire
just needs to bypass the executor adapter layer and have hooks call the
v1 services straight.

## 1. v1 AI edit anatomy

### `AIEditPanel.jsx` (283 lines, `src/components/RouteBuilder/`)

Pure UI component. Props:
- `loading`, `lastResult`, `onSubmitEdit`, `onAccept`, `onReject`, `onClose`,
  `formatDist`

It owns:
- A `<TextInput>` + send button
- A `<SimpleGrid>` of 6 quick-action buttons backed by `QUICK_ACTIONS`
- A loading spinner state
- An error display path
- An accept/reject preview comparison after a successful edit

It owns **no** Claude logic. On submit:
```js
const classified = classifyEditIntent(text);
onSubmitEdit(classified);
```

That's it. The parent (`RouteBuilder.jsx`) handles the rest.

### `aiRouteEditService.js` (793 lines, `src/utils/`)

Two public functions and one constant:

1. **`classifyEditIntent(text)`** — keyword-based intent classifier.
   - Scans `text.toLowerCase()` against `EDIT_INTENTS` (10 intents:
     flatten, surface_gravel, surface_paved, scenic, faster, shorter,
     longer, avoid, detour, reverse).
   - Each intent has a `keywords` list; longer keyword matches score higher.
   - For `avoid`/`detour`, extracts a `location` string via regex.
   - For `shorter`/`longer`, parses an explicit km/mile delta.
   - Returns `{ intent, confidence, label, description, location,
     distanceModifier, originalText }`.

2. **`applyRouteEdit({ routeGeometry, routeProfile, routeStats, editIntent,
   mapboxToken })`** — main edit function.
   - Dispatches on `editIntent.intent` to one of 9 strategy functions.
   - Each strategy calls into Stadia (`getStadiaMapsRoute`), BRouter
     (`getBRouterDirections`), or SmartCycling (`getSmartCyclingRoute`),
     compares candidates, and returns the best by intent-specific metric.
   - Some intents (`reverse`, `shorter`) are pure geometry transforms
     with no router call.
   - Returns `{ success: boolean, editedRoute: { coordinates,
     source, needsReroute? }, comparison: { distanceDelta, newDistance,
     originalDistance, elevationDelta }, message: string }` on success,
     `{ success: false, message }` on failure.

3. **`QUICK_ACTIONS`** — 6 preset edit objects (flatten/scenic/gravel/
   paved/faster/reverse), each `{ id, icon, label, description, intent }`.

### How `RouteBuilder.jsx` uses them (lines 1487–1588)

```js
const handleAIEditSubmit = async (editIntent) => {
  setAiEditLoading(true);
  setAiEditResult(null);
  setAiEditPrevGeometry(routeGeometry); // for reject/undo
  try {
    const result = await applyRouteEdit({
      routeGeometry, routeProfile, routeStats, editIntent, mapboxToken
    });
    setAiEditResult(result);
    if (result.success && result.editedRoute?.coordinates) {
      setRouteGeometry({ type: 'LineString', coordinates: result.editedRoute.coordinates });
      if (result.editedRoute.needsReroute) {
        // re-route via getSmartCyclingRoute and update geometry
      }
    }
  } finally { setAiEditLoading(false); }
};

const handleAIEditAccept = () => { /* clear preview state */ };
const handleAIEditReject = () => { setRouteGeometry(aiEditPrevGeometry); };
```

The two-phase preview/accept exists because v1's panel is a side surface;
v2's chat is *the* surface, so v2 collapses the flow: edits apply
immediately, and "undo" is a no-op in S2 (or replayed via the hook history
that already exists).

**Important wart:** `applyRouteEdit` does **not** recalculate `routeStats`
after editing — it returns a `comparison` object with deltas, but the
caller is responsible for updating distance/elevation in their own store.
v2's hook needs to read `comparison.newDistance` and write it back.
The route stats *will* be recomputed by elevation enrichment after the
route changes; that's already the pattern in `rb1Generator.ts`.

## 2. v1 generation anatomy

### `generateAIRoutes(params, onProgress)` (3139 lines, `src/utils/aiRouteGenerator.js`)

Params:
- `startLocation` (`[lng, lat]` or `{lat, lng}`)
- `timeAvailable` (minutes)
- `trainingGoal` (string)
- `routeType` ('loop' | 'out_and_back' | 'point_to_point')
- `userId` (optional, drives past-ride personalization)
- `weatherData`, `trainingContext`, `speedProfile`, `speedModifier` (all optional)

Returns: array of route candidates with shape
```ts
{ name?, distance?: number /*km*/, elevationGain?: number /*m*/,
  elevationLoss?: number, coordinates: Array<[lng,lat]>, description? }
```

This is exactly what `rb1Generator.ts` already wraps. The wrapper:
- Maps `GenerationFormInput` → `generateAIRoutes` params
- Returns 1 or 3 results wrapped as `ExecutorResult { ok: true, route, metadata }`
- After T2.6.1, elevation enrichment runs via `enrichElevation()` at the
  adapter seam — fixes the elevation=0 problem at source

**The "elevation is 0" smoking-gun fix in S2:** the existing elevation
enrichment is the right fix and was supposed to be applied via the
adapter. Removing the adapter and calling `generateAIRoutes` directly
means we need to call `enrichElevation` (or equivalent) from inside the
hook. The cleanest move is to **keep** the elevation enrichment helper —
it does not depend on the executor architecture, only on the
`RouteSnapshot`-like shape we choose to define internally — and call it
from `useAIGeneration` after generate.

## 3. v1 manual edit anatomy

### `useRouteManipulation` hook (`src/hooks/useRouteManipulation.js`, 396 lines)

Inputs: `waypoints, setWaypoints, routeGeometry, setRouteGeometry,
routeStats, setRouteStats, elevationProfile, setElevationProfile,
routingProfile, useSmartRouting`.

Public methods:
- `addWaypoint({lng, lat})` — append, set start/end/waypoint type, push history
- `removeWaypoint(waypointId)` — filter by id, push history
- `updateWaypointPosition(waypointId, {lng, lat})` — for drags, push history
- `reverseRoute()` — flip waypoints AND geometry AND elevation profile in place
- `clearRoute()` — wipe everything
- `snapToRoads(waypoints)` — async; calls `getSmartCyclingRoute` →
  computes distance_m → converts to km → fetches elevation profile →
  populates `routeStats` (distance_km, duration_s, elevation_gain_m,
  elevation_loss_m, elevation_min_m, elevation_max_m)
- `undo()` / `redo()` / `canUndo` / `canRedo` — purely waypoint-list-based;
  re-running `snapToRoads` is the user's responsibility after undo

Notable: every method calls `notifications.show(...)` for user feedback.
This is fine for v1's full-page UX. For v2's chat surface we'll skip
notifications since the chat itself is the feedback channel.

## 4. v1 hook patterns in `RouteBuilder.jsx`

The page is a 6,106-line beast. It uses `useRouteManipulation` for
waypoint-level state, but most other state is inline `useState` (route
suggestions, AI edit state, elevation profile, etc.). v1 is **not** built
on a clean hook abstraction — it's built on a hook + giant component
pattern. That means v2's "thin wrapper" hooks don't have a natural
counterpart hook to delegate to; instead, they delegate to:

- `useRouteManipulation` (the one v1 hook), OR
- v1 *services* (`aiRouteGenerator`, `aiRouteEditService`, `routesService`,
  `routePOIService`, `elevation`, etc.)

This is fine. The hooks become forwarders to services, which is the
"thin wrapper" pattern called out in the spec.

## 5. Routes service

`src/utils/routesService.js` is 164 lines, simple API client. Functions:
- `saveRoute(routeData)` → POST `/api/routes` with `action: 'save_route'`
- `listRoutes()` → POST `/api/routes` with `action: 'list_routes'`
- `getRoute(routeId)` → POST `/api/routes` with `action: 'get_route'`
- `deleteRoute(routeId)` → POST `/api/routes` with `action: 'delete_route'`

`useRoutePersistence` already calls these directly. No executor coupling
to remove. Only cleanup: drop the executor type imports.

## 6. Type coupling

The hooks today import from `src/routing/executor`:
- `ExecutorResult`, `ExecutorFailure` — return shapes
- `RouteSnapshot`, `RouteWaypoint` — route data shape
- `Mutation`, `ManualAction`, `ManualActionPayload` — input shapes
- `Coordinate`, `RoutingProfile`, `RouteShape`, `SurfaceMix` — value types

V2 components import `Coordinate` from `'../../../routing/executor'` and
`Mutation` from `'../../../routing/executor'` (chat types).

**Resolution:** the canonical `Coordinate` lives in `src/types/geo.ts`
already (`src/routing/executor/index.ts` just re-exports it). All v2
component / hook imports of `Coordinate` will be repointed to
`src/types/geo.ts`. The other types (RouteSnapshot, RouteWaypoint,
Mutation, etc.) will either be redefined locally in
`src/hooks/route-builder/types.ts` or removed entirely (Mutation goes
away with the executor architecture in v2).

## 7. Known v1 warts to leave alone (defer to S3)

- **`useRouteManipulation` notifications are noisy.** It calls Mantine
  `notifications.show()` from inside every method (add, remove, drag, etc.).
  For v2's chat-driven flow these become irrelevant, but the hook is
  shared with v1, so we can't strip them. v2 will work around by NOT
  using `useRouteManipulation` directly — its `useMapInteraction`
  wrapper will reimplement waypoint actions inline (using
  `getSmartCyclingRoute` for snapping), which is shorter than
  retrofitting the v1 hook for shared use.
- **`applyRouteEdit` returns `needsReroute: true` for `shorter`** but
  the caller has to call `getSmartCyclingRoute` separately. That re-route
  call inside v1's `handleAIEditSubmit` is the second pass. v2's
  replicated logic mirrors this two-pass approach.
- **`comparison.newDistance` is the new total distance** but the
  caller is responsible for clamping `routeStats`. v1 sets
  routeGeometry then lets v1's downstream effects re-derive stats.
  v2's replicated logic will write stats explicitly after a successful
  edit.
- **v1's "accept/reject preview" flow** has no equivalent in v2's chat —
  edits apply immediately. If a user dislikes the result they can ask
  for another edit (e.g. "actually, make it flatter instead"). Building
  a true undo for chat edits is S4/S5 work.
- **POI service shape mismatch:** `routePOIService.queryPOIsAlongRoute`
  may return either `unknown[]` or `{ features: unknown[] }`. The
  existing hook normalizes this. Keep that normalization.
- **`elevationEnrichment.ts` currently lives in `adapters/`** and imports
  `ExecutorResult` from the executor. After S2 it'll be repointed to use
  our local route snapshot type (or inlined into `useAIGeneration`).
  Choice: **inline a simpler version into the hook** — the LRU cache is
  nice-to-have but the underlying enrichment (one `getElevationData`
  call + `calculateElevationStats`) is 10 lines. Keeping the cache as a
  module-level Map under a renamed file (`src/utils/routeElevationEnrich.ts`?)
  is also fine.

  **Decision:** keep `elevationEnrichment` as a util-style helper in
  `src/hooks/route-builder/elevationEnrichment.ts` operating on a local
  `EnrichedRoute` shape, no executor types. Reuse the same cache logic.

## 8. What S2 actually delivers

The substantive work is **less than 1000 lines diff** because most
behavior already lives in v1 services. The bulk of the change is:

1. ~40 lines of new types in `src/hooks/route-builder/types.ts`
2. Rewrite 5 hooks (each becomes ~50–150 lines, simpler than before)
3. ~100 lines of new `replicatedEditLogic.ts`
4. ~60 lines rewriting `submitChatMessage.ts`
5. Delete `executorAdapter.ts`, `assembleRouteContext.ts`,
   `heuristicTranslation.ts`, plus their tests and ancillary files
6. Repoint `Coordinate` / `Mutation` imports in v2 components (~10 files,
   one-line each)
7. Update hook tests to mock v1 services instead of the executor adapter

No changes to: `RouteBuilder.jsx`, `routeBuilderStore.js`, anything in
`src/routing/executor/`, or any v1 service.

## 9. Risk surface

- **The 10 end-to-end checks** are the verification gate. Of these, the
  most likely to break: chat-driven edits (because the replicated
  classify→apply pipeline is new code), waypoint drag (because we're
  replacing executor manual-action handling with direct snapToRoads
  calls), and elevation > 0 on generated routes (the smoking-gun fix).
- **TypeScript pain from type swaps.** Removing `RouteSnapshot` from
  executor imports will produce a cascade of errors in tests; budget
  half a day to fix them.
- **Mutation type removal.** The chat types reference Mutation; once
  removed, dependent tests need rewriting. The reward is removing a
  whole class of executor-coupled code.
