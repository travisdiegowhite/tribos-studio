# Route Builder 2.0 — Market Analysis & Coach-Differentiated Roadmap

_Last updated: 2026-06-10. Strategy: **Coach-differentiated** — win on training/coach-aware
routing; be good-enough on table stakes; deliberately punt on heatmap, in-app
turn-by-turn, offline, and native mobile._

## TL;DR

RB2 is **architecturally further along than it is widely shipped**. The conversational
coach — the entire reason RB2 exists over v1 — is **real and working**, not the
"heuristic stub" that `route-builder-v2-architecture.md` still describes. The work is
to **deepen and ship** the differentiator, not build it.

## Reality check — what is actually on disk (June 2026)

The architecture doc is stale. Current state, verified in code:

| Capability | State | Where |
|---|---|---|
| Conversational route coach | **Real Claude pipeline** (Sonnet 4.6), tool-use loop, 13 working edit intents | `api/route-coach.js`, `api/utils/routeEditTools.js`, `src/features/route-builder-v2/chat/applyAIEditViaCoach.ts` |
| Coach context | persona + today's prescription + fitness (RSS/TFI/AFI/FormScore) + familiar-roads w/ directional bias | `api/utils/routeCoachContext.js` |
| Chat persistence | **Persisted per-route** in `coach_conversations` (migration 091), hydrated on mount, last-10 windowed into prompt | `src/features/route-builder-v2/chat/useChatSession.ts` |
| Surface data | **Real OSM/Overpass** per-segment | `src/features/route-builder-v2/layers/SurfaceLayer.tsx` → `surfaceOverlay.js` |
| Weather/wind (UI) | Real fetch + head/tail/cross analysis for the panel/overlay | `src/hooks/route-builder/useRouteWeather.ts` |
| Weather/wind (coach) | **Was NOT wired into the coach** — addressed by Epic 1 (this branch) | — |
| 7 analysis layers | Surface, Gradient, POI, BikeInfra, Familiar, Wind, Intervals | `src/features/route-builder-v2/layers/` |
| Routing engines | Stadia/Valhalla, BRouter, GraphHopper, Mapbox (via v1) | `src/utils/` |
| Export + device push | GPX/TCX/FIT + Garmin Course push | `src/utils/routeExport.ts`, `api/garmin2-route-push.js` |
| Access | Behind per-user beta flag (`route_builder_v2_enabled` + env), default off | `src/hooks/useRouteBuilderV2Access.ts` |

## Competitive baseline (RWGPS / Komoot / Strava, 2026)

Table stakes the leaders all ship: community **heatmap / popularity routing**,
**surface-type %** breakdown, **in-app turn-by-turn voice navigation**, **offline
maps**, **native mobile apps**, **one-tap device sync**, **route discovery**.

None of them do **training-plan-aware** routing or a **coaching-voice** conversational
builder. That gap is Tribos's moat.

Sources: ridewithgps.com/route-planner, ridewithgps.com/heatmap, komoot.com/features,
support.strava.com (Routes on Web), cyclist.co.uk best-route-apps-2026.

## Strategic decision

- **Lean into the coach.** "The only route builder that understands your training."
- **Good-enough table stakes:** surface %, route discovery framed around the
  prescription, device-sync parity.
- **Deliberate non-goals** (stop tracking these as "missing"): community heatmap,
  in-app voice navigation, offline maps, native app. Navigation stays
  **export-to-head-unit**. (Reinforced by the deliberate no-service-worker policy in
  `CLAUDE.md`.)

---

## Roadmap (epics, file-level)

### Epic 0 — Ship it: the v1→v2 cutover (the real blocker)

**Done:**
- ✅ Updated `route-builder-v2-architecture.md` to current reality (it described a
  two-PR-stale "heuristic stub" state; now has a **Current state** section covering
  PR-4A/4B `/api/route-coach` + Epic 1, with superseded markers on the old chat-path
  descriptions).

**Audit findings (verified, June 2026):**
- `api/route-builder-2-chat.js` (+ test) has **no `src/` importers** — superseded by
  `/api/route-coach`. Safe to delete.
- The entire `src/routing/` tree (`executor/` + `RouterClient/`) is imported by nothing
  outside `src/routing/` itself — dead from the app's perspective. (The lone
  `src/hooks/route-builder/types.ts` grep hit is a prose comment, not an import.)
  Deleting a whole subsystem is hard-to-reverse and the code says "awaiting S6," so it
  needs explicit sign-off.
