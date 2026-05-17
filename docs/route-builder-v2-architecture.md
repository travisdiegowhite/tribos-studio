# Route Builder 2.0 — Architecture (S2 rewire)

## S2 — v2 now uses v1's backend (current state, May 2026)

S2 replaced v2's executor-based plumbing with thin wrappers around v1's
proven services. The new executor architecture (`src/routing/executor/`)
remains in the repo unused, awaiting deletion at S6 cutover.

What changed in S2:

- All five hooks under `src/hooks/route-builder/` are now thin wrappers
  calling v1 services directly. No imports of `src/routing/executor/`
  remain in v2 code (hooks, page, components, chat). The hook public
  signatures are unchanged so v2 components did not need to change.
- The executor adapter (`src/features/route-builder-v2/adapters/`) is
  **deleted**.
- The P1.4 chat translation pipeline (heuristic keywords +
  Claude-backed `/api/route-builder-2-chat`) is **deleted**. The chat
  submission handler now calls `replicatedEditLogic.applyAIEdit`, which
  in turn calls v1's `classifyEditIntent` + `applyRouteEdit` from
  `src/utils/aiRouteEditService.js`. The duplication is intentional and
  resolves at S6 when v1 retires.
- The `Mutation` taxonomy (an executor concept) is removed from v2 —
  chat edits go through `applyAIEdit(text)` from end to end.
- A local `RouteSnapshot`-like shape is defined in
  `src/hooks/route-builder/types.ts`. `Coordinate` is imported from the
  canonical `src/types/geo.ts` everywhere.
- The dev harness at `/route-builder-2/dev-harness` is rewired to the
  new thin wrappers; the buttons exercise the same paths the production
  page does.
- The elevation enrichment that previously lived at the adapter seam
  now lives at `src/hooks/route-builder/elevationEnrichment.ts` and is
  called from `useAIGeneration` after generation. This is the fix for
  the "elevation is 0" smoking-gun from P1.4 verification.

`RouteBuilder.jsx`, `routeBuilderStore.js`, every v1 service, and the
executor code under `src/routing/executor/` are byte-unchanged.

### Hook summary (post-S2)

| Hook | Wraps |
|---|---|
| `useAIGeneration` | v1's `generateAIRoutes` (`src/utils/aiRouteGenerator.js`). Elevation enriched via `elevationEnrichment.enrichRouteElevation`. |
| `useRouteEditing` | v1's `aiRouteEditService` via `replicatedEditLogic.applyAIEdit`. Owns local undo/redo over `{geometry, stats}` snapshots. |
| `useMapInteraction` | v1's `getSmartCyclingRoute` + `getElevationData`. Inlines waypoint-list management; no shared dependency on `useRouteManipulation` (v1's hook stays for v1's UI). |
| `useRoutePersistence` | v1's `routesService` for save/load/list and `routeExport` for GPX/TCX/FIT — unchanged from P1.2, just stripped of dead executor type imports. |
| `useRouteAnalysis` | v1's `getElevationData` + `calculateElevationStats` for real elevation profile (replaces the P1.2 placeholder), and `routePOIService.queryPOIsAlongRoute` for POIs. |

### Replicated edit logic

`src/features/route-builder-v2/chat/replicatedEditLogic.ts` is the seam
between v2's chat surface and v1's edit pipeline. It:

