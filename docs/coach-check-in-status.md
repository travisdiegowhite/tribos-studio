# Coach Check-In Feature: Status & Known Issues

## What Was Built

A Coach Check-In tab on the Training Dashboard that provides AI-powered coaching feedback after each ride. The feature includes:

1. **5 coaching personas** (Hammer, Scientist, Encourager, Pragmatist, Competitor) defined in `docs/tribos_voice_bible.md`
2. **Intake interview** — 5-question flow that classifies the user's preferred persona
3. **Context assembly** — Gathers rider data from the DB and formats it into an AI prompt
4. **AI generation** — Sends context to Claude Sonnet 4.5, returns persona-voiced narrative with deviation callout and recommendation
5. **Accept/dismiss decisions** — User responds to recommendations; decisions feed into the next check-in's context
6. **Week bar chart** — Visual showing planned vs actual TSS per day (side-by-side bars)
7. **Regenerate button** — Force-refreshes check-in with `forceRegenerate` flag that bypasses cache
8. **Debug panel** — After Regenerate, shows raw data (week schedule, AI prompt) for diagnosis
9. **Settings integration** — Persona selector in Settings

## The Core Problem: The AI Gets Wrong Data

The AI narrative consistently describes rides that didn't happen. For a user with 1 completed ride (Wed Sweet Spot at 55 TSS), the coach says things like "four out of seven sessions done" or "three quality days." The week bar also shows wrong TSS values — e.g. 20, 80, 20, 55 when the planner shows 30, 105, 20, 70.

**The feature code works correctly** — the intake interview, AI generation, persona voice, recommendation system, accept/dismiss flow all function. The problem is entirely in the **data pipeline**: the context assembly queries return different data than what the planner displays.

---

## Root Causes Identified

### 1. `day_of_week` Is a Template Index, Not a Calendar Day

**File**: `src/hooks/useTrainingPlan.ts` lines 270-285

When a plan is activated, `day_of_week` is set to `dayIndex` (0-6 in the template loop), NOT the actual ISO day of the week. If the plan starts on Monday, `day_of_week=0` corresponds to Monday (not Sunday as the schema documents).

```typescript
const DAY_MAP = ['sunday', 'monday', 'tuesday', ...];
for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayName = DAY_MAP[dayIndex];  // Template's day
    scheduledDate.setDate(startDate.getDate() + dayIndex);
    day_of_week: dayIndex,  // Template index, NOT calendar day
    scheduled_date: scheduledDate,  // Actual calendar date (always correct)
}
```

**Current workaround**: Week bar and AI prompt derive day labels from `scheduled_date` using `Date.getDay()`. But this doesn't fix the underlying data.

### 2. `current_week` in DB Is Always 1 (Never Updated)

**File**: `src/hooks/useTrainingPlan.ts` line 249

Set to `1` at activation, never incremented. The planner calculates it dynamically:
```typescript
const diffDays = Math.floor((today - startDate) / 86400000);
const weekNum = Math.floor(diffDays / 7) + 1;
```

**Current fix**: Context assembly and week bar query now use the same dynamic formula. But this formula may produce a different result than expected — see Root Cause 3.

### 3. The Week Being Queried Doesn't Match the Planner (THE MAIN UNSOLVED BUG)

Despite using the same formula, the coach shows different TSS values than the planner. Evidence:

| Day | Planner Shows | Coach Shows |
|-----|-------------|------------|
| Tue | Easy 30 TSS | 20 TSS |
| Wed | Sweet Spot 105 TSS | 80 TSS |
| Fri | Endurance 70 TSS | 20 TSS |
| Sat | Threshold 90 TSS | 55 TSS |

These values are completely different — the coach is querying a **different set of planned_workouts rows** than the planner displays.

