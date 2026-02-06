# Workout Recommendation Consolidation — Implementation Plan

## Goal

Merge three independent workout recommendation systems into a single service without losing any user-facing utility. Every feature that works today continues to work; the difference is that all three surfaces give consistent answers rooted in the same logic.

---

## What Each System Uniquely Contributes (Must Not Lose)

| System | Unique Value | Current Location |
|---|---|---|
| `getSuggestedWorkout()` | Race proximity override (7-day race week, 14-day taper) | `TrainingDashboard.jsx:560-587` |
| TrainNow | Zone gap detection, time filtering, multi-category ranked output, plan awareness | `TrainNow.jsx:49-227` |
| Coach API | Conversational context, explain "why", calendar integration, multi-week plan creation, fuel plans | `api/coach.js` + `api/utils/workoutLibrary.js` |

---

## Architecture: Unified Recommendation Service

```
┌─────────────────────────────────────────────────────┐
│         src/services/workoutRecommendation.js        │
│                                                      │
│  analyzeTrainingNeeds()  ← merged logic              │
│  getWorkoutRecommendation()  ← primary entry point   │
│  getWorkoutRecommendations()  ← multi-result entry   │
│                                                      │
│  Inputs:                                             │
│    trainingMetrics  { ctl, atl, tsb }                │
│    activities       recent rides                     │
│    raceGoals        upcoming races                   │
│    plannedWorkouts  from active plan                 │
│    ftp              functional threshold power        │
│    timeAvailable    optional, minutes                │
│                                                      │
│  Outputs:                                            │
│    primary   { workout, reason, score, category }    │
│    alternatives  [{ workout, reason, score, cat }]   │
│    analysis  { needs, raceProximity, gaps }          │
└──────────────┬──────────────┬──────────────┬────────┘
               │              │              │
      ┌────────▼───┐  ┌──────▼──────┐  ┌───▼──────────┐
      │ TodaysFocus │  │  TrainNow   │  │  Coach API   │
      │   Card      │  │  Component  │  │  (context)   │
      │             │  │             │  │              │
      │ Shows       │  │ Shows all   │  │ References   │
      │ primary     │  │ categories  │  │ service      │
      │ pick +      │  │ with time   │  │ output in    │
      │ short why   │  │ filtering   │  │ system prompt│
      └─────────────┘  └─────────────┘  └──────────────┘
```

---

## Service Interface

```javascript
// src/services/workoutRecommendation.js

/**
 * Single entry point for "what should I ride today?"
 * Merges: getSuggestedWorkout() race logic + TrainNow analysis + zone gaps
 */
export function getWorkoutRecommendation({
  trainingMetrics,   // { ctl, atl, tsb }
  activities = [],   // recent rides (all loaded)
  raceGoals = [],    // upcoming races with race_date, priority
  plannedWorkouts = [],  // from active training plan
  ftp = 200,
  timeAvailable = null,  // null = no filter, or 30/60/90/120
}) → {
  primary: {
    workout: WorkoutDefinition,
    reason: string,         // human-readable "why"
    score: number,          // 0-100
    category: string,       // 'recovery' | 'endurance' | 'threshold' | 'vo2max'
  },
  alternatives: [{
    workout: WorkoutDefinition,
    reason: string,
    score: number,
    category: string,
  }],
  analysis: {
    needs: {
      recovery:  { score, reason },
      endurance: { score, reason },
      intensity: { score, reason },
      vo2max:    { score, reason },
      threshold: { score, reason },
    },
    raceProximity: {
      nextRace: object | null,
      daysUntilRace: number | null,
      phase: 'race_week' | 'taper' | 'final_build' | 'build' | 'base' | null,
    },
    gaps: {
      missingZ2: boolean,
      missingIntensity: boolean,
    },
    formStatus: 'fresh' | 'ready' | 'optimal' | 'tired' | 'fatigued',
  }
}
```

---

## Merged Logic (Decision Priority)

The service applies decisions in this order. Higher priority wins:

