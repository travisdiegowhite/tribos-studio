# Legacy ↔ New Provider Extraction — Side-by-side

Phase A finding #1 lives here. The new providers wrap the legacy
modules but the extraction surface is slightly different, and one
field — elevation — is misnamed in the new adapter, producing the
known production symptom (`elevation_gain_m: 0` on every Stadia route).

References:
- Legacy notes: `docs/legacy-routing-notes.md` §2 (Stadia), §3 (BRouter), §4 (Mapbox).
- New adapter source: `src/routing/RouterClient/providers/{StadiaProvider,BRouterProvider,MapboxProvider}.ts`.
- Legacy module source: `src/utils/{stadiaMapsRouter,brouter,directions}.js`.
- Snapshot assembler: `src/routing/RouterClient/providers/shared.ts:123`.

---

## StadiaProvider (`solve` and `connect`)

| Field | Valhalla response location | Legacy `stadiaMapsRouter.js` return | New `StadiaProvider.ts` extracts |
|---|---|---|---|
| Total distance (m) | `sum(leg.summary.length) * 1000` | `distance_m` (line 386), alias `distance` | `result.distance_m ?? result.distance ?? 0` ✓ |
| Total duration (s) | `sum(leg.summary.time)` | `duration_s` (line 387), alias `duration` | `result.duration_s ?? result.duration ?? 0` ✓ |
| Geometry | `leg.shape` (encoded polyline-6) | `coordinates` (line 385), decoded canonical | `result.coordinates` ✓ |
| Elevation gain (m) | Available per-edge in `leg.elevation` arrays, **not extracted** | **never populated** — no `elevationGain` field in the return shape (lines 384–398) | `result.elevationGain ?? 0` → **always 0** |
| Elevation loss (m) | same | same — **never populated** | `result.elevationLoss ?? 0` → **always 0** |
| Maneuvers | `leg.maneuvers` | `maneuvers` object (line 393) | **dropped** at adapter |
| Traffic / quietness scores | derived from `roadClassification` | `trafficScore`, `quietnessScore` (lines 394–395) | **dropped** at adapter |
| Road classification | derived | `roadClassification` (line 396) | **dropped** at adapter |
| `source` / `confidence` | n/a (decorator on the wrapper) | `source: 'stadia_maps'`, `confidence: 1.0` | **dropped** at adapter |

### Smoking gun

`StadiaProvider.ts:163` (and the identical line at 233 in `connect`):

```ts
elevationGain_m: result.elevationGain ?? 0,
elevationLoss_m: result.elevationLoss ?? 0,
```

`stadiaMapsRouter.js:384–398`:

```js
return {
  coordinates, distance_m, duration_s,
  distance: distance_m,            // alias
  duration: duration_s,            // alias
  confidence: 1.0,
  source: 'stadia_maps',
  profile,
  maneuvers,                       // see extractManeuverData
  trafficScore, quietnessScore,
  roadClassification,
  raw: data
};
```

There is no `elevationGain` or `elevation.ascent` field in the Stadia
legacy response. The `?? 0` fallback is therefore the only branch that
ever fires for Stadia routes → `elevation_gain_m: 0` on every result.

### How the legacy pipeline actually populates elevation

The legacy `aiRouteGenerator.js` enriches Stadia/Mapbox routes with a
**separate** `fetchElevationProfile(coords, mapboxToken)` call (Mapbox
elevation) or `getElevationData(coords)` (OpenTopoData via `/api/elevation`)
after the router returns. Call sites:

- `src/utils/aiRouteGenerator.js:916, 1020, 1148, 1506, 1627, 1825, 1862, 1987, 2753, 2938` — every route-generation flow does this.
- `src/utils/aiRouteEditService.js:744, 772` — every AI edit re-runs elevation.
- `src/hooks/useRouteManipulation.js:321, 361` — every manual edit re-runs elevation.
- `src/pages/RouteBuilder.jsx:1029, 1072` — page-level handlers.

**The new RB2 pipeline does NONE of this.** `useAIGeneration` →
`executorAdapter.generateRoute` → `Executor.generate` → `RouterClient.solve`
returns the snapshot directly to `setRouteStats` (in
`useAIGeneration.selectSuggestion` at `src/hooks/route-builder/useAIGeneration.ts:128`)
with no elevation enrichment step. Same for `useRouteEditing.applyMutation`.

This is the most material parity gap.

---

## BRouterProvider

| Field | BRouter response location | Legacy `brouter.js` return | New `BRouterProvider.ts` extracts |
|---|---|---|---|
| Distance (m) | `properties['track-length']` as string | `distance_m` (line 87), alias `distance` | `result.distance_m ?? result.distance ?? 0` ✓ |
| Duration (s) | `properties['total-time']` as string | `duration_s` (line 88), alias `duration` | `result.duration_s ?? result.duration ?? 0` ✓ |
| Geometry | `route.geometry.coordinates` (GeoJSON) | `coordinates` (line 86) | `result.coordinates` ✓ |
| Elevation gain (m) | `properties['filtered ascend']` as string | both `elevation.ascent` (line 92) AND `elevationGain` (line 95) | `result.elevationGain ?? result.elevation?.ascent ?? 0` ✓ |
| Elevation loss (m) | `properties['filtered descend']` as string | both `elevation.descent` AND `elevationLoss` | `result.elevationLoss ?? result.elevation?.descent ?? 0` ✓ |

BRouter is correct — both paths populate elevation, both paths are
read. BRouter is the only provider that returns useful elevation
without a separate enrichment step.