**Most likely explanation**: The dynamic week formula `Math.floor(diffDays / 7) + 1` calculates a different `week_number` than what corresponds to the planner's visible week. This happens because:
- The `started_at` timestamp may include time-of-day, causing an off-by-one day calculation
- The planner may use a different week boundary (Monday-start vs the formula's assumption)
- `week_number` in the DB may not align with weeks counted from `started_at`

**Recommended fix**: **Stop using `week_number` entirely.** Query by `scheduled_date` range instead:
```javascript
// Current week: Monday through Sunday
const today = new Date();
const dayOfWeek = today.getDay();
const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
const weekStart = new Date(today);
weekStart.setDate(today.getDate() + mondayOffset);
const weekEnd = new Date(weekStart);
weekEnd.setDate(weekStart.getDate() + 6);

const { data: workouts } = await supabase
  .from('planned_workouts')
  .select('...')
  .eq('plan_id', activePlan.id)
  .gte('scheduled_date', weekStart.toISOString().split('T')[0])
  .lte('scheduled_date', weekEnd.toISOString().split('T')[0])
  .order('scheduled_date', { ascending: true });
```

This completely bypasses `week_number` and `day_of_week`, relying only on `scheduled_date` which is the single source of truth that the planner also uses.

### 4. `planned_workouts.completed` and `activity_id` Are Unreliable

Three code paths set `completed = true`:
1. Manual activity linking — sets `completed` + `activity_id`
2. Hook linking — sets `completed` + `activity_id`
3. Toggle completion — sets `completed` WITHOUT `activity_id`

**Current fix**: Strict validation — only trust `completed` if `activity_id` resolves to a real row in `activities`. This works but only helps if the right week's data is being queried in the first place.

### 5. Database Migration Not Yet Run

Console shows 400 on `user_profiles?select=coaching_persona` — the `052_coach_check_in.sql` migration hasn't been executed. The feature uses localStorage fallbacks but DB storage is preferred for reliability.

---

## Files Reference

### Created Files

| File | Purpose |
|------|---------|
| `database/migrations/052_coach_check_in.sql` | Schema (persona fields, check_ins table, decisions table) |
| `src/types/checkIn.ts` | TypeScript types |
| `src/data/coachingPersonas.ts` | Persona definitions + prompt builder |
| `api/coach-classify-persona.js` | Persona classification endpoint (Claude Haiku) |
| `api/coach-check-in-generate.js` | Check-in generation endpoint (Claude Sonnet) |
| `api/utils/checkInContext.js` | Context assembly + prompt formatting |
| `src/hooks/useCoachCheckIn.ts` | Client hook (state, generation, decisions) |
| `src/components/coach/CheckInPage.tsx` | Main page component |
| `src/components/coach/CheckInWeekBar.tsx` | Week bar chart |
| `src/components/coach/CheckInNarrative.tsx` | Narrative display |
| `src/components/coach/CheckInRecommendation.tsx` | Recommendation card |
| `src/components/coach/CheckInAcknowledgment.tsx` | Post-decision response |
| `src/components/coach/IntakeInterview.tsx` | 5-question intake flow |
| `src/components/settings/CoachPersonaSettings.tsx` | Settings persona selector |

### Modified Files

| File | Change |
|------|---------|
| `src/pages/TrainingDashboard.jsx` | Added 'coach' tab (first/default), `keepMounted` |
| `src/pages/Settings.jsx` | Added `CoachPersonaSettings` component |

### Key Data Flow Files

| Concern | File | Key Lines |
|---------|------|-----------|
| Plan activation / workout creation | `src/hooks/useTrainingPlan.ts` | 209-296 |
| Template day mapping (`DAY_MAP`) | `src/hooks/useTrainingPlan.ts` | 47 |
| Current week calc (planner) | `src/hooks/useTrainingPlan.ts` | 972-982 |
| Planner store / data loading | `src/stores/trainingPlannerStore.ts` | full file |
| Coach context assembly | `api/utils/checkInContext.js` | 20-260 |
| Coach AI generation | `api/coach-check-in-generate.js` | 106-213 |
| Voice bible (persona source of truth) | `docs/tribos_voice_bible.md` | full file |

---

## What to Do Next

1. **Run the DB migration** (`052_coach_check_in.sql`) in Supabase
2. **Replace `week_number` queries with `scheduled_date` range queries** in both `api/utils/checkInContext.js` and `src/components/coach/CheckInPage.tsx` (see Root Cause 3 for the proposed query)
3. **Verify with the debug panel** — after Regenerate, expand "Show Coach Data (Debug)" and compare `raw_week_schedule` against the planner. The `target_tss` values should now match.
4. **Remove or gate the debug panel** once data is verified
