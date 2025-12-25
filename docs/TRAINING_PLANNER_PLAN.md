# Training Planner Implementation Plan

## Executive Summary

A new **TrainingPlanner** feature providing long-range planning (8-12 weeks) with a 2-week detail view, always-visible workout library sidebar, AI-powered week reviews, and planned vs actual comparisons. Built as a separate component from the existing TrainingCalendar.

---

## 1. Component Architecture

### New Files to Create

```
src/
  components/
    planner/
      TrainingPlanner.tsx              # Main container component
      PeriodizationView.tsx            # 8-12 week macro view
      TwoWeekCalendar.tsx              # Primary 2-week working view
      WorkoutLibrarySidebar.tsx        # Always-visible sidebar
      WorkoutCard.tsx                  # Draggable workout card
      CalendarDayCell.tsx              # Individual day in calendar
      PlannedVsActualBadge.tsx         # Comparison indicator
      AIReviewPanel.tsx                # AI suggestions display
      GoalInputPanel.tsx               # Goal selection/free-form
      WeekSummaryBar.tsx               # TSS/hours for each week
      PhaseIndicator.tsx               # Base/Build/Peak/Taper badges
      index.ts                         # Barrel export

  stores/
    trainingPlannerStore.ts            # Zustand store for planner state

  hooks/
    useTrainingPlanner.ts              # Custom hook wrapping store + API
    useDragDrop.ts                     # Reusable drag-drop logic

  types/
    planner.ts                         # Planner-specific types
```

### Component Hierarchy

```
TrainingPlanner (main container)
├── GoalInputPanel
│   ├── TemplateSelector
│   └── FreeFormGoalInput
├── PeriodizationView (8-12 week overview)
│   ├── WeekSummaryBar (per week)
│   └── PhaseIndicator
├── TwoWeekCalendar (primary working area)
│   ├── CalendarDayCell (x14)
│   │   ├── WorkoutCard (draggable)
│   │   ├── PlannedVsActualBadge
│   │   └── DropZone
│   └── WeekSummaryBar (x2)
├── WorkoutLibrarySidebar (always visible)
│   ├── WorkoutCategoryFilter
│   ├── WorkoutSearchInput
│   └── WorkoutCard (draggable, x many)
├── AIReviewPanel (shown after review click)
│   ├── ReviewMyWeekButton
│   └── AISuggestionCards
└── ActionBar
    ├── SaveButton
    ├── UndoButton
    └── ExportButton
```

---

## 2. State Management (Zustand Store)

### Store Structure

```typescript
interface TrainingPlannerState {
  // Plan context
  activePlanId: string | null;
  planStartDate: string | null;
  planDurationWeeks: number;
  currentPhase: 'base' | 'build' | 'peak' | 'taper' | 'recovery';

  // View state
  focusedWeekStart: string; // ISO date of first day of focused 2-week period
  selectedDate: string | null;

  // Data
  plannedWorkouts: Record<string, PlannedWorkout>; // keyed by date
  goals: Goal[];
  aiHints: AIHint[];

  // Sidebar state
  sidebarFilter: {
    category: string | null;
    searchQuery: string;
    difficulty: string | null;
  };

  // Drag state
  draggedWorkout: {
    source: 'library' | 'calendar';
    workoutId: string;
    sourceDate?: string;
  } | null;
  dropTargetDate: string | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  isReviewingWeek: boolean;
  hasUnsavedChanges: boolean;
}
```

### What Goes Where

| Zustand Store | Component Local State |
|---------------|----------------------|
| Planned workouts data | Hover states |
| Current focused week | Animation states |
| Drag source/target | Modal open/close |
| AI hints | Form input values |
| Goals list | Tooltip visibility |
| Sidebar filters | Transient UI |
| Loading/saving states | |

---

## 3. Database Changes

**No new tables required.** Existing schema fully supports this:

- **`training_plans`** - Plan metadata
- **`planned_workouts`** - Planned vs actual (has target_tss, actual_tss, etc.)
- **`race_goals`** - A/B/C priority goal races
- **`activities`** - Completed workout data

---

## 4. API Changes

### New Endpoint: `/api/review-week.js`

```javascript
// Accepts:
// - weekStart: string (ISO date)
// - plannedWorkouts: PlannedWorkout[]
// - completedActivities: Activity[]
// - userContext: { ftp, ctl, atl, tsb, raceGoals }

// Returns:
// - insights: AIHint[]
// - weeklyAnalysis: { plannedTSS, actualTSS, compliance, recommendations }
```

### Enhance `/api/coach.js`

Add `analyze_training_week` tool for structured insight responses.

---

## 5. UI Components

### TrainingPlanner.tsx (Main Container)

