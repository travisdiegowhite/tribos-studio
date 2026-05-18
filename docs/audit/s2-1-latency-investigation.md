# S2.1 Latency Investigation Report

**Date:** 2026-05-18
**Branch:** `claude/investigate-v2-latency-OYmfN`
**Status:** Code-level root cause identified and trivial fix applied.
Browser-side waterfall verification still required by Travis before
declaring S2.1 done.

## Symptom

v2 route generation observed at ~60s; v1 at ~10s for the same form
input (endurance, 120min, road, Erie start). Same `generateAIRoutes`
backend, so the regression has to live in the v2 wrapper, not in v1's
heavy-lift code.

## Methodology limit (read this first)

The scope step "open devtools, capture network waterfalls" wasn't
possible from this environment — there's no browser, no logged-in
session, no Mapbox/Claude/Stadia credentials, no way to actually
generate a route end-to-end. The investigation is therefore strictly
code-level: read v1's caller in `RouteBuilder.jsx`, read v2's
`useAIGeneration` hook and its downstream, and identify the diff in
work each path does.

That means **the fix below is the most defensible candidate, not a
proven one.** Travis should re-time v2 generation after this lands; if
it's now within 2× of v1, we're done. If it's still close to 60s,
there's a second cause and we go to S2.2.

## Root cause (candidate)

`useAIGeneration` always re-runs the elevation API after
`generateAIRoutes` returns, even though v1's `generateAIRoutes` already
fetched elevation for the route candidates inside
`convertClaudeToFullRoute` and the Mapbox-based generators (via
`fetchElevationProfile` against Open-Elevation). The redundant pass is
caused by the `isAlreadyEnriched` predicate in
`src/hooks/route-builder/elevationEnrichment.ts:54-60`:

```ts
function isAlreadyEnriched(snap: RouteSnapshot): boolean {
  const hasPositiveGain = (snap.stats?.elevation_gain_m ?? 0) > 0;
  const hasPerPoint =
    Array.isArray(snap.elevations_m) &&
    snap.elevations_m.length === snap.geometry.length;
  return hasPositiveGain && hasPerPoint;
}
```

The predicate requires both a positive elevation gain **and** a
per-point `elevations_m` array of matching length. But
`toRouteSnapshot` in `useAIGeneration.ts:59-90` never populates
`elevations_m` — it only reads `distance`, `elevationGain`,
`elevationLoss`, and `coordinates` from v1's result. So `hasPerPoint`
is always false, the predicate always returns false, and the
enrichment unconditionally fires `getElevationData` → `/api/elevation`
→ OpenTopoData for every generated route candidate.

Compounding the cost: the per-point elevation profile is also fetched
**again** by `useRouteAnalysis` (`src/hooks/route-builder/useRouteAnalysis.ts:79-110`)
the moment `selectSuggestion(0)` writes the new geometry to the store.
There is no shared cache between the two paths — `enrichRouteElevation`
has a module-local LRU keyed by quantized geometry, while
`useRouteAnalysis` calls `getElevationData` directly without going
through that helper.

Net: v2 makes **two extra elevation API calls per generation** that v1
doesn't make. Each call goes through `/api/elevation`, which proxies to
public OpenTopoData (free tier, 1 req/s, sometimes slow). The pre-fix
chain:

```
1. generateAIRoutes()
   └─ inside: Open-Elevation API call (≈1–3s)  [v1 also pays this]
2. enrichRouteElevation() — Promise.all over candidates
   └─ /api/elevation → OpenTopoData            [v2 only, ≈1–5s]
3. selectSuggestion → routeGeometry changes
   └─ useRouteAnalysis effect →
      getElevationData → /api/elevation        [v2 only, ≈1–5s]
```

Step 2 lives inside `isGenerating === true`, so it's part of the
user-perceived generation time. Step 3 fires after `isGenerating`
flips to false, but the route is rendered before it completes, so it
shouldn't be part of the perceived spinner. (Travis's observation is
that "generation takes 60s" — if the spinner itself is still showing,
the bottleneck is step 2. If the route appears earlier than 60s and
the lag is in elevation-profile rendering, that's step 3. The
waterfall will distinguish these.)

## Evidence

| Path | File / lines | What runs |
|---|---|---|
| v1 enters `generateAIRoutes` | `src/pages/RouteBuilder.jsx:1986–2002` | Calls `generateAIRoutes` with `userId`, `speedProfile` (real), `speedModifier: 1.0`. |
| v2 enters `generateAIRoutes` | `src/hooks/route-builder/useAIGeneration.ts:127–138` | Calls `generateAIRoutes` with `userId`, `speedProfile: null`, `speedModifier: 1.0`. |
| v1 elevation in generator | `src/utils/aiRouteGenerator.js:916,1020,1148,1506,1627,1825,1862,1987` and `convertClaudeToFullRoute` line 1148 | One `fetchElevationProfile` per route candidate inside generation; output route carries `elevationGain` and the (downsampled) `elevationProfile` array. |
| v2 elevation post-generation | `src/hooks/route-builder/useAIGeneration.ts:158–160` + `elevationEnrichment.ts:71–101` | `Promise.all(toKeep.map(enrichRouteElevation))`. Predicate at `elevationEnrichment.ts:54–60` requires per-point array that `toRouteSnapshot` never sets → always misses → always re-fetches. |
| v2 elevation post-selection | `src/hooks/route-builder/useRouteAnalysis.ts:79–110` | Effect on `coordinates` → `getElevationData(coordinates)`. Independent of the enrichment cache. |
| Auto-apply selection | `src/pages/RouteBuilder2.tsx:128–134` | `useEffect` calls `selectSuggestion(0)` once `aiSuggestions[0]` is present. |

