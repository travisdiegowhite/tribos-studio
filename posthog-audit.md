# PostHog usage audit — Route Builder (T1.4 prep)

This audit inventories every existing analytics emission in the Tribos
frontend so that T1.4 baseline events can be added without duplicating
or breaking the historical data stream.

## Initialization

- `src/main.jsx:4,18-25` — `PostHogProvider` from `posthog-js/react`
  wraps the entire React tree. API key/host come from
  `VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST`.
- The `posthog-js` singleton is the same instance used by
  `usePostHog()` and by any non-component module that imports
  `import posthog from 'posthog-js'`.

## Two parallel telemetry systems

The codebase currently runs **two** separate analytics pipelines.
T1.4 only adds to PostHog; the `activityTracking` system stays
untouched.

### 1) Custom `activityTracking` → `/api/user-activity` (Supabase-backed)

Defined in `src/utils/activityTracking.js`. Batched, flushed on
`beforeunload` / `visibilitychange:hidden`. Exposes
`trackFeature(eventType, details)` plus four siblings
(`trackPageView`, `trackSync`, `trackUpload`, `trackInteraction`).

Route-builder-relevant call sites that already emit through this
pipeline (event names are the `EventType.*` enum values, NOT PostHog
events):

| File:line | Event | Properties |
|---|---|---|
| `src/pages/RouteBuilder.jsx:609` | `route_create_from_activity_nudge` (passed as `EventType.FEATURE` constant, called with `'route_from_activity'`) | `activityId` |
| `src/pages/RouteBuilder.jsx:1574` | `ROUTE_CREATE` (`'route_create'`) | `routeId, routeName, distanceKm, routeType, trainingGoal, generatedBy, isUpdate` |
| `src/components/RouteExportMenu.jsx:87` | `ROUTE_EXPORT` (`'route_export'`) | `format, routeName` |
| `src/components/RouteExportMenu.jsx:115` | `ROUTE_SEND_TO_GARMIN` (`'route_send_to_garmin'`) | `routeName, success` |
| `src/pages/MyRoutes.jsx` | `ROUTE_CREATE_FROM_EMPTY_STATE` (three variants) | (various) |
| `src/components/RideAnalysisModal.jsx` | `ROUTE_CREATE_FROM_ACTIVITY_NUDGE` | (activity context) |
| `src/utils/wahooService.js` | `ROUTE_SEND_TO_WAHOO` | (provider context) |

**Policy for T1.4:** leave every one of the above alone. They have
historical data and are read out of Supabase, not PostHog.

### 2) Direct `posthog.capture(...)` calls

| File:line | Event | Properties |
|---|---|---|
| `src/views/today/TodayView.tsx:26` | `today_view.opened` | `view_version` |
| `src/views/today/TodayView.tsx:42` | `today_view.coach_message_read` | `view_version, persona` |
| `src/utils/fallbackTelemetry.ts:23` | `route_fallback_used` | `tier, reason, user_id, training_goal, target_distance_km` |

`route_fallback_used` was added in T1.3. **Do not rename or rewire it.**
T1.4 builds around it: the `generation_completed` event carries
`fallback_used: boolean` and `fallback_tier: 1|2|3|null` so funnel
analyses can be done without joining the fallback event.

The two `today_view.*` events use a different naming convention
(`feature.verb_past`). T1.4 follows the spec's `route_builder_*` prefix
to keep Route Builder telemetry namespaced and grep-able; we don't
retroactively rename TodayView events.

## File map of the Route Builder pipeline

| Concern | File |
|---|---|
| Page + handlers | `src/pages/RouteBuilder.jsx` (5839 lines) |
| Zustand store | `src/stores/routeBuilderStore.js` |
| AI generation entry | `src/utils/aiRouteGenerator.js` (`generateAIRoutes`) |
| Iterative generator | `src/utils/iterativeRouteBuilder.js` (`generateIterativeRouteVariations`) |
| Claude API wrapper | `src/utils/claudeRouteService.js` (`generateClaudeRoutesOrThrow`, `ClaudeRouteServiceError`) |
| Multi-provider routing | `src/utils/smartCyclingRouter.js` (`getSmartCyclingRoute`) |
| Routing back-ends | `stadiaMapsRouter.js`, `brouter.js`, Mapbox in `smartCyclingRouter.js` |
| Save / list / get | `src/utils/routesService.js` |
| Export (GPX/TCX/FIT) | `src/utils/routeExport.ts` invoked by `src/components/RouteExportMenu.jsx` |
| AI edit | `src/utils/aiRouteEditService.js` + `src/pages/RouteBuilder.jsx:1362 handleAIEditSubmit` |
| Manual edit hook | `src/hooks/useRouteManipulation.js` |
| Fallback (T1.3) | `src/utils/routeGenerationFallback.ts` + `src/utils/fallbackTelemetry.ts` |

## Conflicts / alignment decisions

1. `route_create` (activityTracking) vs `route_builder_route_saved`
   (T1.4 PostHog). Different sinks, different names — both fire.
   `route_builder_*` is the PostHog funnel; `route_create` is the
   internal Supabase activity log. No conflict.
2. `route_export` (activityTracking) vs `route_builder_route_exported`
   (T1.4). Same separation: both fire, different sinks.
3. `route_fallback_used` (existing PostHog) is wired from inside
   `generateAIRoutes` after `generateFallbackRoute` runs. T1.4 leaves
   that call in place and additionally emits `generation_completed`
   with `fallback_used: true` for the same event so PostHog has both
   the dedicated fallback signal and the funnel-aligned signal.
4. No existing PostHog event uses the `route_builder_` prefix, so the
   new namespace is clean.

## Notes for implementation

- All new PostHog emissions go through the helper
  `src/utils/routeBuilderTelemetry.ts` (`trackRouteBuilder`). No raw
  `posthog.capture` calls in Route Builder code.
- `session_id` is a separate cookie/sessionStorage key
  (`rb_session_id`) from `activityTracking`'s `tribos_session_id`.
  Keeping them distinct avoids accidental cross-contamination if either
  side changes its session model.
- `generation_id` is a per-attempt UUID held in a module-local; spec
  acknowledges the two-tab collision risk and accepts it for v1.
