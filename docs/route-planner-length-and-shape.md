# Route planner — shape and length correctness

Prompted by beta feedback (August 2026) from a rider who spent a summer trying
to build routes for coach-prescribed workouts and couldn't get either the shape
or the length she asked for. All three of her complaints were real defects.

This document covers **Phase 1 (shipped)** and scopes Phases 2–3.

## What was wrong

### Shape

- **RB2's "Out & Back" had never worked.** The form emitted `'out_and_back'`;
  `aiRouteGenerator.js` matched `'out_back'`, so the dispatcher in
  `generateWaypointsFromDirections` fell through its if/else chain to the loop
  default. Same mismatch in `generateMapboxBasedRoutes` and
  `generateSmartWaypoints`, where `point_to_point` also degraded to a loop.
- **RB2 never wrote the chosen shape to the store.** `setRouteType` was called
  only from RB1, so the saved `routes.route_type` and the chat coach's
  loop-vs-point-to-point edit strategy both read a stale default `'loop'`.
- **The route shape was passed where a routing profile was expected**
  (`generateFallbackRoute({ routeProfile: routeType })`).

The database settles the vocabulary: `routes.route_type` is CHECK-constrained
to `('loop','out_back','point_to_point')`. RB2's spelling was the outlier — and
only passed because the stale store default happened to be `'loop'`. Fixing the
store write without fixing the vocabulary would have started failing saves.

### Length

Targeting and display used two unrelated speed models:

| | keyed by | road baseline |
|---|---|---|
| `calculateTargetDistance` (targeting) | `recovery/endurance/intervals/hills` | 19–20 km/h |
| `personalizedETA` (what the rider sees) | `recovery/endurance/tempo/intervals/hills/race` | 25 km/h × goal |

The RB2 form offers `endurance/tempo/threshold/recovery/long_ride/commute`, so
**four of six goals missed the targeting map** and fell to a 19 km/h default.
Requesting a 90-minute tempo ride produced a 28.5 km route that the app itself
then labelled **~65 minutes** — a ~28% shortfall, by construction, every time.

RB2 also hardcoded `speedProfile: null`, so the learned-speed branch of
`calculateTargetDistance` was dead for every RB2 rider.

## Phase 1 — what shipped

**One shape vocabulary.** RB2 now uses the generator's and database's strings.
A fourth option, **"Start & Finish Here"** (`round_trip`), is the new default —
the rider says they want to end where they started and the generator picks a
loop or an out-and-back on merit. Claude echoes the shape it planned back in its
JSON (`routeType`), which is how a round trip resolves; a batch of suggestions
naturally comes back as a mix. `resolveRouteShape` in `aiRouteGenerator.js` is
the single resolution point, and never resolves a round trip to
`point_to_point`. Only concrete shapes are persisted.

**Shape reaches the store**, per suggestion — `RouteSnapshot.shape` carries it,
and `selectSuggestion` commits the shape of the suggestion the rider actually
picked, not the first one generated.

**One speed model**, in `src/utils/routeTargets.js`: `RIDE_GOAL_INTENSITY`
(covering every goal string in the app), `flatProfileSpeedKmh`,
`flatSpeedKmh`, `targetDistanceKmForTime`. Both `calculateTargetDistance` and
`personalizedETA`'s base speed now call it, so on flat ground the requested time
and the displayed time are inverses of each other. `deriveTimeMinutes` lost its
local 28 km/h constant too.

Two behaviours changed as a side-effect, both fixes: the `fitnessLevel`
multiplier is gone (it double-counted fitness already present in the rider's
measured speed), and `mtb` now resolves to the mountain speed in the ETA rather
than falling through to road.

**The rider's speed profile reaches generation.** `useSpeedProfile`
(`src/hooks/route-builder/`) caches the fetch at module scope so the ETA and
generation share one network call and one pace.

### Tests

`src/utils/__tests__/routeTargets.speed.test.ts` is the regression lock: for
each of the six form goals, a 90-minute request must display as ~90 minutes. It
also asserts the old arithmetic produced <70 minutes, so the bug can't quietly
return. Shape coverage lives in `aiRouteGenerator.targets.test.ts`,
`useAIGeneration.test.ts` and `useGenerateForm.test.tsx`.

## Phase 2 — length as a promise (shipped)

**A Phase 1 gap closed first.** `setTrainingGoal` was never called from RB2 —
the same class of bug as the `setRouteType` gap Phase 1 fixed — so
`personalizedETA` always received a store goal of `'endurance'`. A tempo route
was priced at the endurance pace on screen while generation had targeted tempo,
reopening the disagreement at ~10%. The shared speed model was correct; the
integration wasn't.

