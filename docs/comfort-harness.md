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

The copy test (`comfortLevels.test.ts`) fails on "never", "always" or
"guaranteed" in any card string or heads-up reason.

### Decisions encoded (2026-11-02)

- **Unpaved roads are light traffic**: `highway=track` → 1, other unpaved roads → at most 2 (`unpavedMaxClass`).
- **Unknown speed is flagged, not blocked**: paved `unclassified`/`tertiary`/`secondary` with no `maxspeed` have `confidence: 'unknown'`. The validator counts them as within comfort only if `worstCaseCls` (55 mph, no shoulder) would be. Otherwise they're `unknown`: a heads-up, grey dashed, counted in `unknownPct`, and **not** counted toward the 0.5 mi / 10% limits.
- **Trace fidelity**: a segment no way matched within the 25 m snap radius is `unknown`, never within comfort.
- **Stretch merging**: within-comfort gaps under 50 m don't split a flagged stretch.

## Running the harness

```bash
npm run harness:comfort -- --engine stadia --baseline scripts/comfort-harness/results/stadia-<date>.json
```

The script bundles `scripts/comfort-harness/harness.ts` with esbuild (it ships with Vite) and runs it. It writes `results/<engine>-<date>.json` and a `.md` summary next to it. With `--baseline` it appends a diff.

| Option | Default | |
|---|---|---|
| `--engine` | `stadia` | `stadia` (today's primary router; needs `STADIA_API_KEY`), `brouter-stock` (today's BRouter fallback: safety/trekking/gravel), `brouter-tribos` (the Tribos profiles at tolerance 0/1/2) |
| `--points` | all 20 | comma-separated ids from `start-points.json` |
| `--distances` | 15,30,50,75 | miles |
| `--surfaces` | road,gravel | gravel is skipped at urban points unless `--include-urban-gravel` |
| `--levels` | 1–5 | |
| `--check-trace` | off | for engines that report their own tags, also classify through a BRouter re-ride and report agreement |
| `--delay-ms` | 400 | pause between requests. Use 1500 on brouter.de, which throttles (HTTP 403 "Please, retry later!") |
| `--resume <file>` | – | reuse every settled generation in a previous results file, redo the rest. The run checkpoints every 10 generations, so `--resume` with the same `--out` survives interruptions |
| `BROUTER_URL` env | brouter.de | point at the self-hosted server for big runs |

How a run works:

- **One generation per (point, distance, surface, engine request).** Levels that map to the same request share it: 1–2 → low, 3 → medium, 4–5 → high, the same mapping the landing form uses until the router takes 1–5. Each generation is validated at each of its levels.
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
