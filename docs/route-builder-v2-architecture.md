# Route Builder 2.0 — Architecture (P1.2)

P1.2 lands the plumbing between the new Route Builder 2.0 page and the
routing executor (`src/routing/executor`). It introduces:

- Five React hooks under `src/hooks/route-builder/`.
- An executor adapter under `src/features/route-builder-v2/adapters/`.
- `RouteContext` assembly per Doc 2b §9.1.
- A dev-only hook test harness at `/route-builder-2/dev-harness`.
- A new `rb2_*` telemetry prefix that coexists with the legacy
  `route_builder_*` events still emitted by `RouteBuilder.jsx`.

`RouteBuilder.jsx` and `routeBuilderStore.js` are byte-unchanged.

## Hooks

All hooks live in `src/hooks/route-builder/`. Each is a single named
export. Tests live in `__tests__/`.

| Hook | Responsibility |
|---|---|
| `useAIGeneration` | Calls `executorAdapter.generateRoute`. Tracks `isGenerating`, `lastError`, and the list of `RouteSnapshot` suggestions in the Zustand `aiSuggestions` field. Exposes `generate`, `selectSuggestion`, `clearSuggestions`. |
| `useRouteEditing` | Applies mutations and chat-driven edits to the current route. Owns transient edit-history (in `useState`) for undo/redo. Chat translation is stubbed (P1.4). |
| `useMapInteraction` | Owns the local viewport (debounced 500ms to store) and translates manual user actions — click, drag, add, remove, reverse, clear — into `applyManualAction` calls. |
| `useRoutePersistence` | Save (`routesService.saveRoute`), load (`routesService.getRoute`), and export-launch (`gpx \| tcx \| fit`). Actual GPX/TCX/FIT serialization stays in `RouteExportMenu` for now. |
| `useRouteAnalysis` | Elevation profile (placeholder shape in P1.2), gradient slices, POI layer toggles via lazy import of `routePOIService`. |

State rule:
- State that survives across components belongs in `routeBuilderStore`.
- State that is transient to one hook (loading flags, error message,
  edit history cursor) lives in `useState` inside the hook.

## Executor adapter

`src/features/route-builder-v2/adapters/executorAdapter.ts`:

| Function | What it does |
|---|---|
| `generateRoute(input, count?, options?)` | Maps `GenerationFormInput` → `GenerationConstraints`, builds context, calls `executor.generate`. Overloads for `count=1` (single) and `count=3` (alternatives). |
| `applyMutation(route, mutation, options?)` | Builds context, calls `executor.applyMutation`. |
| `applyManualAction(route, action, payload, options?)` | Builds context, calls `executor.applyManualAction`. |
| `interpretChatInput(text)` | **Stub.** Returns `null` in P1.2. P1.4 fills this with NL→Mutation translation. |
| `toGenerationConstraints(input)` | Internal mapping helper, exported for unit testing. |
| `assembleRouteContext(options?)` | Re-exported from `assembleRouteContext.ts`. |

`AdapterCallOptions.contextOverride` is the test seam — production
callers always go through `assembleRouteContext()`.

## RouteContext assembly

`src/features/route-builder-v2/adapters/assembleRouteContext.ts`
implements the per-turn RouteContext build described in
Doc 2b §9.1.

`FullRouteContext` is wider than the executor's local `RouteContext`
type (`src/routing/executor/types.ts`). The adapter narrows the shape
via `toExecutorContext()` at the executor call seam. The wider context
will be consumed directly by the Doc 2b conversational pipeline when
that lands.

### Sources

| Source | Fields contributed | Implementation |
|---|---|---|
| Supabase auth | `user_id` | `supabase.auth.getUser()` |
| `user_preferences_complete` view | `start_coord` (home_long/home_lat), `speed_profile.flat_kph`, `preferences` | Single-row select |
| `training_context` table | `training_goal`, `duration_target_minutes` | Single-row select; tolerates missing row |
| `activities` table | `recent_rides` (id-only summaries) | Top-20 by `start_date desc`, cached 1hr keyed to `(user_id, bbox)` |
| Memory layer (Doc 4) | `persistent_facts`, `session_facts` | **Stubbed** — both return `[]`. Wired in P1.4. |
| Zustand `routeBuilderStore` | `current_region_bbox` (computed from `routeGeometry`), session-level fallbacks (`trainingGoal`, `timeAvailable`, `explicitDistanceKm`) | `useRouteBuilderStore.getState()` |
| Environment | `mapbox_token`, `time_of_day` | `import.meta.env`, `new Date().toISOString()` |
| Weather | `weather` | `undefined` — integration deferred per Turn Model Spec §13 |

### Failure handling