The `count` hypothesis from the spec is **not** the cause for the
production case: `FormPanel.tsx:165` invokes `generation.generate(input)`
with no second arg, defaulting to `count: 1` in
`useAIGeneration.ts:115`. The slicing at line 154 and the padding at
line 156 only matter for the dev harness's `generate 3 alts` button.

The "v2 re-fetches user profile / training context" hypothesis isn't
the cause either — `assembleRouteContext` was deleted in S2; the v2
generation path is now a near-direct call to `generateAIRoutes` and
does not query Supabase for past rides / preferences separately
(those queries happen inside `generateAIRoutes` for both v1 and v2
when `userId` is passed).

## Fix applied

Minimal patch to `src/hooks/route-builder/elevationEnrichment.ts`:

```ts
function isAlreadyEnriched(snap: RouteSnapshot): boolean {
  return (snap.stats?.elevation_gain_m ?? 0) > 0;
}
```

The per-point array check is dropped. Rationale:

- v1's `generateAIRoutes` already pays for one elevation pass and
  populates `elevationGain`. When the snapshot has a positive gain,
  the enrichment fetch is redundant.
- The per-point profile (which the gain check used to gate on) is
  consumed by the elevation-profile UI via `useRouteAnalysis`, which
  fetches it on its own schedule. We don't need `elevationEnrichment`
  to populate it.
- The original "elevation = 0" smoking-gun case from pre-S2 is
  preserved: when v1 returns `elevationGain = 0` (the failure mode the
  fix was designed for), `hasPositiveGain` is false, and enrichment
  fires as before.

Existing tests pass (`src/hooks/route-builder/__tests__` — 41
tests, all green). The hook test for `useAIGeneration` mocks
`enrichRouteElevation` as a pass-through, so it doesn't exercise the
predicate directly; the change is observable only at integration time
with a real `generateAIRoutes` response.

## Verification (still TODO — needs browser)

Travis: please re-time v2 generation against the Erie start, same
form values, after this lands.

1. Open `/route-builder-2`, devtools Network tab, "Disable cache" on.
2. Fill in endurance / 120min / road / Erie. Generate.
3. Note the elapsed time. Look at the waterfall — there should now be
   **one** `POST /api/elevation` call during the spinner (the
   `useRouteAnalysis` post-selection fetch), instead of two.
4. Verify elevation gain is still non-zero on the rendered route. If
   it's zero, the fallback didn't kick in correctly and we have a
   different bug.
5. v1 timing should be unchanged — only `elevationEnrichment.ts`
   was touched, and v1 doesn't use that file.

Expected: v2 generation drops by the cost of one `/api/elevation`
round-trip (rough estimate: 2–5s on a fast network, possibly more
under OpenTopoData rate limiting).

## If timing is still >20s after this fix

The remaining candidates, in order of likelihood:

1. **`useRouteAnalysis` fires during the spinner, not after.** If
   `selectSuggestion` runs synchronously inside the same React commit
   as `setIsGenerating(false)` flipping, the effect may queue before
   the spinner unmounts. Inspectable in the waterfall.
2. **Open-Elevation inside `generateAIRoutes` is unusually slow for
   the Erie test point.** v1 also pays this, so it'd affect both —
   but if v1 caches it via in-memory cache between sessions and v2
   doesn't, that'd skew. Worth confirming both paths actually call the
   same API by inspecting `fetchElevationProfile` request counts.
3. **`speedProfile: null` causes a slower fallback path inside
   `generateAIRoutes`.** Plausible but unverified. v1 passes a real
   `speedProfile` from its store; v2's `useAIGeneration` hard-codes
   `null`. Inside `generateAIRoutes`, this only changes
   `calculateTargetDistance`'s base speed (defaults to 20 km/h for
   endurance vs the user's actual). Different target distance →
   potentially different Claude prompt and routing complexity → could
   affect timing. Worth a follow-up to plumb `speedProfile` through.
4. **The auto-apply `useEffect` in `RouteBuilder2.tsx:128-134`
   depending on `[generation]`.** Every render produces a new
   `generation` object, so the effect re-runs constantly; the ref
   guard prevents the actual call but the effect body still executes.
   Probably not a 50s cost, but worth a clean-up.

If after the fix v2 is still >20s, propose **S2.2** scoped to:

- Plumb `speedProfile` from a real source into `useAIGeneration`
  (parity with v1's caller).
- Either eliminate the post-selection elevation fetch in
  `useRouteAnalysis` (by caching the v1 `elevationProfile` array
  through the snapshot and into the store), or run it lazily once an
  elevation profile UI surface is actually visible.
- Stabilize the `useEffect` deps in `RouteBuilder2.tsx` so
  auto-apply only fires when suggestions actually change.

## Out of scope (left alone)

- `RouteBuilder.jsx` — untouched.
- `routeBuilderStore.js` — untouched.
- `src/utils/aiRouteGenerator.js` and `src/utils/elevation.js` — these
  are v1 services per the S2 rewire contract; no edits.
- Caching / batching of `/api/elevation` — speculative optimization
  beyond restoring v1 parity.