```
1. RACE PROXIMITY (from getSuggestedWorkout — currently missing in TrainNow)
   ├─ Race week (≤7 days):  Force recovery, score override
   └─ Taper (≤14 days):     Force easy endurance, score override

2. PLANNED WORKOUT (from TrainNow — currently missing in getSuggestedWorkout)
   └─ If today has a planned workout: honor it as primary recommendation

3. FORM-BASED SCORING (from TrainNow analyzeTrainingNeeds)
   ├─ TSB < -25:  Recovery dominant
   ├─ TSB < -10:  Easy day bias
   ├─ TSB > 15:   Intensity dominant
   ├─ TSB > 5:    Quality session
   └─ Neutral:    Balanced

4. ZONE GAP DETECTION (from TrainNow — currently missing in getSuggestedWorkout)
   ├─ No Z2 in last 7 days + ≥2 rides: boost endurance
   │   Z2 defined as: avg power < 75% FTP and duration > 60min
   └─ No intensity in last 7 days + form favorable: boost intensity/VO2max
       Intensity defined as: avg power > 90% FTP
   Note: Thresholds are FTP-relative, not hardcoded watts. FTP fluctuates
   between athletes and over time — the service takes ftp as an input and
   computes these thresholds dynamically.

5. TIME FILTERING (from TrainNow — applied as a filter, not a scoring input)
   └─ When timeAvailable set: filter workout.duration ≤ timeAvailable + 15

6. WORKOUT SELECTION
   ├─ Pick top workout from highest-scoring category
   ├─ Pick alternatives from remaining categories
   └─ Return full analysis for UI and Coach context
```

This gives us the best of all three systems: race-aware (from `getSuggestedWorkout`), context-aware (from TrainNow), and explainable (the `reason` field feeds the Coach).

---

## Migration Steps (Sequenced to Never Break Anything)

### Phase 1: Extract service (no UI changes)

**Files to create:**
- `src/services/workoutRecommendation.js`

**What goes in:**
1. Copy `analyzeTrainingNeeds()` from `TrainNow.jsx:49-141`
2. Copy race proximity logic from `TrainingDashboard.jsx:560-573`
3. Copy `getRecommendedWorkouts()` from `TrainNow.jsx:146-227`
4. Merge into single `getWorkoutRecommendation()` that applies the priority order above
5. Export both `getWorkoutRecommendation()` (single best) and `getWorkoutRecommendations()` (all categories)

**Tests to write:**
- `src/services/__tests__/workoutRecommendation.test.js`
- Test each decision boundary:
  - Race week override
  - Taper override
  - TSB thresholds (-25, -10, 5, 15)
  - Zone gap boosts
  - Time filtering
  - Planned workout override
  - No activities edge case
  - No race goals edge case

**Verification:** Service exists and is tested. Nothing in the UI has changed. Both old systems still work as before.

---

### Phase 2: Wire up `getSuggestedWorkout()` (TodaysFocusCard)

**Files to modify:**
- `src/pages/TrainingDashboard.jsx`

**Changes:**
1. Import `getWorkoutRecommendation` from the new service
2. Replace the inline `getSuggestedWorkout()` function (lines 560-587) with a call to the service:
   ```javascript
   const [focusTimeAvailable, setFocusTimeAvailable] = useState(null);

   const recommendation = useMemo(() => getWorkoutRecommendation({
     trainingMetrics,
     activities: visibleActivities,
     raceGoals,
     plannedWorkouts: [], // or from activePlan
     ftp,
     timeAvailable: focusTimeAvailable,
   }), [trainingMetrics, visibleActivities, raceGoals, ftp, focusTimeAvailable]);

   const suggestedWorkout = recommendation.primary?.workout || null;
   ```
3. Add a compact `30m | 60m | 90m | 2h+` SegmentedControl to TodaysFocusCard (same pattern as TrainNow). Defaults to no filter. Recommendation updates instantly via the useMemo above.
4. Pass `recommendation.primary.reason` to TodaysFocusCard so it can show *why* this workout was picked (currently it just shows the workout name — this is a low-lift UX improvement)

**Verification:** TodaysFocusCard shows the same or better recommendations. The "View Suggested Workout" button still works. Race proximity still overrides TSB. Changing the time filter updates the suggestion immediately.

