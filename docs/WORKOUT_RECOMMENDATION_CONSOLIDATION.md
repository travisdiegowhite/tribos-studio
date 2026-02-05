# Workout Recommendation Systems - Consolidation Needed

## Overview

The Training Dashboard currently has **multiple independent systems** that recommend workouts, each using different logic and data sources. This leads to inconsistent recommendations being shown to users.

## Current State: 3 Separate Systems

### 1. Dashboard's `getSuggestedWorkout()`
**Location:** `src/pages/TrainingDashboard.jsx` (lines 560-589)

**Logic:**
```javascript
// Race proximity overrides TSB
if (daysUntilRace <= 7) → recovery_spin
if (daysUntilRace <= 14) → foundation_miles

// TSB-based recommendations
if (tsb >= 15) → five_by_four_vo2 or two_by_twenty_ftp
if (tsb >= 5) → two_by_twenty_ftp or four_by_twelve_sst
if (tsb >= -10) → traditional_sst or three_by_ten_sst
if (tsb >= -25) → foundation_miles or endurance_base_build
else → recovery_spin
```

**Used by:** "View Suggested Workout" button in TodaysFocusCard

**Pros:**
- Simple, fast, no API calls
- Considers race proximity

**Cons:**
- Only uses TSB and race date
- Doesn't consider recent training patterns
- Doesn't consider time available
- Doesn't consider what zones haven't been trained

---

### 2. TrainNow Component
**Location:** `src/components/TrainNow.jsx`

**Logic:**
```javascript
analyzeTrainingNeeds() considers:
- TSB (form/fatigue)
- Last 7 days of activities
- Total TSS for the week
- Whether Z2 has been trained recently
- Whether intensity has been trained recently
- Planned workouts from active plan

getRecommendedWorkouts() returns:
- Multiple recommendations ranked by score
- Filtered by time available (30m/60m/90m/2h+)
- Categories: Recovery, Endurance, Threshold, VO2max
```

**Used by:** Collapsible "TrainNow Recommendations" section

**Pros:**
- Most sophisticated analysis
- Considers multiple factors
- Time-aware filtering
- Plan-aware

**Cons:**
- Returns categories, not a single "do this" recommendation
- Separate UI from Today's Focus card

---

### 3. Coach API (when asked for workouts)
**Location:** `api/coach.js`

**Logic:**
- Full AI analysis with Claude
- Has access to complete training context
- Uses `recommend_workout` tool to suggest specific workouts
- Can create full training plans with `create_training_plan` tool

**Used by:** AI Coach card when user asks questions

**Pros:**
- Most intelligent, personalized
- Can explain reasoning
- Can create multi-week plans

**Cons:**
- Requires API call (cost/latency)
- Only triggered when user asks

---

## The Problem

These three systems can recommend **different workouts** for the same user at the same time:

| TSB | getSuggestedWorkout() | TrainNow | Coach API |
|-----|----------------------|----------|-----------|
| -9 | traditional_sst | Could be Endurance (if no Z2 recently) | Depends on conversation |

This creates user confusion: "Which recommendation should I follow?"

---

## Options for Consolidation

### Option A: TrainNow as Single Source of Truth
- `getSuggestedWorkout()` calls TrainNow's logic to get top recommendation
- Today's Focus shows the same workout that TrainNow would prioritize
- Coach API defers to TrainNow for workout suggestions

**Pros:** Consistent, sophisticated logic everywhere
**Cons:** Need to refactor TrainNow to expose a "get single recommendation" function

### Option B: Enhanced `getSuggestedWorkout()`
- Add TrainNow's analysis factors to `getSuggestedWorkout()`
- TrainNow uses the same enhanced logic
- Single function, multiple consumers

**Pros:** One place to maintain logic
**Cons:** Duplicates TrainNow's code or needs significant refactor

### Option C: Dedicated Recommendation Service
- Create `src/services/workoutRecommendation.js`
- Single function that all systems call
- Caches result per session to avoid recalculation

```javascript
// Proposed API
const recommendation = getWorkoutRecommendation({
  trainingMetrics,  // TSB, CTL, ATL
  activities,       // Recent rides
  raceGoals,        // Upcoming races
  plannedWorkouts,  // From active plan
  timeAvailable,    // Optional filter
});

// Returns
{
  primary: { workout, reason, score },
  alternatives: [{ workout, reason, score }, ...],
  analysis: { needs, fatigue, gaps }
}
```

**Pros:** Clean architecture, testable, single source of truth
**Cons:** More upfront work

### Option D: Coach API as Source of Truth
- Call coach API on dashboard load (or cache response)
- All UI elements show AI-recommended workout
- Most personalized

**Pros:** Intelligent, contextual
**Cons:** API cost, latency, requires always-on connection

---

## Recommended Approach

**Option C (Dedicated Service)** provides the best balance:

1. Create `src/services/workoutRecommendation.js` with TrainNow's logic
2. `getSuggestedWorkout()` calls this service for primary recommendation
3. TrainNow component calls this service for full analysis
4. Coach API can reference this service's output in its context

This ensures:
- ✅ Single source of truth
- ✅ Consistent recommendations across UI
- ✅ No API costs for basic recommendations
- ✅ Sophisticated analysis (not just TSB lookup)
- ✅ Easy to test and maintain

---

## Current Workaround (Implemented)

Until consolidation is complete:
- **CoachCard** no longer suggests specific workouts proactively
- Coach focuses on coaching conversations, not workout selection
- **TrainNow** and **Today's Focus** handle workout recommendations
- Users should follow TrainNow for the most sophisticated analysis

---

## Files to Modify for Consolidation

1. `src/services/workoutRecommendation.js` (new)
2. `src/pages/TrainingDashboard.jsx` - update `getSuggestedWorkout()`
3. `src/components/TrainNow.jsx` - use shared service
4. `api/coach.js` - optionally include recommendation in context

---

## Data Available for Recommendations

```javascript
// From TrainingDashboard state
trainingMetrics: { ctl, atl, tsb }
activities: [] // All loaded activities
raceGoals: [] // Upcoming races with dates
activePlan: {} // Current training plan
plannedWorkouts: [] // Workouts from active plan
ftp: number
```

---

## Questions for Beta Users

1. Do you follow TrainNow or Today's Focus for workout suggestions?
2. Is it confusing to see different recommendations in different places?
3. Would you prefer one clear "do this today" recommendation?
4. How important is time filtering (30m vs 2h workouts)?
5. Should race proximity always override TSB-based suggestions?

---

*Document created: Feb 2026*
*Status: Pending consolidation - gathering beta feedback*
