# Comfort harness and Phase 0 modules

Phase 0 of `docs/COMFORT-ROUTING-SPEC.md`: measure how often routing breaks
the comfort promise before changing any profile, preference or UI. Nothing
here is wired into the app yet.

## Modules (`src/utils/`, pure, browser + Node)

| File | What it does |
|---|---|
| `comfortLevels.ts` | Comfort 1–5: the §3 rules (`COMFORT_RULES`), class descriptions, level labels, and the landing card copy, derived from the rules. Also the `traffic_tolerance` ↔ level mappings. |
| `comfortClass.ts` | `comfortClassForTags(tags, extras?)` → `{ cls 1–5 \| X, confidence, reasons[], worstCaseCls }`. Thresholds in `COMFORT_CLASS_CONFIG`. Built on `trafficStress.ts`. |
| `comfortValidator.ts` | `validateComfortRoute(coords, ways, { level })`: per-segment status and tone, flagged/blocked/unknown stretches, totals, pass/fail, heads-ups. `toneRuns()` feeds the comfort strip and map line. |
| `loopWaypoints.ts` | Deterministic loop waypoints for a start + distance (no AI). Harness today; landing form next. |
| `comfortLadder.ts` | `planComfortRoute(request, { route, budget, allowNearbyStart, isFatal })`: the §4 ladder. Returns `outcome: 'ok' \| 'alternatives' \| 'refused'`, with every returned route validated at the level it's shown for. The engine is injected. |

The copy test (`comfortLevels.test.ts`) fails on "never", "always" or
"guaranteed" in any card string or heads-up reason.

### Decisions encoded (2026-11-02)

- **Unpaved roads are light traffic**: `highway=track` → 1, other unpaved roads → at most 2 (`unpavedMaxClass`).
- **Unknown speed is flagged, not blocked**: paved `unclassified`/`tertiary`/`secondary` with no `maxspeed` have `confidence: 'unknown'`. The validator counts them as within comfort only if `worstCaseCls` (55 mph, no shoulder) would be. Otherwise they're `unknown`: a heads-up, grey dashed, counted in `unknownPct`, and **not** counted toward the 0.5 mi / 10% limits.
- **Trace fidelity**: a segment no way matched within the 25 m snap radius is `unknown`, never within comfort.
- **Stretch merging**: within-comfort gaps under 50 m don't split a flagged stretch.

## The ladder (`comfortLadder.ts`)

Evaluated in order, within a budget of 12 route calls (`LADDER_CONFIG`):

1. **The request.** Up to 2 calls, rescaling the loop toward the target. If it passes at L and lands within ±15% of the distance, the outcome is `ok`. Heads-ups come from the validator.
2. **Alternatives.** Each one passes at the level it's shown for. At most 3, one of each kind:
   - `shape`: the same distance, reversed, then rotated 180°, 90° and 270°. Stops at the first that passes.
   - `distance`: −25% first, then +25%. A request that passes but missed the distance is offered as this kind as is.
   - `comfort_up`: "ride it at Comfort L+1". This first re-validates lines already routed at L+1, which costs no call. Only if none passes does it spend one call steering for L+1. The note says what that adds, e.g. "At Comfort 3: adds 0.4 mi of 45 mph, no shoulder".
3. **Refused.** `refusalMessage(L)`, plus whichever of these passes:
   - a nearby start: 4 points on rings at 3 km and 6 km, skipped when `allowNearbyStart` is false, as it should be while brouter.de is serving;
   - a loop at half the distance.

   `tryLevel` is L+1 for the "try Comfort 3" link.

A failed call (target island, watchdog) counts as no route there, and the ladder carries on. If every call fails, it throws, because that's an engine problem, not a refusal. `isFatal` errors (throttling) abort at once. `meetsAcceptance()` re-checks the §5 criteria on any returned route. The harness's `--ladder` mode counts violations, and the target is 0.

## Running the harness

```bash
npm run harness:comfort -- --engine stadia --baseline scripts/comfort-harness/results/stadia-<date>.json
```

The script bundles `scripts/comfort-harness/harness.ts` with esbuild (it ships with Vite) and runs it. It writes `results/<engine>-<date>.json` and a `.md` summary next to it. With `--baseline` it appends a diff.