If no user is authenticated, `assembleRouteContext` throws
`RouteContextError { kind: 'no_user' }`. Hooks that catch this surface
it as a "context_missing"-equivalent failure to callers. Missing
profile rows are tolerated — defaults are filled in.

### Past-ride caching

`getRelevantPastRides(user_id, bbox, goal)` caches its result for one
hour, keyed by `${user_id}:${bbox_quantized}`. The cache is in-memory
(module-scope `Map`), wiped on hard refresh. `clearPastRidesCache()` is
exported for tests.

## Hook test harness

Path: `/route-builder-2/dev-harness`.

Mounted only when **both**:

- `import.meta.env.DEV === true`, and
- `VITE_ROUTE_BUILDER_V2_ENABLED === 'true'`.

The route element is rendered conditionally in `App.jsx`; in production
builds the route is not registered, and the URL falls through to the
SPA NotFound page.

The harness is intentionally unstyled — it exposes buttons and a JSON
state pane per hook. Use it to verify telemetry is firing, executor
calls are routing correctly, and store writes land.

## P1.3 page composition

Layout B (map-dominant). The page lives at `/route-builder-2` and is
composed in `src/pages/RouteBuilder2.tsx`. Components are grouped under
`src/features/route-builder-v2/components/` and map layers under
`src/features/route-builder-v2/layers/`. All consume the P1.2 hooks
unchanged.

```
<RouteBuilder2>
  <AppShell fullWidth>                  (shared chrome — nav + retro stripe)
    <div data-testid="rb2-page">
      <Map>                             (fills the canvas)
        <SurfaceLayer />                (toggleable)
        <GradientLayer />               (toggleable)
        <POILayer />                    (toggleable, wraps RoutePOILayer)
        <BikeInfraLayer />              (toggleable, wraps BikeInfrastructureLayer)
        <FamiliarSegmentsLayer />       (toggleable; disabled w/o Strava)
      </Map>
      <PersonaDropdown />               (top-right of page)
      <StatsOverlay />                  (upper-left, when route exists)
      <FormPanel />                     (upper-left, collapsible)
      <LayerToggles />                  (upper-left, below form)
      <WaypointListPanel />             (upper-left, when waypoints exist)
      <ChatShell isMobile>              (responsive)
        <ChatPanel />                   (desktop, floating bottom-right)
        <ChatDrawer />                  (mobile, bottom-sheet)
      </ChatShell>
      <LoadingState />                  (when generating or editing)
      <ErrorState />                    (when a hook surfaces an error)
      <EmptyState />                    (when no route exists)
    </div>
  </AppShell>
</RouteBuilder2>
```

### `<Map />` wrapper API

```tsx
<Map
  map={useMapInteraction()}
  routeGeometry={{ type: 'LineString', coordinates: Coordinate[] } | null}
  waypoints={Array<{ id, position, type? }>}
  cursor?={string}
  mapStyle?={string | object}
>
  {/* layers as children */}
</Map>
```

The wrapper does NOT own toggle state — that lives in the page. It
renders the default route line, the waypoint markers (with drag
handlers wired into the hook), and whatever children are passed.
Reads `MAPBOX_TOKEN` and `BASEMAP_STYLES` from
`src/components/RouteBuilder/index.js`. On viewport changes, calls
`map.setViewport(...)` which writes through to the store via the
hook's 500ms debounce.

### Chat shell responsive pattern

`<ChatShell isMobile={boolean}>` picks one of:
- `<ChatPanel state onStateChange />` — desktop floating window. States:
  `open` (full 360×460 panel), `minimized` (compact tab at
  bottom-right), `closed` (dismissed; an "Open chat" button appears).
- `<ChatDrawer state onStateChange />` — mobile bottom sheet. States:
  `open` (~55vh) and `peek` (56px handle).

Both wrap `<ChatBody />`, which renders 3 hardcoded placeholder
bubbles and a no-op input field. The input shows a "Chat coming in
next update" hint when the user attempts to send. P1.4 replaces the
hardcoded bubbles + wires real conversation state.

### PersonaDropdown placement

The dropdown lives **inside** `RouteBuilder2.tsx`, positioned absolute
at the top-right of the map area. The shared `AppShell` is unchanged.
This avoids coupling the layout component to a single page. If
persona becomes relevant across multiple surfaces post-Phase 1, it
can graduate to `AppShell` at that time. Persona is read/written via
`useCoachCheckIn` against `user_coach_settings.coaching_persona`.

### Mobile vs desktop divergences

- Form panel, layer toggles, and waypoint list collapse to full-width
  cards stacked at the top of the viewport on mobile (max-width
  768px); on desktop they're a fixed-width (320px) column anchored
  upper-left.
