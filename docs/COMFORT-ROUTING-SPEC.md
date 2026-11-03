# Comfort Routing — Spec

**Status:** Approved direction, Nov 2026. Hand-off spec for implementation.
**Companion:** `docs/ROUTING-LANDING-SPEC.md` (front end).
**Design reference:** the "Comfort Routing Landing" design canvas (landing, result, phone result).

## Why

Tribos is going back to its roots as a route builder. The promise to riders:

> Routes on roads you'll actually want to ride. If a route has to use a road above your comfort, you see where and why before you ride it.

Trust is the product. A route that quietly puts a Comfort 2 rider on a 55 mph road with no shoulder breaks the product, not just the route.

**Copy rule:** no absolutes in anything user-facing — no "never", "always", "guaranteed". Use "avoided", "kept off", "flagged", "you'll see it before you ride it."

---

## 1. Road comfort classes

Every road segment gets a **comfort class 1–5**, or **X** (closed to bikes). This replaces the 4-level LTS as the routing contract. LTS stays as an input, not the output. The main change is that LTS 4 splits into *fast with a shoulder* (4) and *fast with no space* (5).

| Class | Plain-language description | Rules of thumb (starting values) |
|---|---|---|
| **1** | Paths and quiet streets | Separated paths/cycletracks; `living_street`, `service`; residential/unclassified ≤ 25 mph, ≤ 2 lanes |
| **2** | Quiet connectors, bike lanes | Two-lane ≤ 30 mph mixed traffic; bike lane on ≤ 35 mph |
| **3** | Busier roads with room for you | 35–40 mph with bike lane or paved shoulder; 30–35 mph two-lane mixed traffic; rural two-lane ≤ 45 mph with shoulder |
| **4** | Fast roads with a shoulder | 45–55 mph with paved shoulder; four-lane with bike lane; 35–40 mph mixed traffic, no facility |
| **5** | Fast roads with no space | ≥ 45 mph with no shoulder; ≥ 4 lanes, no facility; `primary`/`trunk` without facility; highway shoulders where bikes are legal |
| **X** | Closed to bikes | `bicycle=no`, `access=no`, motorways where bikes are prohibited |

Requirements:

- One pure function, `comfortClassForTags(tags, extras?) → { cls, confidence, reasons[] }`, in a new `src/utils/comfortClass.ts`, built on `src/utils/trafficStress.ts` (reuse `parseMaxspeedKph`, `bikeFacility`, lane parsing). `extras` is the hook for conflated data in §6 (AADT, shoulder width, verified speed).
- `confidence` is `tagged` (speed and lanes from data), `assumed` (class defaults), or `unknown`.
- `reasons[]` holds short plain strings ("40 mph", "bike lane", "no shoulder"). The heads-up cards are built from these, so they must read well to a rider.
- **Unknown speed is flagged, not blocked** (decided 2026-11-02; replaces the earlier "assume 55 mph" rule, which would have blocked most of the plains at the default Comfort 2):
  - **Unpaved roads are low traffic.** A way whose `surface` is unpaved (`gravel`, `fine_gravel`, `compacted`, `dirt`, `earth`, `ground`, `unpaved`, `grass`, …), or `highway=track`, is class ≤ 2 regardless of `maxspeed`: `track` → 1, any other unpaved road → 2. Confidence `assumed`, reason "gravel road, light traffic". The cap is one config value.
  - **Paved `unclassified` / `tertiary` / `secondary` with no `maxspeed`** get `confidence: 'unknown'`. They are classed from the existing class defaults for display, but they are **flagged rather than blocked**: they get a heads-up ("speed limit not mapped"), they are drawn grey dashed, and they count toward `unknown_pct`, not toward the §3 stretch or route limits and not toward "% within comfort".
  - `residential`, `living_street` and `service` with no `maxspeed` use the existing defaults with confidence `assumed`.
  - This needs no urban/rural detection. Phase 0A shows how many miles fall into `unknown`. If it's a lot, §6 data closes the gap. The policy isn't tightened by guessing.
- Thresholds live in one config object. They are starting values, and the harness (§5) tunes them.

## 2. Rider comfort levels

The rider picks **Comfort 1–5** on a slider. The default for new riders is **2 (Easy)**.

| Level | Label | Rides freely | Flagged (short stretches) | Kept off |
|---|---|---|---|---|
| 1 | Calm | class 1 | class 2–3 | class 4, 5, X |
| 2 | Easy | class ≤ 2 | class 3–4 | class 5, X |
| 3 | Steady | class ≤ 3 | class 4–5 | X |
| 4 | Confident | class ≤ 4 | class 5 | X |
| 5 | Direct | class ≤ 5 | — | X |