1. Classifies the user's text via v1's `classifyEditIntent`.
2. Reads the live route from the Zustand store.
3. Delegates to v1's `applyRouteEdit({routeGeometry, routeProfile,
   routeStats, editIntent, mapboxToken})`.
4. For intents that return `needsReroute: true` (currently `shorter`),
   re-snaps via `getSmartCyclingRoute` — same as v1.
5. Recomputes distance (from coordinates) and elevation (via a fresh
   `getElevationData` fetch) and writes both back to the store.

The duplication is intentional. At S6, v1 retires and this becomes the
canonical edit pipeline.

### Telemetry events (post-S2)

- `rb2_generation_started`, `rb2_generation_completed`,
  `rb2_generation_failed` — generation lifecycle (unchanged).
- `rb2_chat_message_submitted`, `rb2_chat_cold_start_triggered` —
  cold-start branch (unchanged).
- `rb2_chat_edit_applied` (new, replaces `rb2_chat_mutation_applied`
  and `rb2_chat_translated_*`) — fires when a chat edit succeeds.
- `rb2_chat_edit_failed` (new) — fires on classification or routing
  failure.
- `rb2_manual_action_applied`, `rb2_manual_action_failed` — manual
  edit lifecycle. The `action` field now uses descriptive strings
  (`add_waypoint`, `drag_waypoint`, `remove_waypoint`,
  `reverse_route`, `clear_route`) instead of executor enum values.
- `rb2_analysis_layer_toggled` — layer toggles (unchanged).
- `rb2_route_saved`, `rb2_route_loaded`, `rb2_route_save_failed`,
  `rb2_route_exported`, `rb2_route_export_failed` — persistence
  events (unchanged).
- **Removed:** `rb2_mutation_applied`, `rb2_mutation_failed`,
  `rb2_ai_edit_unavailable`, `rb2_chat_translated_heuristic`,
  `rb2_chat_translated_ai`, `rb2_chat_translator_error`,
  `rb2_chat_refused`, `rb2_elevation_enrich_*` (the elevation
  enrichment moved out of the adapter seam, no separate telemetry).

## Original P1.2 design (frozen — superseded by S2)

The below describes the previous state for historical context. It is
not how v2 works today.

P1.2 landed the plumbing between the Route Builder 2.0 page and the
routing executor (`src/routing/executor`). It introduced:

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

Both wrap `<ChatBody />`. P1.4 turns `<ChatBody />` into a controlled
component that takes `messages`, `isProcessing`, `exampleHint`,
`showAfterRefuseHint`, and `onSubmit` as props — `<ChatShell />`
threads them through. The actual chat logic (translation, session
state) lives in `src/features/route-builder-v2/chat/` and is the
heuristic stub described in the **P1.4 chat stub** section below.

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

## P1.4 chat stub — to be deleted in Phase 3

P1.4 makes the chat surface in `<ChatShell />` functional through a
**heuristic translation stub**. The real conversational pipeline lives
in Doc 2b and lands in Phase 2; everything described below is throwaway
code marked with the header `// P1.4 STUB — DELETE IN PHASE 3 CUTOVER`.

### What the stub does

- **Keyword → mutation translation.** Input is lowercased, punctuation
  stripped, then substring-matched against a fixed list of 7 phrase
  groups. Each group produces a single Phase-1 `Mutation` with
  hardcoded magnitudes/deltas. The full catalog:

  | Input substrings | Mutation |
  |---|---|
  | `hillier`, `more climbing`, `more elevation` | `increase_climbing` (moderate) |
  | `flatter`, `less climbing`, `less elevation`, `easier hills` | `reduce_climbing` (moderate) |
  | `shorter`, `less distance`, `trim` | `shorten_distance` (5km) |
  | `longer`, `more distance`, `add some distance` | `extend_distance` (5km) |
  | `reverse`, `flip it` | `reverse_route` |
  | `skip 287`, `avoid 287` | `avoid_segment` (`us-287`) |
  | `more gravel`, `less road` | `change_surface_mix` toward gravel |

- **Cold-start detection.** Inputs matching
  `/build|generate|make|create/` + `/ride|loop|route/` expand the
  `<FormPanel />` via an imperative ref handle. The user confirms
  values and clicks **Generate**. The stub deliberately does NOT
  auto-generate.

- **Refuse fallback.** Anything else returns a polite "I don't
  understand that one yet" message and visibly emphasizes the supported
  phrases below the message bubble. The persistent example-phrases hint
  also sits below the input field at all times.