- The persona dropdown renders in a compact variant (smaller chip,
  label-only) on mobile.
- Chat surface swaps from floating window to bottom-sheet drawer.
- Stats overlay shows the same fields on both, but the mobile card
  takes full width.

### P1.3 UI telemetry (in addition to P1.2 hook events)

| Event | When | Properties |
|---|---|---|
| `rb2_page_viewed` | Mount | `is_mobile`, `has_existing_route` |
| `rb2_form_expanded` | Form panel toggle → expanded | none |
| `rb2_form_collapsed` | Form panel toggle → collapsed | none |
| `rb2_form_field_changed` | Any form field changes | `field` |
| `rb2_form_submitted` | Submit button | `goal, duration_minutes, surface, shape` |
| `rb2_layer_toggled` | Any layer switch | `layer, state` ("shown" / "hidden") |
| `rb2_chat_opened` | Chat opened from closed/minimized | none |
| `rb2_chat_minimized` | Chat minimized | none |
| `rb2_chat_closed` | Chat dismissed | none |
| `rb2_persona_changed` | Persona dropdown selection | `from, to` |
| `rb2_waypoint_removed` | Waypoint removed via list | none |

## Telemetry events (`rb2_*`)

Helper: `trackRb2(event, properties)` from
`src/features/route-builder-v2/telemetry/trackRb2.ts`. Auto-prefixes
`rb2_`. Adds `session_id` (per-tab, in `sessionStorage`) and
`timestamp`. Fire-and-forget; never throws.

| Event | Fired by | Properties |
|---|---|---|
| `rb2_generation_started` | `useAIGeneration.generate` | `count` |
| `rb2_generation_completed` | `useAIGeneration.generate` (success) | `count, duration_ms, provider_used, successes, failures` |
| `rb2_generation_failed` | `useAIGeneration.generate` (failure or throw) | `count, failure_kind, duration_ms, error_message?` |
| `rb2_mutation_applied` | `useRouteEditing.applyMutation` (success) | `mutation_type, duration_ms` |
| `rb2_mutation_failed` | `useRouteEditing.applyMutation` (failure) | `mutation_type, failure_kind` |
| `rb2_ai_edit_unavailable` | `useRouteEditing.applyAIEdit` (stub returned null) | — |
| `rb2_manual_action_applied` | `useMapInteraction` (any handler success) | `action, duration_ms` |
| `rb2_manual_action_failed` | `useMapInteraction` (any handler failure) | `action, failure_kind` |
| `rb2_route_saved` | `useRoutePersistence.save` (success) | `is_new, distance_km, elevation_gain_m, duration_ms` |
| `rb2_route_save_failed` | `useRoutePersistence.save` (throw) | `error_message` |
| `rb2_route_loaded` | `useRoutePersistence.loadRoute` (success) | `route_id` |
| `rb2_route_exported` | `useRoutePersistence.exportRoute` | `format, route_id` |
| `rb2_analysis_layer_toggled` | `useRouteAnalysis.togglePOILayer` | `layer, state (on/off/failed), count?` |

The v1 `route_builder_*` events continue to fire from `RouteBuilder.jsx`
unchanged. Both prefixes coexist until v1 is retired in Phase 3.

## Migration intent

- After P1.3 (real UI) and P1.4 (chat surface) land, the hook APIs may
  evolve. Specifically, `useMapInteraction` will likely add Mapbox-event
  helpers, and `useRouteEditing.applyAIEdit` will be promoted from stub
  to real translation.
- The harness page is dev-only. After Phase 1 closes, decide: delete,
  or promote to a permanent `/debug/route-builder-2` surface.
- The "new files only" rule for P1.2 means some logic in
  `RouteBuilder.jsx` is duplicated. At Phase 3 cutover, the old file
  goes away and the duplication resolves.

## Known gaps (intentional)

- **Memory layer (Doc 4) not built** — `persistent_facts` and
  `session_facts` return `[]`. P1.4 wires real memory.
- **Weather context not wired** — `weather` always `undefined`. Tracked
  by Turn Model Spec §13.
- **`pastRidesService` not extracted** — `assembleRouteContext` queries
  Supabase directly via `activities` table. A dedicated service is a
  cleanup follow-up but not on the P1.2 critical path.
- **`useRouteAnalysis.elevationProfile`** returns a 3-point placeholder
  derived from stats; real elevation fetching via
  `src/utils/elevation.getElevationData` lands in P1.3.
- **`useRoutePersistence.exportRoute`** is a launcher (telemetry only);
  serialization stays in `RouteExportMenu` until P1.3.
- **`useRouteEditing.applyAIEdit`** returns
  `{ ok: false, reason: 'chat_translation_unavailable' }` until P1.4
  fills `interpretChatInput`.