- Access gate confirmed: `useRouteBuilderV2Access` requires `VITE_ROUTE_BUILDER_V2_ENABLED`
  **AND** per-user `user_profiles.route_builder_v2_enabled` (migration `090`), fails closed.

**Done (cont'd):**
- ✅ Deleted the dead code: `api/route-builder-2-chat.js` (+test) and the entire
  `src/routing/` tree (~90 files) + standalone executor smoke/audit scripts. The lone
  live dependency (`elevationEnrichment`'s `fnv1a32`/`stableJson`) was relocated to
  `src/utils/stableHash.ts`. type-check clean; suites green.
- ✅ Parity gate audited — see **Epic 0 parity gate** below. Verdict: strong parity,
  two cutover blockers (send-to-device, sharing).

**Done (cont'd):**
- ✅ Both parity blockers cleared — send-to-device (Garmin push) and route sharing are
  wired into `RouteActionsPanel`.

**Remaining (product / hard-to-reverse decisions — not blocked on functionality):**
- Resolve the intentional duplication between `replicatedEditLogic.ts` and v1's
  `aiRouteEditService.js`; pick one canonical edit path.
- Flip default in `useRouteBuilderV2Access.ts` + `VITE_ROUTE_BUILDER_V2_ENABLED` and
  decide redirect direction — exposes RB2 to all users. **Now unblocked on parity.**

### Epic 1 — Weather/wind-aware coach ✅ (spiked on this branch)
Highest ROI, smallest diff, something **no competitor does**. The coach now reasons
about wind and proactively suggests riding the windward leg first for a tailwind home.
See "Epic 1 — shipped" below.

### Epic 2 — Persistent rider memory (the unbuilt "Doc 4" layer)
Per-route history exists; **cross-route preferences don't**.
- New table `rider_route_facts {user_id, fact, source, last_seen}`.
- Add `getPersistentFacts()` to `collectRouteCoachContext` in `routeCoachContext.js`;
  render a `=== RIDER PREFERENCES ===` block.
- Distill durable facts from `coach_conversations` with a cheap async Haiku pass, off
  the hot path.

### Epic 3 — Surface intelligence as a first-class stat
- Promote the existing paved/gravel/unpaved % (from `SurfaceLayer.tsx` `onSegments`) into
  `StatsOverlay.tsx` as a permanent stat, not just a toggle.
- **Verify** `surface_gravel`/`surface_paved` edits actually bias the router (trace
  `applyRouteEdit`); if cosmetic, scope a real fix (don't fix opportunistically per
  `CLAUDE.md`).
- Consider moving the Overpass call server-side/cached at scale.

### Epic 4 — Richer edit vocabulary + multi-intent
- Let one turn apply a **sequence** of `proposedEdit`s ("hillier AND longer" currently
  drops one) — `applyAIEditViaCoach.ts` handles a single edit today; `route-coach.js`
  already loops up to `MAX_TOOL_USE_ROUNDS`.
- Use the wired-but-empty `DEFERRED_INTENTS` guard in `routeEditTools.js` to add
  aspirational intents (e.g. `anchor_at_poi` via `routePOIService`, `loop_back_by_time`).

### Epic 5 — Table-stakes that serve the coach story
- **Route discovery / "My Routes + suggested"** framed around today's prescription
  (reuse `routesService` + prescription context), not a generic popularity feed.
- **Device-sync parity:** Garmin push works; verify Wahoo/Hammerhead + clean TCX
  fallback (503 path already handled in `garmin2-route-push.js`).

### Epic 6 — Trust & quality
- Build a dashboard query over `rb2_chat_edit_failed` + `failure_reason` telemetry to
  prioritize the top failing intents.
- Apply `assertKm`/`assertCoordinate` boundary guards at any new context seams.

### Suggested sequence
1. Epic 0 doc fix → **Epic 1** (done) → ship to beta.
2. Epic 3 surface stat + Epic 6 failure dashboard.
3. Epic 2 memory + Epic 4 multi-intent.
4. Epic 0 full cutover + Epic 5 discovery/device parity.

---

## Epic 0 parity gate — v1 → v2 (audit results, June 2026)

**Verdict: strong parity.** v2 covers ~22 of ~24 user-facing v1 capabilities,
including everything in the core build/edit/save loop. Five gaps remain; two are
cutover blockers. The flag flip should wait on the two blockers (or ship dual-mode
with clear messaging).

**At parity (no action needed):** AI generation, conversational chat editing, manual
edits (click-add / drag / remove / reorder), snap-to-road, undo/redo, reverse/clear,
interactive elevation profile, surface overlay **+ % breakdown**, POIs, save
(new + update), load/edit existing route (`/route-builder-2/:routeId`), my-routes list,
GPX import, export GPX/TCX/FIT, weather/wind overlay, **plus v2-only wins** (workout/
interval overlay, bike-infra layer, familiar-segments layer).

### Gaps

| # | Capability | v2 status | Evidence | Effort |
|---|---|---|---|---|
| 1 | ~~**Push to Garmin (send-to-device)**~~ | **✅ DONE** | `useRoutePersistence.pushToGarmin`/`checkGarminConnection` + `RouteActionsPanel` "Send to Garmin" item (connected-only) with Courses-API→TCX fallback. | Shipped on this branch. |
| 2 | ~~**Route sharing (share link)**~~ | **✅ DONE** | `useRoutePersistence.shareRoute` (copies a `/routes/:id` link; prompts a save when unsaved) + "Share Link" button in `RouteActionsPanel`. | Shipped on this branch. |
| 3 | **Basemap style toggle** | PARTIAL (wired, no UI) | `Map.tsx:18,105` consumes `BASEMAP_STYLES` + a `mapStyle` prop, but nothing in `RouteBuilder2.tsx` switches it — users only ever see the default. | **Low** — add a style switcher to `ControlRail`/`LayerToggles`. |
| 4 | **`commute` routing profile** | PARTIAL (missing option) | `EditToolbar.tsx` profile options are road/gravel/mountain/walking — no `commute` (v1 has it). | **Low** — add the option. |
| 5 | **Route description + post-save rename** | PARTIAL | Save modal has a name field only (`RouteActionsPanel.tsx`); no description, no rename-after-save. | **Med** — add description field; expose rename. |

### Cutover blockers — both cleared ✅
1. ~~Send-to-device (Garmin).~~ **✅ DONE** — `RouteActionsPanel` offers "Send to Garmin"
   for connected users via `useRoutePersistence.pushToGarmin`, with the
   Courses-API-unavailable → TCX fallback, mirroring v1's `RouteExportMenu`.
   (Wahoo/Hammerhead remain covered by FIT export, as in v1.)
2. ~~Route sharing.~~ **✅ DONE** — `useRoutePersistence.shareRoute` copies a public
   `/routes/:id` link (and prompts a save when the route isn't persisted yet), surfaced
   as a "Share Link" button in `RouteActionsPanel`.

**No parity blockers remain.** The flag flip is now gated only on the two product/
hard-to-reverse decisions below, not on missing functionality. Items 3–5 (basemap
toggle, `commute` profile, route description/rename) are friction, not regressions —
they can ship alongside or shortly after cutover.

---

## Epic 1 — shipped on this branch

**What:** the route coach is now wind/weather-aware. Server-side so the coach always
has wind data regardless of whether the user opened the weather panel — zero client
changes.

**Files:**
- `api/utils/routeWeatherContext.js` (new) — fetches OpenWeatherMap for the route's
  start point and computes the distance-weighted head/tail/cross-wind breakdown against
  the actual geometry. Never returns mock data (fabricated wind → confidently wrong
  coaching), so it degrades to silence when `OPENWEATHER_API_KEY` is absent or the call
  fails.
- `api/utils/routeCoachContext.js` — `getRouteWeather` added to the parallel context
  fetch; new `renderWeatherBlock` + `=== WIND & WEATHER ===` prompt section with
  proactive tailwind-home guidance and a mandatory hazard call-out.
- `api/route-coach.js` — threads `weather` into the system-prompt builder.
- `api/utils/routeWeatherContext.test.js` (new) — 13 tests: wind classification,
  key-guard null behavior, mocked-fetch happy path, and prompt-block rendering.

**Behavior:** when wind is ~20+ km/h and the rider is flexible on direction, the coach
suggests riding the windward leg first (via `shift_direction`/`reverse`) so they earn a
tailwind home — framed as a suggestion, never overriding the prescription. Hazardous
conditions (thunderstorm/snow/freezing rain) are surfaced plainly regardless of coach
voice.

**Follow-ups not in this spike:** dedicated wind-bias edit intents (`headwind_out`/
`tailwind_home`) in `routeEditTools.js`; surfacing the coach's wind reasoning in the
WeatherPanel UI; caching the OWM call per (rounded-coord, hour).