Layout:
- Left: WorkoutLibrarySidebar (280px fixed)
- Right: Main content
  - Top: GoalInputPanel (collapsible)
  - Middle: PeriodizationView (~120px)
  - Main: TwoWeekCalendar (flex-grow)
  - Bottom: AIReviewPanel (expandable)

### PeriodizationView.tsx

- 8-12 weeks as horizontal bars
- Phase badges (Base/Build/Peak/Taper)
- TSS per week visualization
- Click to navigate 2-week view

### TwoWeekCalendar.tsx

- 14-day grid (2 rows of 7)
- Drop zones for workouts
- Planned vs Actual overlays
- Week navigation arrows

### WorkoutLibrarySidebar.tsx

- Category filter tabs
- Search input
- Scrollable workout list
- Draggable workout cards

### AIReviewPanel.tsx

- "Review My Week" button
- Insight cards (suggestion/warning/praise)
- Apply/Dismiss actions

### GoalInputPanel.tsx

- Template selection mode
- Free-form goal input mode
- Target date picker
- Priority selector (A/B/C)

---

## 6. Drag-and-Drop Flow

### Library to Calendar

```
1. mousedown on WorkoutCard in sidebar
   → store.startDrag('library', workoutId)

2. dragover on CalendarDayCell
   → store.setDropTarget(date)
   → Highlight drop zone

3. drop on date
   → store.addWorkoutToDate(date, workoutId)
   → store.endDrag()
   → API: Create planned_workout (debounced)
```

### Calendar to Calendar (Move/Swap)

```
1. mousedown on WorkoutCard in calendar
   → store.startDrag('calendar', workoutId, sourceDate)

2. drop on different date
   → If target has workout: Swap
   → If target empty: Move
   → store.moveWorkout(sourceDate, targetDate)
```

---

## 7. AI Integration

### Review My Week Flow

```
User clicks "Review My Week"
         ↓
Collect Week Context:
  - Planned workouts (7 days)
  - Completed activities
  - CTL/ATL/TSB
  - FTP
  - Race goals
         ↓
Call /api/review-week
         ↓
AI Analysis:
  - Compare planned vs actual
  - Check TSS progression
  - Identify recovery needs
  - Suggest workout swaps
         ↓
Display insights as cards:
  - Suggestion cards
  - Warning cards
  - Praise cards
  - Apply/Dismiss actions
```

---

## 8. Implementation Phases

### Phase 1: Foundation
- Zustand store skeleton
- Type definitions
- TrainingPlanner container
- WorkoutLibrarySidebar (read-only)
- Basic TwoWeekCalendar (display)
- Route/tab in dashboard

**Deliverable:** Navigate to planner, see grid and sidebar

### Phase 2: Drag-and-Drop
- useDragDrop hook
- Drag capability on WorkoutCard
- Drop zones on CalendarDayCell
- Store actions for add/move/remove
- Supabase persistence
- Optimistic updates

**Deliverable:** Full drag-drop functionality

### Phase 3: Long-Range View
- PeriodizationView component
- Phase calculation
- Week summary bars
- Click-to-navigate
- PhaseIndicator badges

**Deliverable:** 8-12 week overview

### Phase 4: Goal Input & Templates
- GoalInputPanel with dual modes
- Template browser
- createPlanFromTemplate action
- Auto-periodization

**Deliverable:** Create plans from templates or goals

### Phase 5: AI Week Review
- /api/review-week.js endpoint
- analyze_training_week tool
- AIReviewPanel component
- Insight cards
- Apply/Dismiss actions

**Deliverable:** AI-powered week analysis

### Phase 6: Planned vs Actual
- PlannedVsActualBadge component
- Activity matching
- TSS comparison
- Compliance visualization

**Deliverable:** See planned vs done at a glance

### Phase 7: Polish
- Keyboard shortcuts
- Undo/redo
- Mobile responsiveness
- Error handling
- Tests

**Deliverable:** Production-ready feature

---

## 9. Key Existing Files to Reference

| File | Purpose |
|------|---------|
| `src/data/workoutLibrary.ts` | 100+ workout definitions |
| `src/hooks/useTrainingPlan.ts` | Plan management patterns |
| `src/components/TrainingCalendar.jsx` | Drag-drop implementation |
| `api/coach.js` | AI endpoint to enhance |
| `src/types/training.ts` | Type definitions |

---

## 10. Technical Considerations

- **Performance:** Virtualize workout list, memoize TSS calculations, debounce saves
- **Offline:** Store unsaved changes in localStorage
- **Type Safety:** Full TypeScript, strict mode
- **Testing:** Unit tests for store, E2E for drag-drop