---

### Phase 3: Wire up TrainNow component

**Files to modify:**
- `src/components/TrainNow.jsx`

**Changes:**
1. Import `getWorkoutRecommendation` from the service
2. Replace the local `analyzeTrainingNeeds()` and `getRecommendedWorkouts()` calls with the service
3. The component now consumes `recommendation.alternatives` for the category cards and `recommendation.analysis.needs` for the bar chart
4. Time filtering passes through to the service via `timeAvailable`
5. Keep the `TrainNowBadge` export — it can use the service's `analysis.formStatus` instead of its own inline TSB logic

**What the component keeps:**
- All UI rendering (cards, badges, grid, segmented control)
- The `onSelectWorkout` callback
- `WorkoutDifficultyBadge` integration
- `NeedIndicator` display

**What the component loses:**
- Its own copy of `analyzeTrainingNeeds()` and `getRecommendedWorkouts()` — these now live in the service

**Verification:** TrainNow shows the same categories, time filtering works, difficulty badges work. Now guaranteed to match TodaysFocusCard's recommendation.

---

### Phase 4: Feed Coach API with service output

**Files to modify:**
- `src/pages/TrainingDashboard.jsx` (update `buildTrainingContext()`)
- Optionally: `api/coach.js` system prompt

**Changes:**
1. In `buildTrainingContext()` (line 2149), append a new section:
   ```
   --- TODAY'S WORKOUT RECOMMENDATION ---
   Primary: {workout.name} ({workout.id})
   Reason: {recommendation.primary.reason}
   Analysis: Form={formStatus}, Race proximity={phase}, Missing Z2={gaps.missingZ2}
   Alternatives: {alt1.name}, {alt2.name}
   ```
2. This gives the Coach the same recommendation the user sees elsewhere. The Coach can:
   - Agree with it ("I see your dashboard is suggesting sweet spot today — that's a good call because...")
   - Adjust it based on conversational context ("You mentioned your knee is sore, so let's swap to recovery instead")
   - Use `recommend_workout` tool to formally schedule it

**What does NOT change:**
- The Coach still uses Claude for responses
- The Coach still has `recommend_workout`, `create_training_plan`, `generate_fuel_plan` tools
- The Coach can still override the service recommendation in conversation
- No new API costs — the recommendation is computed client-side and passed as context

**Verification:** Coach sees the recommendation in its context. When asked "what should I ride today?", it references or builds on the service output instead of generating a contradictory answer from scratch.

---

### Phase 5: Cleanup and re-enable Coach proactivity

**Files to modify:**
- `src/components/coach/CoachCard.jsx`

**Changes:**
1. The `getCoachingMessage()` function (lines 28-52) currently shows generic TSB-based messages. Update it to reference the service's recommendation:
   ```
   "You're in good form today. I'd suggest {recommendation.primary.workout.name} —
    {recommendation.primary.reason}. Ask me if you want to adjust."
   ```
2. This re-enables the Coach's ability to proactively mention workouts (currently suppressed per the consolidation doc's "Current Workaround") — but now it's guaranteed consistent with TrainNow and TodaysFocusCard.

**Verification:** CoachCard shows a workout hint that matches the other two surfaces. No contradictions.

---

## Files Changed (Summary)

| File | Phase | Action |
|---|---|---|
| `src/services/workoutRecommendation.js` | 1 | **Create** — unified recommendation logic |
| `src/services/__tests__/workoutRecommendation.test.js` | 1 | **Create** — unit tests |
| `src/pages/TrainingDashboard.jsx` | 2, 4 | **Modify** — consume service, update buildTrainingContext |
| `src/components/TrainNow.jsx` | 3 | **Modify** — consume service, remove local logic |
| `src/components/coach/CoachCard.jsx` | 5 | **Modify** — reference service recommendation |
| `docs/WORKOUT_RECOMMENDATION_CONSOLIDATION.md` | 5 | **Update** — mark as implemented |

---

## What Does NOT Change