### Files (`src/features/route-builder-v2/chat/`)

| File | Responsibility |
|---|---|
| `heuristicTranslation.ts` | Pure `translate(input): TranslationResult` — keyword + cold-start + refuse |
| `useChatSession.ts` | Ephemeral session state: messages, processing flag, refused-once flag |
| `submitChatMessage.ts` | Orchestrator: user bubble → translate → executor or form-expand → assistant bubble. Calls `useRouteEditing.applyMutation` directly (bypassing the legacy stub `interpretChatInput`) |
| `examplePhrases.ts` | The supported-phrases list rendered in two places (input hint, post-refuse) |
| `types.ts` | `ChatMessage`, `ChatRole`, `ChatSession`, `TranslationResult` |
| `index.ts` | Barrel |

### Explicit limits (do not extend)

- Only 3 response types: `cold_start`, `modify`, `refuse`. The other 5
  from Turn Model Spec §3 (`alternatives`, `replace`, `clarify`,
  `pushback`, `explain`) are Phase 2.
- No manual edit narration — drag/click/remove edits stay silent and
  are narrated in Phase 2 by the real LLM.
- Ephemeral history only — messages live in `useState`, lost on
  reload. Phase 2 wires real persistence via the memory model.
- No multi-mutation compositional handling, no streaming, no pushback
  counter, no MANDATE block enforcement, no schema validation, no
  persona-modulated phrasing.
- The hardcoded `us-287` segment id demonstrates `avoid_segment` only;
  the stub never tries to extract road names dynamically.

### Telemetry (`rb2_chat_*`)

| Event | When | Properties |
|---|---|---|
| `rb2_chat_message_submitted` | User submits typed input | `input_length` |
| `rb2_chat_mutation_applied` | Heuristic translation produced a successful mutation | `mutation_type` |
| `rb2_chat_mutation_failed` | Mutation applied but executor failed | `mutation_type`, `failure_kind` |
| `rb2_chat_cold_start_triggered` | Input recognized as cold-start | `input_length` |
| `rb2_chat_refused` | Input not understood | `input_length` |
| `rb2_chat_error` | Unexpected exception in submission handler | `error_name` |

No PII — the input text is never captured, only its length.

The `rb2_chat_refused` rate is the most important signal: it tells us
which user intents the stub cannot handle, which informs Phase 2
prompt engineering priority.

### Test coverage

- `heuristicTranslation.test.ts` — 41 tests, 100% coverage on the
  translator (exceeds the ≥90% bar).
- `useChatSession.test.ts` — 9 tests covering opening message, append,
  processing flag, refuse-hint flag.
- `submitChatMessage.test.ts` — 8 tests covering all 3 response types
  plus the no-route path and the error path. 100% statements/lines
  (exceeds the ≥80% bar).

### Phase 3 deletion contract

When Phase 2 lands real chat:

1. Delete `src/features/route-builder-v2/chat/` entirely.
2. Replace `submitChatMessage` import in `RouteBuilder2.tsx` with the
   Phase 2 dispatcher.
3. `<ChatShell />`, `<ChatPanel />`, `<ChatDrawer />`, `<ChatBody />`
   stay — they're the durable surface. Only the props that today flow
   from the stub will rewire to the real session state.
4. `<FormPanel />`'s `forwardRef` + `useImperativeHandle({ expand })`
   may stay (Phase 2 still needs to surface the form) or get folded
   into the dispatcher — decide at the cutover.

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
- **`useRouteEditing.applyAIEdit`** still returns
  `{ ok: false, reason: 'chat_translation_unavailable' }` — the P1.4
  chat surface bypasses it and calls `applyMutation` directly. The
  legacy stub `interpretChatInput` in the executor adapter remains a
  no-op (`null`). Both go away in Phase 3 with the rest of the
  P1.4 stub.
