# Route Builder Review — July 2026

A product/engineering review of Route Builder 2.0: what's solid, what could ruin
the user experience, and where tribos.studio can beat Strava / RideWithGPS /
Komoot. The P0 items below were fixed in the PR that added this document; P1–P3
are the prioritized backlog.

## Verdict

The architecture is genuinely good: thin hooks over v1 services
(`src/hooks/route-builder/`), a real mobile layout, well-built source-agnostic
undo/redo (`useRouteHistory.ts`), surface/gradient/wind layers, multi-provider
routing fallback with telemetry, and a solid Garmin push with TCX fallback. The
gap between "good" and "great" is **trust**: several features silently failed
or produced subtly wrong output, and the AI pipeline discards the AI's actual
road intelligence.

## P0 — trust killers (fixed in this PR)

1. **Exports emitted zero elevation.** `useRoutePersistence.exportRoute` passed
   the store's 2-tuple `[lng, lat]` coordinates straight to the GPX/TCX/FIT
   generators; per-point elevation lived only in the analysis layer's parallel
   `elevations_m` array. Every exported course looked flat on a device.
   *Fix:* `withElevations()` resolves the profile via `getElevationData`
   (cached + deduped) and zips `[lng, lat, ele]` 3-tuples before export and
   before Garmin course push; falls back to flat coordinates on failure.
   Tests: `src/utils/routeExport.test.ts`,
   `src/hooks/route-builder/withElevations.test.ts`.

2. **Share links were owner-only.** `shareRoute` copied `/routes/:id`, but
   `api/routes.js getRoute` enforced `.eq('user_id', userId)` and never checked
   the `visibility`/`is_private` columns — recipients always got
   "Route not found". *Fix:* `getRoute` now allows reads of shared routes
   (`visibility='public'` / `is_private=false`; non-shared still 404 so ids
   can't be probed), a new `set_route_visibility` action flips a route public,
   `shareRoute` does that before copying (with a confirm modal in
   `RouteActionsPanel`), and a non-owner loading a shared route gets it as an
   unsaved copy (Save creates their own row). Note: recipients must be signed
   in — the route page is auth-gated. A public unauthenticated share page is a
   P2 follow-up.

3. **BRouter — the *primary* gravel/MTB provider — had no timeout.**
   A hung request to the free public `brouter.de` instance stalled generation
   and drag-snap indefinitely behind a spinner. *Fix:* `AbortSignal.timeout(12000)`
   (matching Stadia) on BRouter and the Mapbox directions/map-matching fetches
   in `directions.js`, so the fallback chain can advance.

4. **Silent failures.** Clip-reroute failure was console-only ("confirm clip"
   appeared to do nothing); Bike Infra / Familiar Segments layer fetch failures
   were console-only (toggle on → silence); POI/analysis errors
   (`analysis.lastError`) and weather errors never reached the page-level
   toast. *Fix:* an `overlayError` slot + `onLoadFailure` callbacks on both
   layers (fired only when the layer has nothing to show), and
   `analysis.lastError` / `weather.error` joined the `errorRaw` aggregation,
   all with friendly copy in `friendlyRouteError`.

5. **Error-toast quirks.** Unmapped errors showed raw exception text; dismissal
   was by string-equality, so a repeat of the same error after dismissing
   showed nothing. *Fix:* technical-looking messages (network stack text, HTTP
   codes, exception names) map to generic copy with the raw message logged;
   dismissal resets whenever the error clears, so the next occurrence — even an
   identical one — shows again.

## P1 — robustness & feel (next)

- **Elevation-hover re-renders the whole page per mousemove.** `hoverKm` is
  page-root state (`RouteBuilder2.tsx`); `ElevationPanel` fires `onHoverKm`
  unthrottled, re-rendering the 1,700-line page + map + layers every frame
  while scrubbing. RAF-throttle and isolate into a small context/component.
- **Stale-overwrite race on drag-snap.** No sequence guard in
  `useRouteManipulation.js` — overlapping snaps apply in completion order, so a
  slow early response can clobber a newer one. Adopt the monotonic-seq pattern
  already used for the RB2 surface check.
- **Elevation double-fetch per edit.** `useRouteAnalysis` refetches the full
  profile on every geometry change while the v1 manipulation path also fetches
  post-snap — two code paths against a ~1 req/s API, with no debounce.
- **Save discoverability.** Save/Export live two clicks deep in the "Routes"
  rail flyout; add a persistent Save affordance near the stats and a
  `beforeunload` warning when there are unsaved changes.
- **Data-loss gaps.** No server-side draft/autosave (localStorage mirror is the
  only crash safety net, same-device only); full geometry is persisted to
  localStorage with no quota handling.
- **GPX import** seeds only start/end waypoints and drops elevation — editing
  an imported route reroutes the entire track between two points.

## P2 — competitive parity (table stakes vs RideWithGPS/Komoot/Strava)

- **Turn-by-turn cue sheets.** None exist; devices get a breadcrumb with no
  turn prompts. Provider turn data already flows through
  `src/utils/directions.js` and is discarded — thread it into TCX
  `<CoursePoint>` / FIT `course_point` and a cue-list UI. Biggest single
  functional gap.
- **Wahoo push isn't wired into RB2.** `wahooService.pushRoute` works but only
  legacy v1 components reference it; add beside Garmin in `RouteActionsPanel`.
- **Public share page.** Unauthenticated route viewing (P0 fix covers
  signed-in recipients only).
- **Route library:** map thumbnails (static map from stored geometry),
  duplicate-route, sort controls, the unused `tags` column.
- **Routing-response cache.** Zero caching in any provider module against a
  10k/month Stadia tier, with ~16 provider calls per AI generation.

## P3 — where to beat the competition (strategy)

1. **Training-aware route generation as the hero feature.** Nobody generates a
   route that *fits today's workout*. The pieces exist (Discover ranking,
   workout intervals on the elevation chart, personalized ETA, fuel/PSI/wind).
   Missing: **elevation-gain targeting** (none today) and **closed-loop
   distance correction** — the Claude path accepts 0.4×–2.0× of requested
   distance (`aiRouteGenerator.js`) with no post-snap correction. Make
   "40 km / 600 m / tempo" reliably produce 40 km / ~600 m.
2. **Stop discarding Claude's road intelligence.**
   `convertClaudeToFullRoute` replaces Claude's `keyDirections` with pure
   bearing/radius geometry — the LLM only contributes distance, archetype, and
   prose. Geocode named roads/areas into real via-points, or move to a
   "Claude picks corridor, Valhalla costs it" design.
3. **Conversational route editing** (the chat dock) is already a differentiator
   competitors don't have — keep investing.
4. **Wire up `graphHopper.js`.** The best surface/traffic custom model in the
   codebase is dead code; evaluate as gravel primary vs. free-tier BRouter.