| Option | Default | |
|---|---|---|
| `--engine` | `stadia` | `stadia` (today's primary router; needs `STADIA_API_KEY`), `brouter-stock` (today's BRouter fallback: safety/trekking/gravel), `brouter-tribos` (the Tribos profiles, one request per Comfort level 1–5) |
| `--points` | all 20 | comma-separated ids from `start-points.json` |
| `--distances` | 15,30,50,75 | miles |
| `--surfaces` | road,gravel | gravel is skipped at urban points unless `--include-urban-gravel` |
| `--levels` | 1–5 | |
| `--check-trace` | off | for engines that report their own tags, also classify through a BRouter re-ride and report agreement |
| `--delay-ms` | 400 | pause between requests. Use 1500 on brouter.de, which throttles (HTTP 403 "Please, retry later!") |
| `--resume <file>` | – | reuse every settled generation in a previous results file, redo the rest. The run checkpoints every 10 generations, so `--resume` with the same `--out` survives interruptions |
| `--ladder` | off | run `planComfortRoute` per point × distance × surface × level instead of one-shot routes; writes `<engine>-ladder-<date>.json/.md` |
| `--no-nearby-start` | – | ladder mode: skip the nearby-start search |
| `BROUTER_URL` env | brouter.de | point at the self-hosted server for big runs |
| `COMFORT_PROFILE_PARAMS` env | – | JSON of profile parameters to override for a tuning run, e.g. `{"comfort_penalty_one":4}` |

How a run works:

- **One generation per (point, distance, surface, engine request).** Levels that map to the same request share it. For `stadia` and `brouter-stock` that's 1–2 → low, 3 → medium, 4–5 → high. `brouter-tribos` takes `comfort_level` 1–5 directly, so each level gets its own route. Each generation is validated at each of its levels.
- **Loop**: `loopWaypoints` with a bearing hashed from the point and distance. Up to 3 attempts, rescaling toward ±10% of the target distance.
- **Tags**: `brouter-tribos` routes carry their own. For the other engines the line is re-ridden with BRouter (Tribos road profile at "direct", vias every 750 m, 40 per request) and the ways are matched back onto the original line.
- **Throttling and network errors** back off (15 s → 2 min) and, if they persist, are recorded as `error`, not `no_route`. They're excluded from the stats and retried by `--resume`.
- **"Pass"** means the route meets §3 at that level. There's no ladder yet, so a fail is a route today's routing would hand the rider despite breaking the promise.

## Things the harness found in BRouter data

