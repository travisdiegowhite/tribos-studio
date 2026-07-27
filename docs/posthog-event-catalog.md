# PostHog Event Catalog

**Purpose**: the single source of truth for what PostHog knows about tribos.studio.
Read this before querying PostHog data or adding instrumentation. It is the anchor
doc for the `posthog-analyst` and `posthog-instrumentation-auditor` agents and the
`posthog-weekly-brief` skill.

**Maintained by**: the `posthog-instrumentation-auditor` agent
(`.claude/agents/posthog-instrumentation-auditor.md`) — it is the only agent
permitted to edit this file directly.

**Last verified**: 2026-07-27 (initial authoring, from full code + docs audit)

---

## The two-pipeline split (read this first)

tribos.studio runs **two parallel telemetry pipelines that share no event names**:

| Pipeline | Transport | Coverage | Who reads it |
|---|---|---|---|
| **PostHog** (this doc) | `posthog-js` from the browser | Route Builder v1 + v2, almost nothing else | Nobody yet — that's what the agents fix |
| **Homegrown activity tracking** | `src/utils/activityTracking.js` → `/api/user-activity` → Supabase `user_activity_events` (~50 call sites) | Signup, activation, device connects, feature usage | Admin panel (`api/admin.js` `get_user_insights`) |

Practical consequence: **signup/activation/device-connect funnels cannot be built in
PostHog.** The only signup-adjacent PostHog event is `rb2_signup_modal_shown`. If a
question is about signups, activation, retention cohorts, or Strava/Garmin/Wahoo/COROS
connections, the data lives in Supabase `user_activity_events` — query it there
(the Supabase MCP `execute_sql` tool is allowlisted in `.claude/settings.json`).

The root-level `posthog-audit.md` documents the original conflict decisions but is
**stale** (predates the rb2 tracker and the TodaySpine flip); prefer this doc.

## Initialization & identity model

- Init: `src/main.jsx` — `PostHogProvider` with `defaults: '2025-11-30'`,
  `person_profiles: 'identified_only'`, and capture opted out in local dev
  (`import.meta.env.DEV`). Env vars: `VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST`.
- Identity: exactly one `posthog.identify(user.id, {...})` site —
  `src/contexts/AuthContext.tsx` (fires on session resolution and every auth state
  change). Person properties set there: `account_created_at`, `auth_provider`.
  **No email, ever** (PII rule). `posthog.reset()` fires on successful sign-out.
- Guests are anonymous (no person profile until identify).
- No feature flags, experiments, groups, or server-side (`posthog-node`) usage.
- No ingestion reverse proxy → ad blockers drop an unknown fraction of events.
  Treat all counts as floors, not exact truth.

## Event families

### 1. `route_builder_*` — v1 builder (legacy, `/ride/new/classic`)

- **Emitter**: `trackRouteBuilder()` in `src/utils/routeBuilderTelemetry.ts`
- **Envelope**: `{ session_id (sessionStorage rb_session_id), generation_id, timestamp }`
- Supports `{ immediate: true }` → `send_instantly` (used for abandonment events)
- **Full catalog**: `docs/route-builder-telemetry.md` (canonical for this family)

~24 events: generation lifecycle (`generation_started/completed/failed/abandoned`,
`generation_context_built`, `generation_claude_called/responded/failed`,
`generation_routing_called/succeeded/failed`, `provider_fallback_chain_advanced`),
`suggestion_selected`, `route_saved/exported/discarded/opened`,
`route_edit_started/applied/failed`, `poi_layer_toggled`, `segment_alternative_explored`.

Since RB2 became the canonical builder at `/ride/new`, v1 volume comes only from the
hidden `/ride/new/classic` fallback — **expect low/declining volume**; a spike means
users are being routed to the fallback.

### 2. `rb2_*` — v2 builder (canonical, `/ride/new`)

- **Emitter**: `trackRb2()` in `src/features/route-builder-v2/telemetry/trackRb2.ts`
- **Envelope**: `{ session_id (sessionStorage rb2_session_id), timestamp }`
- **No** `immediate` option and **no abandonment event** — tab-close events are lost
- **Full catalog**: `docs/route-builder-v2-architecture.md` §Telemetry (lines ~166–200
  and the table at ~392–430). Known contradiction in that doc: the lower table still
  lists `rb2_mutation_applied`, `rb2_mutation_failed`, `rb2_ai_edit_unavailable`,
  which the upper section says were removed — the events do not fire.