- `api/coach.js` — no code changes needed, just receives better context
- `api/utils/workoutLibrary.js` — unchanged
- `src/data/workoutLibrary.ts` — unchanged
- `src/components/WorkoutDifficultyBadge.jsx` — unchanged
- `src/components/coach/CoachCommandBar.jsx` — unchanged (still calls /api/coach)
- All workout modals, calendar integration, plan activation — unchanged

---

## Risk Mitigation

1. **Phase 1 is safe** — it's additive only (new file, new tests). Nothing existing is touched.
2. **Phase 2 is low risk** — replaces 27 lines of inline logic with a service call. Behavior should be identical or better (adds zone gap awareness to TodaysFocusCard).
3. **Phase 3 is medium risk** — TrainNow's rendering depends on the shape of `getRecommendedWorkouts()` output. The service must return the same shape (category, title, reason, score, workouts array) so the UI doesn't break. The safest approach: have the service return the canonical shape and map it in the component if needed.
4. **Phase 4 is low risk** — just appending text to the training context string.
5. **Phase 5 is low risk** — cosmetic change to CoachCard's idle message.

Each phase is independently deployable. If any phase causes issues, roll it back without affecting the others.

---

## Testing Strategy

**Unit tests (Phase 1):**
```
describe('getWorkoutRecommendation', () => {
  it('returns recovery_spin when within 7 days of race')
  it('returns foundation_miles during taper period')
  it('returns VO2max work when TSB > 15 and no race proximity')
  it('boosts endurance when no Z2 ride in last 7 days')
  it('boosts intensity when no high-power rides and form is good')
  it('honors planned workout for today')
  it('filters by timeAvailable')
  it('returns alternatives from different categories')
  it('handles empty activities gracefully')
  it('handles no race goals gracefully')
  it('primary recommendation matches TrainNow top pick')
  it('race proximity overrides all other scoring')
})
```

**Integration verification (Phase 2-5):**
- Open Training Dashboard
- Compare TodaysFocusCard suggestion with TrainNow primary
- They should always match (unless time filter changes the TrainNow result)
- Ask Coach "what should I ride today?" — should reference or agree with the same workout
- Change time filter in TrainNow — alternatives should update, primary may change
- Set a race 5 days out — all three surfaces should show recovery

---

## Decisions Made

1. **Race proximity always wins** unless the user explicitly tells the Coach otherwise in conversation. The Coach can override (e.g., "I know my race is in 5 days but I want one more hard session") but the default recommendation from the service always respects race proximity. This is non-negotiable at the service level.

2. **Zone gap thresholds must be FTP-relative, not hardcoded watts.** The current TrainNow code uses 200W for Z2 and 220W for intensity — these are meaningless for a rider with a 150W FTP or a 350W FTP. The service will compute:
   - Z2 threshold: avg power < **75% of FTP** and duration > 60min
   - Intensity threshold: avg power > **90% of FTP**
   - FTP is a required input to the service (defaults to 200 if unknown)
   - This is a Phase 1 requirement, not a future improvement.

3. **Cache strategy:** Use `useMemo` in React (already the pattern in TrainNow). No separate cache layer needed — the computation is pure and fast (no API calls).

4. **TodaysFocusCard gets a time selector.** Real schedules change — if a user suddenly only has 60 minutes, the hero recommendation should reflect that immediately, not show a 90-minute ride.
   - Add a compact `30m | 60m | 90m | 2h+` SegmentedControl to TodaysFocusCard (same pattern as TrainNow)
   - Defaults to no filter (best workout regardless of duration)
   - TodaysFocusCard and TrainNow time selectors are **independent** — focus card is "what should I do with this time," TrainNow is "let me explore all options at a different duration"
   - Both feed `timeAvailable` into the same service, so for identical inputs the primary pick is always consistent
   - This is a Phase 2 addition (when TodaysFocusCard is wired to the service)

## Open Questions

None — all decisions resolved.

---

*Document created: Feb 2026*
*Status: IMPLEMENTED — all 5 phases complete*
*Supersedes: docs/WORKOUT_RECOMMENDATION_CONSOLIDATION.md (problem statement)*
