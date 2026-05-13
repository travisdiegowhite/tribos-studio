# Route Builder telemetry catalog

This is the canonical list of PostHog events emitted by the Route
Builder pipeline, owned by T1.4. Every event is fired through
`trackRouteBuilder()` from `src/utils/routeBuilderTelemetry.ts`, which
prefixes the name with `route_builder_` and injects the common
envelope.

The pre-existing `route_fallback_used` event (added in T1.3, kept in
`src/utils/fallbackTelemetry.ts`) is NOT renamed — it still fires on
its existing schema. `generation_completed.fallback_used` is the
funnel-aligned signal that the same event carries.

## Common envelope (every event)

Injected by the helper, no need to pass at the call site:

| Property | Type | Notes |
|---|---|---|
| `session_id` | string (UUID) | Per-browser-session, stored in `sessionStorage["rb_session_id"]`. Distinct from the `activityTracking` session id. |
| `generation_id` | string \| null | UUID minted by `startGenerationId()` when an AI generation begins. Lives in a module singleton — two concurrent tabs would collide; acceptable for v1. |
| `timestamp` | ISO 8601 string | Explicit; PostHog also adds its own. |

Call sites add:

| Property | Notes |
|---|---|
| `user_id` | Not injected automatically — PostHog already attaches the distinct id. Don't add a separate field unless the spec lists it explicitly (e.g. `route_fallback_used`). |
| `builder_mode` | `"ai" \| "manual" \| "editing"` — passed on events where the mode is relevant. |
| `source` | `"route_builder_page" \| "training_calendar" \| "coach_check_in" \| "other"` — currently always `"route_builder_page"`. |

## Event catalog

### Generation funnel — Priority 1

| Event | When | Properties (beyond envelope) |
|---|---|---|
| `route_builder_generation_started` | User clicks Generate in AI mode | `training_goal, time_available_minutes, route_type, route_profile, explicit_distance_km, start_coord_set, race_type, race_date, builder_mode, source, use_iterative_builder` |
| `route_builder_generation_completed` | All suggestions returned to UI | `total_duration_ms, suggestions_count, fallback_used, fallback_tier, builder_mode` |
| `route_builder_generation_failed` | Pipeline threw past the fallback safety net | `total_duration_ms, failure_kind, error_message` |
| `route_builder_generation_abandoned` | User navigated away / hid tab / started a fresh generation mid-flight | `elapsed_ms, stage, reason` |
| `route_builder_suggestion_selected` | User picked one of the AI suggestions | `suggestion_index, was_fallback, distance_km, elevation_gain_m, source, builder_mode` |

### Generation internals — Priority 2

| Event | When | Properties |
|---|---|---|
| `route_builder_generation_context_built` | After past-rides + preferences analysis, before Claude | `duration_ms, past_rides_count, familiar_segments_count, has_training_context` |
| `route_builder_generation_claude_called` | Just before the Claude HTTP call | `prompt_length_chars` (currently null — prompt is built inside `claudeRouteService`; wiring is out of scope) |
| `route_builder_generation_claude_responded` | Claude returned non-empty suggestions | `duration_ms, suggestions_count, tokens_used` |
| `route_builder_generation_claude_failed` | Claude HTTP / parse / empty | `duration_ms, failure_kind, error_message` |
| `route_builder_generation_routing_called` | Each routing-provider attempt in `smartCyclingRouter` | `provider, profile, waypoint_count` |
| `route_builder_generation_routing_succeeded` | Provider returned a route | `provider, duration_ms` |
| `route_builder_generation_routing_failed` | Provider errored or returned empty | `provider, duration_ms, failure_reason` |
| `route_builder_provider_fallback_chain_advanced` | First-choice provider failed and the orchestrator fell to the next | `from_provider, to_provider, failure_reason` |

`failure_kind` for `generation_claude_failed`:
`"timeout" | "5xx" | "429" | "401" | "malformed" | "empty_response" | "other"`.
Mapping logic lives in `classifyClaudeFailure()` in the helper.

### Route lifecycle — Priority 3

| Event | When | Properties |
|---|---|---|
| `route_builder_route_saved` | After `routesService.saveRoute` succeeds | `route_id, is_new, distance_km, elevation_gain_m, generated_by, was_fallback, time_from_generation_to_save_seconds, builder_mode` |
| `route_builder_route_exported` | User exports GPX / TCX / FIT | `route_id, format, distance_km` |
| `route_builder_route_discarded` | User clears session / starts new | `route_id, had_edits, had_ai_suggestions` |
| `route_builder_route_opened` | User loads a previously saved route | `route_id, time_since_creation_days, builder_mode, source` |