The slider card copy on the landing page (headline, roads like, flagged, kept off, trade-off) must come from the **same module** as these rules (`src/utils/comfortLevels.ts`), so the words and the router can't drift apart.

## 3. The rules

For a rider at level **L**, on a candidate route:

- **Free:** segments with class ≤ L.
- **Flagged:** segments with L < class ≤ L + 2. These are allowed only within both limits:
  - **Per stretch: ≤ 0.5 mi.** A stretch is a contiguous run of above-level segments. Adjacent L+1 and L+2 segments count as one stretch.
  - **Per route: ≤ 10% of total route distance**, summed across all flagged stretches.
- **Blocked:** class ≥ L + 3, or X. Blocked roads don't appear in a returned route, at any length.

*Assumption to confirm:* L+1 and L+2 stretches share the same limits. If an L+2 stretch should have a tighter cap (e.g. 0.25 mi), it's one config value.

## 4. The ladder: when the rules can't be met

Evaluate in order and stop at the first that applies:

1. **Warn and route.** The best route passes §3. Return it with one **heads-up** per flagged stretch: mile marker, length, the plain reasons, and the class relative to the rider ("one level above your comfort").
2. **Offer alternatives.** No route passes §3 at the requested parameters. Don't return a failing route. Return up to 3 alternatives, each of which **itself passes §3** at the level it's shown for:
   - the same distance with a different loop shape or direction;
   - a different distance (nearest of ±25%);
   - "Ride this one at Comfort L+1," which shows exactly what changes (miles and stretches that become flagged).
3. **Refuse.** Nothing passes. Say plainly that there's no route at this comfort from this start. Suggest a nearby start point (search a small radius for the nearest start where step 1 succeeds) and/or a shorter loop.

The response carries `outcome: 'ok' | 'alternatives' | 'refused'` so the front end and analytics can tell them apart.

## 5. How it's built

**Two layers: BRouter optimizes, the validator decides.**

**Prerequisite — the engine.** Per CLAUDE.md, BRouter is not yet the primary road router: the Tribos profiles are gated by `VITE_BROUTER_TRIBOS_PROFILES` (default off), and making BRouter primary is the separate Phase 3c cutover (`VITE_BROUTER_PRIMARY_ROAD`) after a week of green `brouter-health-monitor` checks. Comfort routing depends on both. Order of work:

- The validator (item 2) and harness (Phase 0) are **engine-agnostic**. They classify whatever route comes back, using `brouterTrace.ts` (`tribos: false`) to read tags along a non-BRouter line. Build them first. They measure today's Stadia/Valhalla routes as the baseline.
- The profile work (item 1) and the Phase 3c cutover follow, and the harness shows whether BRouter with the new profiles beats the baseline. Validate every profile change with `node scripts/validate-brouter-profiles.mjs`.

1. **Profiles (optimizer).** Extend `traffic_tolerance` in `routing-profiles/tribos-road.brf` and `tribos-gravel.brf` from 0/1/2 to **1–5**. Mirror the class ladder in the profile. Within-level classes are cheap, flagged classes get a strong penalty, and blocked classes get a prohibitive cost. Because the validator is authoritative, the profile only needs to steer well, not be perfect.
2. **Validator (authority).** A new pure module, `src/utils/comfortValidator.ts`. It takes the route geometry plus per-segment way tags (BRouter `taggedWays`/messages export, already used by `roadAttributes.ts`) and returns the class per segment, the flagged stretches, totals, pass/fail against §3, and the heads-up list. It must run in the browser and in Node (for the harness).
   - **Trace fidelity.** When tags come from a `brouterTrace` re-route of a non-BRouter line (≤ 40 vias, ≥ 500 m apart), BRouter can pick a parallel road between vias. The validator measures how far the traced line strays from the original. Any part beyond `CORRIDOR_M` (40 m, `roadAttributes.ts`) counts as `unknown`, never as within comfort.
   - **Stretch merging.** A within-comfort gap shorter than 50 m (config) doesn't end a flagged stretch, so a driveway or crossing can't split one stretch into two and get around the 0.5 mi cap.
