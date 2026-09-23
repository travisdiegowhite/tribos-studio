# Route quality brainstorm — bike lanes, shoulders, low traffic, real gravel

_2026-09-19. Status: brainstorm + Phase 1 and Phase 2 shipped on this branch.
Decisions taken: **self-host BRouter** as the routing lever (Track B); Phase 1
quick fixes first; then the LTS keystone (Phase 2) with Valhalla alternates
deferred to Phase 2b._

## Why

The Route Builder asks Valhalla/BRouter for "a bike route" and then guesses what
it got back. The three asks (prefer bike lanes and shoulders, avoid traffic, know
what is really gravel) share one root cause: **road-level attributes never enter
the routing decision and are mostly discarded on the way out.** Verified in code
before this branch:

| Area | What the code did |
|---|---|
| Traffic | `stadiaMapsRouter.js classifyRoadSegments` classified arterials by a street-name regex (`Hwy\|Blvd\|Parkway`) plus Valhalla's `highway` boolean. Its Overpass ground-truth tier was never passed by any caller; `route.arterialAudit` was scored but set nowhere. `directions.js calculateTrafficScore` derived a traffic score from the rider's own tolerance setting. |
| Bike lanes | `bikeInfrastructureService.js` did a real 6-tier Overpass query but only fed the map overlay. `scoreRouteInfrastructure` (real Overpass overlap scoring in `stadiaMapsRouter.js`) was exported and imported by nothing; `route.infrastructureScore` was read in the candidate ranker and never set. `infrastructureValidator.js` scored bike infrastructure from keywords in the route *name*. |
| Shoulders, speed, lanes | No `shoulder`, `maxspeed` or `lanes` handling anywhere in `src/` or `api/`. |
| Gravel | `surfaceOverlay.js` queried only ways already tagged `surface=*`, had no snap-distance cutoff (an untagged road inherited the nearest tagged way's surface however far away), weighted the distribution by segment *count* not distance, hit one Overpass server with no fallback, and `SurfaceLayer`'s memo key (`length\|first\|last`) skipped refetches on same-length reshapes. `tracktype`, `smoothness`, `highway=track` were ignored. `mixed` in the Build form collapsed to `gravel`. |
| BRouter tags | BRouter already returns per-segment OSM tags (`properties.messages` WayTags: `highway=`, `surface=`, `cycleway=`, `maxspeed=` …). `ferryGuard.js` parsed them only for `route=ferry`. |
| Rider knowledge | `GravelRide` activities produced one number (`gravel_speed`). `user_road_segments.surface_type` was populated only for named roads via Mapbox Tilequery and read by nothing. FIT/GPX/COROS/Wahoo imports never ran segment extraction. |
| Preferences → router | BRouter got zero preference signal (profile name only). Manual drag/snap sent only `profile` and mapped road/commuting to `'bike'`, which is not a `ROUTE_PROFILE_COSTING` key, so Valhalla silently used road costing and the commuting costing was unreachable from manual edits. Traffic/safety preference tables read by `enhancedContext.js` exist only in `OLD/`; v1 knobs write to localStorage; RB2 exposes no traffic/lane control. |
| GraphHopper | The `road_class` / `bike_network` / `max_speed` custom models in `graphHopper.js` were unreachable (only the gravel model is ever sent) and need a paid plan. |

Strategy fit (see `route-builder-2-roadmap.md`): coach-differentiated, good-enough
table stakes, community heatmap is a non-goal. Everything below stays inside
that. Cross-user *surface* knowledge (C14) is an anonymous per-way tally, not a
popularity heatmap.

Tags: **[quick]** days, no new infra · **[medium]** about a week, a new table or
module · **[big]** new infra or an external dependency.

---

## Track A — stop throwing away road attributes we already get

1. **Parse BRouter WayTags into tagged ways** [quick] — **shipped (Phase 1)**.
   `src/utils/wayTags.ts` turns `properties.messages` into `TaggedWay[]`
   (`{ id, geometry, tags }`), attached to BRouter results as `taggedWays`.
   `surfaceOverlay.fetchRouteSurfaceData` and `measureGravelPct` accept those
   ways and skip Overpass when they cover the geometry. Every BRouter-routed
   gravel loop now measures its surface for free.
2. **Read the Valhalla maneuver fields we skip** [quick]. `extractManeuverData`
   keeps `highway` / `road_class`; also read `rough` (unpaved) and `toll` where
   present. Requesting `alternates` for D17 — done (Phase 2b), two-location
   requests only per Stadia.
3. **Fix the costing plumbing** [quick] — **shipped (Phase 1)**: `'bike'` profile
   mapping in manual snap and generation; manual snap now reaches the
   `commuting` costing. Phase 2 closed the rest: manual snap now sends the
   rider's traffic tolerance, and BRouter maps `low` tolerance to its
   `safety` profile until B7 gives per-tag control. Training goal is still
   not sent on manual snap.
4. **Wire the real `scoreRouteInfrastructure`** [quick] — **shipped (Phase 1)**.
   Candidates are scored by Overpass bike-infra overlap (protected cycleway
   1.0 → sharrow 0.2); the keyword heuristic `infrastructureValidator.js` is
   deleted. A `required` infra preference drops candidates scoring < 0.5
   (never all of them).

## Track B — make the router itself prefer bike lanes, shoulders, quiet roads

5. **Level of Traffic Stress (LTS) per segment from OSM tags** [medium] — *the
   keystone* — **shipped (Phase 2)**. `src/utils/trafficStress.ts` (rule
   ladder below), `src/utils/roadAttributes.ts` (corridor fetch, three
   tiers: BRouter `taggedWays` from the route's own build, handed in or
   remembered by geometry in `wayTags.ts`; else a **BRouter re-ride** of
   the line through sampled via points, `brouterTrace.ts`, ~0.5 s for a
   45 km loop and works for Stadia-built, imported and loaded routes; else
   a cached Overpass query via `overpassClient.ts` built as a union of
   per-chunk bounding boxes. Overpass is last for a reason: the public
   mirrors reject `way(around:…)` polyline corridors outright, 406 on
   overpass-api.de, and answered even the bbox form for a 110 km route
   with 504s and 30 s timeouts, which is why the first two releases never
   coloured anything. Stadia's `trace_attributes` would be the cleanest
   source of all, per-edge road class / speed limit / lanes / cycle lane
   from the router we pay for, but map matching is gated behind a higher
   Stadia plan on this account, see `getStadiaCuesForGeometry`), a
   **Traffic Stress** map layer + legend
   (`TrafficStressLayer`, `TrafficStressLegend`) and a "Quiet roads NN%" line
   in the stats card. Follow-up (same branch): stress is now measured for
   **every** route by `useRouteStress` (debounced, cached) and surfaced on
   the main view as a fourth **QUIET ROADS** stat in the route card (click
   colours the map) and a **TRAFFIC** chip in the edit toolbar, so it no
   longer hides behind the Layers panel. Stress is a 0.15-weight term in the chat candidate
   ranking (`naturalLanguageRouteCandidates`) and replaces the regex-derived
   `trafficScore` in `aiRouteGenerator.getTrafficAvoidanceScore`. Original
   proposal: Published methodology (Mekuria / Furth / Nixon; used by
   PeopleForBikes and many DOTs). Inputs are tags we can get from Overpass or
   BRouter WayTags: `highway`, `maxspeed`, `lanes`, `cycleway*`, `shoulder`,
   `shoulder:width`, `parking:*`. Output LTS 1–4 per segment (1 = child-safe,
   4 = only the fearless) and per route `{ kmByLts, worstKm,
   maxContinuousLts4Km }`. Pure `ltsForTags(tags)` in
   `src/utils/trafficStress.ts`, unit-testable from tag fixtures. Replaces the
   three guesses above with one defensible number and feeds B6, B7, B9, D17.
   Corridor tags come from one Overpass query (all `way["highway"]`, not just
   tagged ones) served by `api/route-attributes.js` with a bbox-tile cache, or
   for free from `taggedWays` when BRouter routed.
6. **Iterative repair with Valhalla `exclude_polygons`** [medium]. Route → LTS →
   buffer the worst stretches above the rider's tolerance (~15 m) → reroute,
   at most 3 passes. The same mechanism powers per-rider "never route me here"
   (D20).
7. **Self-hosted BRouter with Tribos profiles** [big, **chosen direction**].
   Vercel can't run it; deploy the `abrensch/brouter` container (Fly.io,
   Railway or a small VPS) with the `.rd5` segment tiles for served regions.
   `VITE_BROUTER_URL` points at it; `brouter.de` stays as the fallback.
   Profiles live in the repo (`routing-profiles/tribos-road.brf`,
   `tribos-gravel.brf`, `tribos-quiet.brf`) and are copied into the container's
   `profiles2/`. BRouter profiles read every OSM way tag, so the cost model can
   say things Valhalla's knobs cannot: `maxspeed ≥ 80 & no cycleway & no
   shoulder → ×6`, `cycleway=track ×0.6`, `shoulder=yes ×0.8`, `lanes ≥ 4 ×3`,
   `tracktype=grade3..5` gravel bonus, `smoothness=bad` gravel bonus, `lit`
   bonus for dawn rides. Rider preferences (tolerance, gravel target) map to
   profile variables. Verify CORS on the container for browser calls, or proxy
   through `api/`. Once stable, BRouter becomes primary for *road* too, not
   just gravel, and `taggedWays` (A1) gives LTS for free on every route.
8. **Confirm what Valhalla already knows** [quick]. Its bicycle costing uses
   `cyclelane` / `shoulder` edge attributes internally, so `use_roads` low
   already prefers them. Test whether Stadia's plan allows `filters` on
   `/route` shape (the 403 is on `/trace_attributes`), and `bicycle_type:
   cross` vs `hybrid` for low-tolerance road. Document; don't build on it until
   confirmed.
9. **Time-of-day traffic tolerance** [quick, after 5]. A four-lane arterial at
   6:30 on a Sunday is fine; at 5 pm Tuesday it isn't. The coach knows the
   session slot; shift the LTS cap by ride time. Coach-differentiated and free
   once LTS exists.
10. **Persist safety preferences** [medium] — **shipped (Phase 2)** as
    "Road comfort": migration 125 adds `traffic_tolerance` and
    `bike_infra_preference` to `user_road_preferences`; `useRoadComfort`
    mirrors it into the route-builder store; the Build form (`FormPanel`,
    `GenerateBar`) and the Settings card expose Quiet / Balanced / Direct;
    the value reaches Valhalla costing, the BRouter profile choice
    (`low → safety`), manual drag-snap, chat generation and the gravel
    builder. Manual snap now sends preferences (closing A3's remaining gap).
    Original proposal: Migration `user_routing_preferences`
    (`traffic_tolerance`, `bike_infra_preference`, `shoulder_required`,
    `max_lts`, `gravel_target_pct`, `avoided_way_ids[]`), one "Road comfort"
    control in RB2's Build tab, feeding Valhalla `use_roads`, BRouter profile
    params and the LTS threshold. Also lets manual snap use the same costing as
    generation (A3's remaining half).

## Track C — smarter gravel determination

11. **Fix the surface classifier's geometry and weighting** [quick] — **shipped
    (Phase 1)**: distance-weighted distribution, 25 m snap radius (else
    `unknown`), three Overpass servers with fallback, geometry-hash memo key in
    `SurfaceLayer`. Still open: bearing-match the route segment to the way
    (±20°, as `mapboxRoadLookup.js` does) so a parallel path and its road don't
    cross-contaminate.
12. **Infer surface when `surface=*` is missing, with confidence** [medium] —
    **shipped (Phase 4a)** as `src/utils/surfaceInference.ts` (`inferSurface`,
    `summarizeSurface`) over the corridor ways from `roadAttributes.ts`
    (`analyzeRouteSurface` / `measureRouteSurface`, sharing the stress
    fetch and its cache, de-duplicated in flight). The Surface overlay,
    summary bar, stats card, ETA and candidate `measureGravelPct` all read
    it via the always-on `useRouteSurface` hook; the surface-tag-only
    Overpass bbox query is no longer used by RB2 (kept for the classic v1
    builder). The ladder as implemented:

    | Evidence | Result | Confidence |
    |---|---|---|
    | `surface=*` | tag | 0.95 |
    | `tracktype=grade1` | paved | 0.7 |
    | `tracktype=grade2..5` | gravel/unpaved | 0.8 |
    | `smoothness=bad\|very_bad\|horrible` | unpaved | 0.7 |
    | untagged `highway=track` | unpaved | 0.6 |
    | untagged `highway=path\|bridleway` | unpaved | 0.5 |
    | untagged `highway=motorway..tertiary` | paved | 0.85 |
    | untagged rural `residential\|unclassified`, `tiger:reviewed=no` | **unknown** | never guess: this is exactly the GraphHopper `TERTIARY && surface==MISSING ×3` mistake |

    Report the unknown share honestly in `SurfaceSummaryBar` — done, as the
    `tagged · inferred · unmapped` line. Still open: Mapbox Tilequery
    `surface` (already used by `mapboxRoadLookup.js`) as a secondary source,
    and `smoothness`, which BRouter's tag rows do not carry (the ladder
    handles it when Overpass is the source).
13. **Learn surface from the rider's own rides** [medium]. In
    `roadSegmentExtractor.js`: `GravelRide`, a gravel/mtb bike, or
    `surface_override` → `surface_observed='unpaved'` with source and count; a
    road-bike `Ride` → paved evidence. Two rides on a gravel bike over an
    untagged county road beats any tag heuristic. Also run extraction for
    FIT/GPX/COROS/Wahoo imports (the two biggest polyline sources per
    `unit-planning-brief.md`).
14. **Community surface tally** [big, later]. `road_surface_observations
    (osm_way_id, unpaved_votes, paved_votes, last_seen)`: anonymous per-way
    counts, no geometry, no identity. Highest-confidence tier after explicit
    tags; extra candidate ways for `gravelRouteBuilder.findGravelWays`. A moat
    Strava/Komoot lack: measured surface on roads OSM has never tagged.
15. **Make "mixed" real and close the loop** [medium] — **half shipped (Phase
    4b.1)**. What shipped, prompted by "Lets do a 40 mile gravel loop" from
    Erie coming back 56 mi at ~5% gravel: the gravel-network path
    (`gravelRouteBuilder.ts`) no longer needs a direction — with none it
    searches the full circle and heads for the headings with the most gravel
    (`bestGravelHeadings`); `findGravelWays` goes through the shared
    three-mirror `overpassClient` and counts inferred gravel too (C12's
    `tracktype=grade2..5`, untagged `highway=track`, confidence carried and
    preferred lower than tagged), and when Overpass is slow or down BRouter
    itself finds the gravel: gravel-profile spokes out from the start whose
    tag rows say what unpaved roads they rode (`probeGravelWaysWithBRouter`,
    started 3 s after Overpass, first non-empty wins); thin gravel no longer
    shrinks the loop, `padLoopWaypoints` adds apexes at the loop radius;
    wrong-sized gravel loops are pitted against the Claude-town plans rather
    than returned alone; one correction pass when the measured share
    misses the target by more than 15 points (budget raised by the miss,
    better-scoring set wins); a gravel floor in the ranking (a candidate under
    a third of the target loses to any that does better); and the chat owns
    the miss (`gravel_shortfall`, `gravel_sparse`: "gravel is thin within
    13 km of your start; the most is northeast") instead of "want me to tweak
    it?". A plain "gravel loop" names no percentage and keeps a null target:
    riding paved miles to the gravel and using connectors is normal, so the
    builder aims for 50% but the result is only "short" under 20%, and the
    reply never quotes a number the rider did not say; an explicit "N%
    gravel" is short below N − 15. Still open: the `gravelTargetPct` slider in the Build form and
    persisting `gravel_actual_pct` / `surface_mix` on save (declared in
    `hooks/route-builder/types.ts`, written nowhere).
16. **"Why is this gravel?" provenance tooltip** [quick, after 12] — **shipped
    (Phase 4a)**: inferred stretches are drawn dashed on the map, the summary
    bar shows `tagged 61% · inferred 27% · unmapped 12%`, and each legend
    swatch's tooltip lists the deciding tags with distance (`surface=gravel
    8.1 km · tracktype=grade3 2.4 km`). "You rode this on your gravel bike
    4×" waits on C13. Trust is the P0 theme of `route-builder-review-2026-07.md`.

## Track D — corridor intelligence and re-ranking

17. **Re-rank alternates by composite quality** [quick, after 5 and 11] —
    **shipped (Phase 2 + 2b)**. Phase 2: the 3-candidate chat ranking and
    the legacy candidate ranker include measured stress. Phase 2b
    (`src/utils/routeAlternates.ts`, wired into `smartCyclingRouter` behind
    an opt-in `alternates` flag used by manual snap/drag and whole-route
    generation): the primary line is joined by Valhalla `alternates` (Stadia
    returns them only for two-location requests, so rarely for a snapped
    multi-waypoint route) and by BRouter whole-route lines (`trekking`, plus
    `safety` for a "Quiet" rider) whose tag rows make their stress free;
    every candidate is measured in parallel (4 s cap) and `pickCalmest`
    switches only for a clear win (≥ 0.3 km or 20% less over-tolerance
    stress) inside a detour allowance (low 25%, medium 15%). The snap toast
    says when a quieter line was chosen; telemetry `alternates_considered`
    / `alternate_selected`. Not applied to gravel routes or per-leg callers.
    BRouter `alternativeidx` variants remain unused. Original proposal:
    Valhalla `alternates` plus BRouter `alternativeidx` 0–3; score `{ km at
    LTS ≥ 3, infra coverage, surface match to target, familiarity }` by rider
    weights. The cheapest "choose the best roads" and it gives before/after
    telemetry.
18. **Keep building on Claude's road picks** [medium]. `aiRouteGenerator.js`
    already geocodes `keyRoads` into via-points (Attempt 0). Extend: "avoid X"
    → `exclude_polygons`; let LTS audit what Claude proposes.
19. **`training_segments` obstruction data as a traffic signal** [medium].
    `stops_per_km`, `traffic_signal_count`, `obstruction_score` already exist
    from GPS behaviour; join by `osm_way_id` into LTS as a modifier for roads
    the rider (or community) has ridden.
20. **Per-rider avoid/prefer roads** [quick, after 6]. Click a segment →
    `avoided_way_ids`; `exclude_polygons` on Valhalla, `×0` in the BRouter
    profile.

## LTS rule ladder (as implemented in `trafficStress.ts`)

Speed is `maxspeed` (mph converted) or a per-class assumption (residential 40,
unclassified/tertiary 50, secondary 60, primary 70 km/h); lanes likewise
(residential 2, primary 4). Bands carry ~1 km/h slack so 25 / 30 / 40 mph land
where a planner expects.

| Situation | LTS |
|---|---|
| `cycleway`, `path`, `track`, `footway`, `pedestrian`, or `cycleway*=track/separate` | 1 |
| `motorway` | 4 |
| Bike lane / paved shoulder: ≤ 25 mph & ≤ 2 lanes → 1; ≤ 30 mph → 2; ≤ 40 mph → 3; else 4. Shoulder is at least 2; a sharrow is one worse than a lane; adjacent parking +1 | 1–4 |
| No facility: `living_street`/`service` or ≤ 30 km/h → 1; residential/unclassified ≤ 25 mph & ≤ 2 lanes → 2; ≤ 30 mph & ≤ 2 lanes → 3; `primary`/`trunk`, > 30 mph or ≥ 4 lanes → 4; parking +1 | 1–4 |
| No `highway` tag | 0 (unknown, excluded from the roll-up) |

Roll-up per route (`summarizeStress`): distance-weighted km per level,
`quietPct` (LTS 1–2 share of known km), `stressScore` (mean of (LTS−1)/3),
`lts4Km`, `maxContinuousLts4Km`, `unknownPct`.

## Sequencing

1. **Phase 1** — shipped: A1, A3 (profile mapping), A4, C11.
2. **Phase 2** — shipped: B5 LTS + corridor attributes, the Traffic Stress
   layer, stress in ranking (D17-lite), B10 "Road comfort" preference.
   **Phase 2b** (next): Valhalla `alternates` + BRouter `alternativeidx`
   re-ranking.
3. **Phase 3** — the router obeys: B7 self-hosted BRouter + Tribos profiles, B6
   `exclude_polygons` repair, D20 avoid roads, B9 time-of-day.
4. **Phase 4a** — shipped: C12 surface inference with confidence + C16
   provenance, on the shared corridor fetch. **Phase 4b** — C13 (learn
   surface from the rider's rides), C15 (make "mixed" real); C14 only once
   C13 has data.
5. Decide separately later: D18, D19, B8.

## Verification approach (every phase)

Five golden start points (foothills gravel, arterial-heavy suburb,
cycleway-network city, rural county roads, coastal highway); snapshot
`{ kmByLts, gravelPct, infraCoverage }` per generation before and after each
phase so regressions show as numbers. Add a `route_builder_quality_scored`
PostHog event carrying the composite score and `provider_used`.

## Related docs

`route-builder-2-roadmap.md` (strategy), `route-builder-review-2026-07.md`
(P0–P3 backlog), `legacy-routing-notes.md` (costing merge rules; note its
RouterClient framing is historical, that subsystem was deleted in Epic 0).