**The rider says which number binds.** A `Target: Time | Distance` toggle
(default time). The selected field is the hard constraint; the other renders
read-only, derived through `flatSpeedKmh` from the rider's own speed profile.
Only the binding one is sent as a target, so "90 minutes" and "40 km" can no
longer silently fight.

**Duration is a real target.** A distance derived from minutes is only as good
as the pace guess behind it, and hills invalidate that guess. In time mode the
generator now measures the ride time its route actually implies and rebuilds
once against a corrected distance, keeping whichever attempt is closer *in
time*. Budget: one extra routing call plus one elevation fetch. Skipped when
Claude's named roads were used — rebuilding would discard real road
intelligence for a length nudge, and the chip below keeps that case honest.

Watch the units here: `directions.js fetchElevationProfile` reports per-point
`distance` in **metres** while `personalizedETA` reads that field as
**kilometres**. `estimateRideMinutes` converts at the seam and asserts it
(T1.1); `aiRouteGenerator.eta.test.ts` is the guard.

**Misses are reported, not hidden.** Tolerance tightened to 10%, and
`buildTargetAccuracy` records target-versus-achieved on the route. The rider's
request is stored as `routeTarget`, so `StatsOverlay` recomputes the gap from
*live* stats — the target keeps tracking while the route is hand-edited rather
than being a one-shot check. The chip reads "16 min under 90" and taps through
to the route coach. `generation_completed` now carries the error, so the field
miss-rate is visible.

**Chat repair converges.** `applyShorterEdit` was a point-count trim whose
reported delta was measured on the trimmed chord — before the caller snapped it
back to roads, which changed the length again. It now trims, reroutes, measures
and corrects once, inside the service, returning `needsReroute: false` and an
accurate number (which fixes RB1's panel too). `applyLongerEdit`'s loop branch
had no convergence at all and got the same treatment. The absolute
`targetDistanceKm` now crosses from `routeEditTools` alongside the legacy
delta, and direction comes from target-versus-current rather than the intent
label — a `longer` edit with a target below the current distance used to extend
the route. Finally, the coach writes its prose before any geometry runs, so
when the delivered distance misses a distance the rider named, the reply says
so instead of letting the claim stand next to a contradicting stat line.

These are the first `shorter` tests in the repo.

## Phase 2 — original scope (for reference)

1. A `targetMode: 'time' | 'distance'` toggle, so the rider says which one
   binds; the other renders as a derived estimate.
2. Make duration a real target: after the existing distance converge loop and
   elevation fetch, compute the ETA and, in time mode, rescale and rebuild once
   if it is >10% off. Capped at one corrective pass.
3. Tighten `TOLERANCE` from 0.15 to 0.10, narrow the 0.4×–2.0× Claude
   pre-filter, and **surface the achieved-vs-target error** in `StatsOverlay`
   instead of silently serving a miss. The converge loop keeps its best attempt
   whether or not it converged, and says nothing today.
4. `applyLongerEdit`'s loop branch is single-shot (the point-to-point branch
   already measures and rescales) and `applyShorterEdit` is a coordinate splice
   whose reported delta isn't the delivered one — which is why iterating in chat
   never lands on the number.

## Phase 3 — route for the workout the rider actually has (not yet built)

1. `getTodaysPrescription` is date-locked to `today` and ignores the
   `workoutId`/`scheduledDate` the builder was handed, so building a route for
   Saturday's session describes today's instead.
2. Non-library workouts — i.e. anything a human coach prescribes — return
   `terrainType: null, structure: null`, so `deriveRoutingImplications`
   ("needs a sustained 36+ minute uninterrupted section") never fires.
   `planned_workouts` has no `structure` column, no custom-entry UI, and no
   text→structure parser; all three are needed.
3. `generateAIRoutes` already accepts a `trainingContext` param that renders a
   `TRAINING PLAN WORKOUT` prompt block, and no caller passes it.
4. `api/utils/workoutSegmentMatcher.js` already turns a `WorkoutStructure` into
   routing requirements and ranks the rider's own `training_segments` against
   them — the foundation for anchoring a route on a real road that fits the main
   block, rather than asking Claude for one and hoping.

### Known ceiling

Route geometry is synthesized from bearings and a radius; Claude's named roads
are used only when the shape is a loop, the names geocode, and the result lands
within 35%. Constructing a route that *deliberately* contains a sustained
interval stretch is beyond today's generator — see
`docs/route-builder-review-2026-07.md` P3.