3. **Ladder.** A `planComfortRoute(request)` orchestrator calls BRouter, validates, then generates and validates alternatives as needed. It returns the §4 outcome.
4. **Preferences.** `user_road_preferences.traffic_tolerance` is currently `low | medium | high` (migration 125, `CHECK` + `DEFAULT 'medium'`). Don't change its type: migrations are applied by hand, so an in-place change leaves a window where deployed code and the database disagree. **Add `comfort_level smallint` (1–5)**, backfill low→2, medium→3, high→4, and dual-write both columns. Read `comfort_level ?? fromTolerance(traffic_tolerance)`. Existing riders keep their mapped level (default `medium` → 3); only new riders default to 2. Update `routeBuilderStore`, `RoadPreferencesCard`, `FloatingRouteSettings`, `PreferenceSettings`, and `api/road-segments.js` validation.
5. **Stat.** Replace "quiet %" on results with **"% within your comfort"** (distance at class ≤ L ÷ total). Report unknown-confidence distance separately; don't count it as within comfort.

### Phase 0 — measure first (do this before the profile changes)

**A. OSM tag coverage audit.** For the Front Range test bbox, by `highway` class, report the share of miles with `maxspeed`, `lanes`, `cycleway*`, `shoulder*`, and `surface`. Output a table into `docs/audit/osm-coverage-<date>.md`. This decides which data sources in §6 matter.

**B. Test harness** (`scripts/comfort-harness/`, Node):

- **Call budget.** The ladder caps BRouter calls per request (config; starting at 12 for alternatives plus nearby-start search) and skips the nearby-start search while the brouter.de fallback is serving.
- Fixed matrix: **20 start points** in `scripts/comfort-harness/start-points.json` (urban, suburban, rural plains, foothills, gravel-heavy; proposed 2026-11-02, Travis to confirm) × distances **15/30/50/75 mi** × levels **1–5** × surface **road/gravel**.
- Per run, record: outcome, % within comfort, flagged miles, flagged stretch count, longest stretch, unknown-confidence %, and any blocked-class leak (should be 0).
- Output a JSON results file plus a markdown summary. Commit a baseline. Every later profile or data change re-runs it and diffs against the baseline.
- Run Phase 0B against the **current** router first, so we know how often today's routing breaks the promise.

### Acceptance

- Zero blocked-class segments in any returned route across the full harness matrix.
- Every returned route satisfies the 0.5 mi / 10% limits.
- Every flagged stretch has a heads-up with mile marker and plain reasons.
- Every alternative passes §3 at its stated level.
- The harness re-runs in one command and diffs against baseline.

## 6. Data: closing the gaps (Phase 2, after Phase 0)

The weak link is local roads, especially fast county roads with no `maxspeed` in OSM. State data covers state highways well, and those are already the roads riders get kept off.

| Gap | Sources | Notes |
|---|---|---|
| Speed limits | CDOT OTIS speed datasets (state system); county/city GIS layers | Local roads are county-by-county |
| Traffic volume | CDOT OTIS on-system AADT; off-system counts (request via OTIS contact form); county count layers | AADT is a strong comfort signal on two-lanes |
| Lanes, shoulders | CDOT OTIS cross-section (lane, shoulder widths) | State highways only |
| National baseline | FHWA HPMS shapefiles (AADT, speed limit, through lanes) | Scales beyond Colorado; local roads thin |
| Bike facilities | OSM; CDOT bike map service; DRCOG regional data catalog; city bike maps | Patchy upkeep |
| Ground truth | Rider ride history; "felt sketchy" reports | Phase 3 |

Approach:

- **Conflate, don't replace.** Match external linework to OSM ways and store per-way overrides in PostGIS: `road_comfort_overrides(osm_way_id, maxspeed_mph, aadt, shoulder_ft, lanes, source, source_date, confidence)`. Check each source's license before ingesting.
- The validator reads overrides through the `extras` hook in `comfortClassForTags`.
- **BRouter can't see overrides** while it uses upstream `.rd5` tiles (see `docs/brouter-self-host-runbook.md`). The option to evaluate after Phase 0: build Colorado segments from an OSM PBF with override tags injected (osmium) before BRouter's segment build. Until then, the validator plus alternatives covers the gap, since a route that fails on override data gets rerouted.
- **Phase 3, ground truth:** a one-tap "this road felt sketchy" on the ride/route view writes to `road_comfort_reports`. Roads that riders at a level repeatedly ride without reports can raise confidence for that class.

## Out of scope

- Coaching, training metrics, the AI route coach (it keeps working in `planAware: false` mode).
- Naming/rebrand.
- Indoor, segments, gear.