`route_fallback_used` (legacy, T1.3) continues to fire independently
from `src/utils/fallbackTelemetry.ts` with its existing properties:
`tier, reason, user_id, training_goal, target_distance_km`.

### Editing — Priority 4

| Event | When | Properties |
|---|---|---|
| `route_builder_route_edit_started` | User opens the AI Smart Edit panel (any of four UI surfaces) | `route_id, edit_mode` |
| `route_builder_route_edit_applied` | An edit successfully modified the route | `route_id, edit_mode, edit_type, distance_km, elevation_gain_m` |
| `route_builder_route_edit_failed` | An edit attempt errored | `route_id, edit_mode, edit_type, failure_reason` |

`edit_type` values currently emitted: `"ai_chat_message"`,
`"add_waypoint"`, `"remove_waypoint"`, `"drag_waypoint"`. Reverse,
snap-to-roads, and reorder operations stay wired only at the existing
notification level; adding telemetry to the `useRouteManipulation` hook
is a small follow-up that fits inside this priority but is deferred to
keep the diff scoped.

Manual edits emit `route_edit_applied` directly — there is no separate
`route_edit_started` for manual mode since manual edits don't have a
discrete "start" event. The `builder_mode` envelope on
`generation_started` and on the route load path already covers entry
into manual editing.

### Secondary features — Priority 5

| Event | When | Properties |
|---|---|---|
| `route_builder_poi_layer_toggled` | User toggles an individual POI category in the panel | `route_id, layer, state` |
| `route_builder_segment_alternative_explored` | User opens the alternatives panel for a waypoint-pair segment | `route_id, segment_index, segment_position_km` |
| `route_builder_elevation_profile_viewed` | **Deferred.** The elevation profile is rendered unconditionally with the route, so there is no clean user-action site. A separate "expand profile" toggle would need to be added to the UI before this event has any meaning. |

## Property discipline

- Distances always carry `_km` or `_m` suffixes per T1.1.
- Durations always `_ms` integer.
- Booleans never null — use `true` / `false` explicitly.
- Error messages truncated to 200 chars via `truncateErrorMessage()`.
- No coordinates in event payloads. If a future event needs
  geographic data, use bounding-box quantization or hashed region
  identifiers.

## Abandonment semantics

`generation_abandoned` is fired from three places:

1. `RouteBuilder.jsx` `useEffect` cleanup on tab hide
   (`visibilitychange: hidden`) and `pagehide`. Uses
   `posthog.capture(..., { send_instantly: true })` so the event
   reaches the server before the tab closes.
2. The same `useEffect` cleanup on unmount.
3. `handleGenerateAIRoutes` when a new generation starts while a
   previous one is still in flight — the previous id is recorded as
   abandoned with `reason: "new_generation_started"` before
   `startGenerationId()` mints a fresh one.
4. `handleClearSession` when the user clears the page with a
   generation still active.

`stage` is one of `"context" | "claude" | "routing" | "analysis" |
"completed" | "failed" | "unknown"`. The completed/failed states make
the abandon hook a no-op so we don't double-count terminal generations.

## Adding a new event

1. Confirm it isn't already emitted under a different name — see
   `posthog-audit.md`.
2. Add a row to this catalog **before** writing code.
3. Call `trackRouteBuilder('<verb_past>', { ...props })` from the call
   site. Don't use `posthog.capture` directly.
4. If the event fires on tab close, pass `{ immediate: true }` as the
   third argument so PostHog flushes synchronously.

## Baseline data freeze

Once events have been flowing for ≥ 1 week of normal use, take a
snapshot of:

- Median + p95 `generation_completed.total_duration_ms`
- Generation success rate (`generation_completed` / `generation_started`)
- Fallback rate (`generation_completed{fallback_used=true}` / `generation_completed`)
- Edit rate (`route_edit_applied` users / `suggestion_selected` users)
- Save rate (`route_saved` / `suggestion_selected`)
- Provider win rate (`generation_routing_succeeded` grouped by `provider`)

Store as `docs/route-builder-baseline-YYYY-MM-DD.md`. This is the
number to beat when the T2.x executor lands.