Practical implication: gravel/MTB routes (BRouter-primary) show real
elevation in RB2 today. Road/commute routes (Stadia-primary) show 0.
This is consistent with what production has reported.

---

## MapboxProvider

| Field | Mapbox response location | Legacy `directions.js` / `smartCyclingRouter` return | New `MapboxProvider.ts` extracts |
|---|---|---|---|
| Distance (m) | `route.distance` | `distance` / `distance_m` (legacy alias added by smartCyclingRouter) | `result.distance_m ?? result.distance ?? 0` ✓ |
| Duration (s) | `route.duration` | `duration` / `duration_s` | `result.duration_s ?? result.duration ?? 0` ✓ |
| Geometry | `route.geometry.coordinates` | `coordinates` | `result.coordinates` ✓ |
| Elevation gain (m) | **not provided by Mapbox** | hardcoded `0` (smartCyclingRouter.js:358–359) | **hardcoded 0** (MapboxProvider.ts:141, 215) |
| Elevation loss (m) | not provided | hardcoded `0` | hardcoded `0` |

Mapbox legitimately doesn't return elevation. Legacy fixes this with a
separate `fetchElevationProfile` pass; new pipeline does not. Same
root cause as Stadia — surfaced under finding #1 in the report.

Mapbox-specific subtleties preserved correctly:

- `connect` uses `mapMatchRoute` (with the 15→25→50m radius fallback inside the legacy module) — `MapboxProvider.ts:191`. ✓
- `solve` uses `getCyclingDirections` — `MapboxProvider.ts:107`. ✓
- `supports()` returns `true` for all profiles per the deliberate deviation from the T2.1 spec (`MapboxProvider.ts:82`, rationale in `legacy-routing-notes.md` §4). ✓

---

## Snapshot assembly (`shared.ts:buildSnapshot`)

The conversion from provider output to `RouteSnapshot`:

```ts
// src/routing/RouterClient/providers/shared.ts:123-144
export function buildSnapshot(args: {
  coordinates: Coordinate[];
  distance_m: number;
  duration_s: number;
  elevationGain_m?: number;
  elevationLoss_m?: number;
  waypoints: readonly Coordinate[];
}): RouteSnapshot {
  const distance_km = M_TO_KM(args.distance_m);
  assertKm(distance_km, 'RouteSnapshot.stats.distance_km');
  return {
    geometry: args.coordinates,
    waypoints: args.waypoints.map((coordinate) => ({ coordinate })),
    stats: {
      distance_km,
      elevation_gain_m: args.elevationGain_m ?? 0,
      elevation_loss_m: args.elevationLoss_m ?? 0,
      duration_s: args.duration_s,
    },
  };
}
```

This is correct in isolation. It faithfully converts what the adapter
passes in. The bug is upstream — the adapter passes `0` for Stadia
elevation because the legacy module doesn't surface it.

Notes:
- `RouteSnapshot.elevations_m` (the per-geometry-point elevation array,
  declared optional in `types.ts:340`) is **never populated** by any
  adapter today. Anything that needs per-point elevation (e.g.,
  `elevationGainInScope_m` for scoped climbing mutations,
  `elevationUtils.ts:38`) falls back to the totals — which are 0 for
  Stadia. Same root cause.

---

## Fallback chain (registry)

Sanity check against legacy hardcoded order (`smartCyclingRouter.js:39–146`):

| Profile | Legacy | `PROVIDER_REGISTRY` (registry.ts:16–21) | Match? |
|---|---|---|---|
| gravel | brouter → stadia → mapbox | brouter → stadia → mapbox | ✓ |
| mountain / mtb | brouter → stadia → mapbox | brouter → stadia → mapbox | ✓ |
| road | stadia → brouter → mapbox | stadia → brouter → mapbox | ✓ |
| commuting / commute | stadia → brouter → mapbox | stadia → brouter → mapbox | ✓ |

The `normalizeProfile` alias map (`mountain` → `mtb`, `commuting` → `commute`)
matches what `StadiaProvider.toStadiaProfile` translates back to when
calling the legacy module. Round-trip is clean.

No finding here.

---

## Telemetry

| Event | Legacy stream (still fires) | New `routerclient_*` stream | Notes |
|---|---|---|---|
| Generation call | `generation_routing_called` | `routerclient_solve_called` | Both fire. |
| Per-provider attempt | (implicit via `generation_routing_called`) | `routerclient_provider_attempted` | New is more granular. |
| Per-provider success | `generation_routing_succeeded` | `routerclient_provider_succeeded` | Both fire. |
| Per-provider failure | `generation_routing_failed` | `routerclient_provider_failed` | Both fire. |
| Fallback chain step | `provider_fallback_chain_advanced` | (implicit via `provider_attempted` repeats) | New stream loses the explicit "from→to" pair. Acceptable; reconstructable from `attempt_index`. |
| Cache hit | n/a | `routerclient_solve_cache_hit` | New only. |
| Dedup join | n/a | `routerclient_solve_dedup_joined` | New only. |
| Final completion | n/a | `routerclient_solve_completed` | New only. |

**Double-prefix issue** (router-client.md known follow-up #3): the
`track()` helper in `RouterClient.ts:57–67` calls `trackRouteBuilder()`,
which hard-codes a `route_builder_` prefix. So events arrive in PostHog
as `route_builder_routerclient_solve_called`, not the documented
`routerclient_solve_called`. Already documented as a known issue.
Severity P2.