- **BRouter reports only the tags its profile reads.** The stock profiles (trekking, safety, gravel) don't read `maxspeed`, `lanes` or `shoulder`, so routes built with them, and `brouterTrace.ts` re-rides (which force `trekking`), carry no speed data. **The LTS overlay in production is affected**: on any route whose tags came from a stock-profile BRouter run, `trafficStress` falls back to class-default speeds. The harness reads tags with the Tribos road profile plus a probe (`withTagProbe` in `engines.ts`) that references `shoulder:right` and friends.
- **maxspeed is bucketed** (BRouter `lookups.dat`): the 60 bucket holds both 35 and 40 mph, so BRouter-sourced 35 mph roads read as 40 (one class cautious). 50 is 30 mph, 70 is 45, 100 is 60–65.
- **`cycleway=yes` / `cycleway=shoulder`** are how US shoulders are often tagged; `trafficStress.bikeFacility` ignores both. `comfortClass` reads them as a shoulder.
- **`estimated_traffic_class`** (BRouter's own 1–7 traffic estimate) is present on most paved roads even where `maxspeed` isn't. It's a candidate signal for the unknown-speed roads; the coverage table reports it.

## OSM coverage audit (Phase 0A)

```bash
npm run audit:osm-coverage
```

One Overpass query sums way lengths per highway class and tag server-side (`make stat … sum(length())`) for the Front Range bounding box, and writes `docs/audit/osm-coverage-<date>.md`. `--dry-run` prints the query, `--endpoint` picks a mirror. The harness summary has the same columns for ridden miles.

## Phase 0 results (2026-11-02, brouter.de)

Run from a cloud session that could reach only brouter.de: no Stadia key, and
Overpass, Geofabrik and the self-hosted BRouter were blocked. So **the Stadia
baseline (today's primary router) and the OSM coverage audit are not yet
run.** Both are one command each from a machine that has the key and network
(see above). Results are in `scripts/comfort-harness/results/`.

| Run | Loops | Checks | Pass | Has blocked road | Median within % (C2) |
|---|---:|---:|---:|---:|---:|
| `brouter-tribos` (Tribos profiles, full matrix) | 432 | 720 | 30% | 45% | 59% |
| `brouter-stock` (today's BRouter fallback; road, 30/50 mi) | 80 | 200 | 28% | 47% | 59% |

These are loops with **no ladder**: one route per request, handed back
whatever it holds. Comfort 2 (the default) passes **9%** of the time with
the Tribos profiles and 5% with the stock ones, and 85–93% of those routes
include a blocked road. Most failures are stretches over 0.5 mi (402) and
blocked classes (320), then >10% flagged (251). That gap is what the ladder
and the profile work (§5 items 1 and 3) have to close.

What the runs turned up:

1. **Both profile families route on `bicycle=no`.** The Tribos profiles keep
   BRouter trekking's `accesspenalty` (bike access no, but foot access → ×4,
   "walk your bike"). That's why 15–16% of routes at Comfort 5 still contain
   class X: about 16 km of `bicycle=no` trail on one Nederland loop, and
   `bicycle=no` primary (US-6 Clear Creek Canyon) on Golden loops. The
   validator blocks them correctly. **Fix in the profile work: make
   `bicycle=no` prohibitive (10000) in `tribos-road.brf` / `tribos-gravel.brf`,
   and validate with `node scripts/validate-brouter-profiles.mjs`.** The
   stock fallback has the same behaviour today.
2. **Unknown speed is about a quarter of the ride** (median 23–28% at Comfort
   1–4). On ridden miles only 31% of `tertiary`, 54% of `secondary` and 11% of
   `unclassified` carry `maxspeed`. BRouter's `estimated_traffic_class` is on
   97–100% of tertiary/secondary miles, which makes it the cheapest way to
   resolve unknowns before §6 data. Worth testing as an `extras` input.
3. **Shoulders are invisible:** 0–1% of ridden miles carry any `shoulder*`
   tag, so classes 3 and 4 can't be told from 5 on fast roads in OSM. CDOT
   cross-section data (§6) is the only route to that.
4. **Trace fidelity is good where it matches:** 97–100% class agreement on
   20 routes. But the re-ride leaves a median 5% unconfirmed, and up to
   58% / 39% / 27% at Bennett, Kiowa and Wellington, where the road profile
   detours around the gravel the original line used. That errs toward
   `unknown` (the safe direction), but a Stadia baseline will overstate
   unknown in gravel country. Next step: re-ride with the gravel template
   there.
5. **Lyons 15 mi has no loop at all** ("target island": the waypoints land
   in terrain BRouter can't reach). The ladder's nearby-start search
   covers this case.

## Profile work 1: closed roads and Comfort 1–5 (2026-11-02)

Changes in `tribos-road.brf` / `tribos-gravel.brf`: `bicycle=no|private|use_sidepath`
is prohibitive (10000). The 0/1/2 `traffic_tolerance` became `comfort_level` 1–5,
with a per-way comfort class in the profile and an added cost of
`comfort_penalty_one/two/blocked` for roads 1, 2 and 3+ classes above the
rider. The penalties were tuned on the 30 mi slice (180 loops each):

| Penalties | C1 | C2 | C3 | C4 | Blocked leaks | Distance error | No route |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2 / 6 / 40 | 11% | 33% | 50% | 44% | 48 | 5.7% | 0 |
| **4 / 12 / 200 (adopted)** | 24% | 37% | 56% | 58% | 41 | 7.3% | 3 |

Full matrix with the adopted values
(`results/brouter-tribos-c15-2026-11-02.*`), compared with the Phase 0 baseline:

| Level | Pass before → after | Has blocked road before → after |
|---|---:|---:|
| Comfort 1 | 1% → 25% | 92% → 57% |
| Comfort 2 (default) | 9% → 40% | 85% → 47% |
| Comfort 3 | 22% → 51% | 15% → 3% |
| Comfort 4 | 36% → 60% | 16% → 1% |
| Comfort 5 | 84% → 100% | 16% → 0% |

- Blocked-class leaks fell from 320 to 149. 179 checks now pass and 7 now fail, five of them failures and two no-route.
- Class X is gone from every level. Comfort 5 had been failing only because of `bicycle=no`.
- Costs: median distance error rose from about 6% to 8%, and 21 of 720 generations returned no route. Of those, 11 are "target island" (waypoints in unreachable terrain, mostly foothills), 8 are brouter.de's 1–2 s compute watchdog, and 2 are gateway timeouts. The watchdog is a public-server limit; the self-hosted server can allow longer.
- What's left at Comfort 1–2 is mostly 55 mph highways on the plains (Kiowa, Aurora, Platteville, Bennett) and foothill corridors where the map holds no quieter way through. A profile can't route around that. The ladder handles it: an alternative start or distance, or a refusal.
- These are still one-shot routes per level. The baseline shared one route across levels 1–2 and 4–5, so the per-level rows are like for like, but generation counts differ (432 → 720).