~70 events across: generation (`rb2_generation_started/completed/failed`,
`rb2_guest_generation_cap_hit`), persistence (`rb2_route_saved/save_failed/loaded/
exported/export_failed/deleted/imported/import_failed/pushed_to_device/push_failed/
shared/share_failed`), map interaction (`rb2_manual_action_applied/failed`),
history (`rb2_route_undo/redo`), chat (`rb2_chat_message_submitted/route_options_shown/
route_generated/route_generation_failed/edit_applied/edit_failed/error/cold_start_triggered`,
`rb2_coach_api_failed`), form (`rb2_form_expanded/collapsed/field_changed/submitted`),
panels (`rb2_layer_toggled`, `rb2_analysis_layer_toggled`, `rb2_tire_width_changed`,
`rb2_fuel_intensity_changed`, `rb2_persona_changed`, waypoint events), geolocation
(`rb2_geolocation_*`), drafts (`rb2_draft_autosaved/restored`), location search,
clip mode, workout attach, `rb2_signup_modal_shown`, `rb2_page_viewed`,
`rb2_save_clicked`, `rb2_send_to_garmin_clicked`, `rb2_send_to_wahoo_clicked`, etc.

### 3. Standalone

- `route_fallback_used` — `src/utils/fallbackTelemetry.ts` (called from
  `aiRouteGenerator.js`). Properties: `tier`, `reason`, `user_id`, `training_goal`,
  `target_distance_km`. Predates the T1.4 envelope (no session_id).

### 4. `today_view.*` — DEAD family

Dot-namespaced events (`today_view.opened`, `.coach_message_read`, `.metric_expanded`,
`.route_sent_to_garmin`, `.ride_today_clicked`, `.coach_message_sent`,
`.recent_ride_clicked`; `view_version: 'today_v3_clusters'`). Their only source,
`src/views/today/TodayView.tsx`, has been **orphaned since the 2026-07 TodaySpine
flip** — `/today` now renders `src/views/today-spine/`, which emits **zero** PostHog
events. Expect zero volume; any recent hits mean the query window predates the flip.
Exclude from analysis unless the question is explicitly historical.

## Known quirks (do not trip on these)

1. **Three session-id schemes that never join**: `rb_session_id` (v1),
   `rb2_session_id` (v2), `tribos_session_id` (the Supabase pipeline). You cannot
   stitch a cross-builder or cross-pipeline session.
2. **v1/v2 duplicate concepts, different shapes**: e.g. `route_builder_generation_completed`
   vs `rb2_generation_completed`, `route_builder_route_saved` vs `rb2_route_saved` —
   overlapping meaning, different property names. Funnels covering "all builders" must
   union both families explicitly.
3. **`generation_routing_called` fires once per provider attempt** — it overcounts
   "generations" badly. Use `generation_started` for generation counts.
4. **`prompt_length_chars` is always null** on `route_builder_generation_claude_called`.
5. **Two naming conventions**: underscore prefixes (`route_builder_*`, `rb2_*`) vs
   dot namespace (`today_view.*`). New events should use the underscore-prefix style.
6. **`route_builder_elevation_profile_viewed`** is documented in the v1 catalog but
   was never implemented.

## PII & property rules (from `docs/T1.4-posthog-baseline-instrumentation.md`)

- **Never capture raw coordinates** (lat/lng) — only booleans like `start_coord_set`.
- Error messages truncated to **200 chars** (`truncateErrorMessage`).
- **No email** in events or person properties.
- Distances carry unit suffixes (`_km`, `_m`) per the repo-wide distance convention.
- Person properties are limited to non-PII account facts (`account_created_at`,
  `auth_provider`).

## Coverage map

| Surface | PostHog instrumentation |
|---|---|
| Route Builder v2 (`/ride/new`) | ✅ Extensive (`rb2_*`) |
| Route Builder v1 (`/ride/new/classic`) | ✅ Extensive (`route_builder_*`) |
| Today Spine (`/today`) | ❌ None (`today_view.*` is dead) |
| Training dashboard (`/training`) | ❌ None |
| Planner (`/planner`) | ❌ None |
| Progress | ❌ None |
| Settings | ❌ None |
| Gear | ❌ None |
| Community | ❌ None |
| Route library | ❌ None |
| Landing / marketing | ❌ None (Vercel Analytics covers pageviews) |
| Auth / signup | ❌ None (Supabase pipeline only) |
| OAuth callbacks (Strava/Garmin/Wahoo/Google) | ❌ None (Supabase pipeline only) |
| Admin | ❌ None |

Autocapture + history-based pageviews/pageleaves ARE on (via the `defaults:
'2025-11-30'` bundle), so `$pageview`/`$autocapture` exist for every surface even
where no custom events do.

## Low-volume caveat

tribos.studio is in beta with **~65 users**. Weekly event counts are small.
Always report **absolute counts**, not just percentages; treat any week-over-week
comparison where either side is n < 20 as directional noise, and never claim
statistical significance.
