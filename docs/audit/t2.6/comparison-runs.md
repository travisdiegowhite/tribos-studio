# Real-API Comparison Runs

**Status: not executed in this audit session.**

The audit was conducted in a sandboxed environment without provider
API keys (`VITE_STADIA_API_KEY`, `VITE_MAPBOX_TOKEN`) or working
Supabase credentials. The runner script is ready to execute; Travis
to run it locally or in a session with `.env` populated.

The code-review findings in `legacy-vs-new-extraction.md` and
`routecontext-schema-mismatches.md` stand on their own — the
comparison runs would corroborate them but are not the primary
evidence. The elevation bug, in particular, is provable by static
analysis (the new adapter reads a field name the legacy module never
emits).

## To execute

```bash
# Populate .env with VITE_STADIA_API_KEY, VITE_MAPBOX_TOKEN
npx tsx scripts/audit/t2.6/comparison-runner.ts
```

GeoJSON outputs land in `docs/audit/t2.6/geojson/`. Open each in
https://geojson.io for visual route inspection.

## Predicted outcomes (from static analysis)

For each test case, the prediction based on code review:

| Case | Profile | Predicted legacy elevation | Predicted new elevation | Reason |
|---|---|---|---|---|
| Erie short road loop | road | 0 m (Stadia primary; no enrichment in `smartCyclingRouter` itself either — `aiRouteGenerator` would enrich but the runner doesn't call it) | 0 m | both pipelines drop elevation at the same place when invoked directly without enrichment |
| Erie to Lyons (climbing) | road | 0 m (Stadia primary, no in-router enrichment) | 0 m | same |
| Boulder Front Range gravel | gravel | >100 m (BRouter primary, returns elevation in response) | >100 m | BRouter populates `properties['filtered ascend']` |
| Boulder flat commute | commute | 0 m | 0 m | Stadia primary |
| Nederland MTB | mtb | >50 m | >50 m | BRouter primary |
| Boulder to Estes Park | road | 0 m (Stadia) | 0 m | Stadia primary |

**Key prediction:** for the Stadia-primary cases (road, commute), both
pipelines should report 0 m elevation when called via these direct
entry points. This is *not* the production behavior end-users see —
production routes elevation in via the separate `getElevationData()`
enrichment in `aiRouteGenerator.js` (called by the legacy AI route
flow, NOT by `smartCyclingRouter` itself). The new pipeline lacks
that enrichment hook entirely.

**Production symptom verification:** to see the actual user-facing
elevation parity, the runner would need to be extended to invoke the
full `aiRouteGenerator.generateRoutes` path for the legacy side. That's
a substantial rewrite of the runner. For now, the static analysis is
the definitive evidence.

For distance and geometry parity, the runs should show:
- Distance within ~1 km between legacy and new (both call the same
  underlying providers).
- Geometry visually equivalent — both use the same coordinate lists.
- Latency similar within ~50%.

If the runs show **distance differs by >2 km** or **geometry visually
diverges**, that's a new finding not surfaced by code review and Phase B
should be triggered.

## Visual inspection checklist (when run executes)

For each GeoJSON in `docs/audit/t2.6/geojson/`:

1. Open in https://geojson.io.
2. Confirm both LineStrings overlay the same major roads / paths.
3. Look for obvious divergences: legacy through a residential
   neighborhood while new uses an arterial, or vice versa.
4. Verify both start and end at the same waypoints (small geometry
   point counts at the endpoints can cause visual artifacts).
5. Record anomalies inline in this file under "Findings from runs".

## Findings from runs

_(empty — runs not yet executed)_
