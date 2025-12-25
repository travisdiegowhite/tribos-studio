/**
 * Training Planner Type Definitions
 * Types for the drag-and-drop training planner with AI suggestions
 */

import type {
  WorkoutCategory,
  FitnessLevel,
  TrainingPhase,
  TrainingGoal,
  WorkoutDefinition,
} from './training';

// ============================================================
// PLANNED WORKOUT (for planner)
// ============================================================

export interface PlannerWorkout {
  id: string;
  scheduledDate: string; // ISO date string YYYY-MM-DD
  workoutId: string | null; // Reference to workout library
  workoutType: WorkoutCategory | 'rest' | null;
  targetTSS: number;
  targetDuration: number; // minutes
  notes: string;
  completed: boolean;
  completedAt: string | null;
  activityId: string | null;
  actualTSS: number | null;
  actualDuration: number | null;
  // Enriched from workout library
  workout?: WorkoutDefinition;
}

// ============================================================
// GOAL TYPES
// ============================================================

export interface PlannerGoal {
  id: string;
  type: 'template' | 'freeform';
  templateId?: string;
  name: string;
  description?: string;
  targetDate?: string; // ISO date
  priority: 'A' | 'B' | 'C';
  createdAt: string;
}

// ============================================================
// AI HINTS
// ============================================================

export type AIHintType = 'suggestion' | 'warning' | 'praise';

export interface AIHint {
  id: string;
  type: AIHintType;
  message: string;
  targetDate?: string; // Specific date this hint applies to
  suggestedWorkoutId?: string; // If suggesting a specific workout
  priority: 'high' | 'medium' | 'low';
  dismissed: boolean;
  appliedAt?: string;
}

export interface WeekReviewResult {
  insights: AIHint[];
  weeklyAnalysis: {
    plannedTSS: number;
    actualTSS: number;
    compliance: number;
    recommendations: string[];
  };
}

// ============================================================
// SIDEBAR FILTER
// ============================================================

export interface SidebarFilter {
  category: WorkoutCategory | null;
  searchQuery: string;
  difficulty: FitnessLevel | null;
}

// ============================================================
// DRAG STATE
// ============================================================

export type DragSource = 'library' | 'calendar';

export interface DragState {
  source: DragSource;
  workoutId: string;
  sourceDate?: string; // Only for calendar drags
}

// ============================================================
// PLANNER STATE (Zustand Store)
// ============================================================

export interface TrainingPlannerState {
  // Plan context
  activePlanId: string | null;
  planStartDate: string | null;
  planDurationWeeks: number;
  currentPhase: TrainingPhase | 'recovery';

  // View state
  focusedWeekStart: string; // ISO date of first day of focused 2-week period
  selectedDate: string | null;

  // Data
  plannedWorkouts: Record<string, PlannerWorkout>; // keyed by date
  goals: PlannerGoal[];
  aiHints: AIHint[];

  // Sidebar state
  sidebarFilter: SidebarFilter;

  // Drag state
  draggedWorkout: DragState | null;
  dropTargetDate: string | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  isReviewingWeek: boolean;

  // Dirty state for unsaved changes
  hasUnsavedChanges: boolean;
}

// ============================================================
// PLANNER ACTIONS
// ============================================================

export interface TrainingPlannerActions {
  // Navigation
  setFocusedWeek: (date: string) => void;
  selectDate: (date: string | null) => void;
  navigateWeeks: (direction: 'prev' | 'next') => void;

  // Workout operations
  addWorkoutToDate: (date: string, workoutId: string) => void;
  moveWorkout: (fromDate: string, toDate: string) => void;
  removeWorkout: (date: string) => void;
  updateWorkout: (date: string, updates: Partial<PlannerWorkout>) => void;

  // Drag operations
  startDrag: (source: DragSource, workoutId: string, sourceDate?: string) => void;
  setDropTarget: (date: string | null) => void;
  endDrag: () => void;

  // Sidebar
  setSidebarFilter: (filter: Partial<SidebarFilter>) => void;
  clearSidebarFilter: () => void;

  // AI
  requestWeekReview: (weekStart: string) => Promise<void>;
  dismissHint: (hintId: string) => void;
  applyHint: (hintId: string) => void;
  clearHints: () => void;

  // Goals
  addGoal: (goal: Omit<PlannerGoal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<PlannerGoal>) => void;
  removeGoal: (id: string) => void;

  // Persistence
  loadPlan: (planId: string) => Promise<void>;
  loadWorkoutsForDateRange: (startDate: string, endDate: string) => Promise<void>;
  savePendingChanges: () => Promise<void>;
  syncWithDatabase: () => Promise<void>;

  // Initialization
  initializeFromActivePlan: (
    planId: string,
    startDate: string,
    durationWeeks: number,
    workouts: PlannerWorkout[]
  ) => void;

  // Reset
  reset: () => void;
}

// ============================================================
// COMBINED STORE TYPE
// ============================================================

export type TrainingPlannerStore = TrainingPlannerState & TrainingPlannerActions;

// ============================================================
// WEEK SUMMARY
// ============================================================

export interface WeekSummary {
  weekNumber: number;
  startDate: string;
  endDate: string;
  phase: TrainingPhase;
  plannedTSS: number;
  actualTSS: number;
  workoutsPlanned: number;
  workoutsCompleted: number;
  compliance: number;
}

// ============================================================
// PERIODIZATION VIEW TYPES
// ============================================================

export interface PeriodizationWeek {
  weekNumber: number;
  startDate: string;
  phase: TrainingPhase;
  plannedTSS: number;
  isCurrentWeek: boolean;
  isFocused: boolean;
}

// ============================================================
// COMPONENT PROPS
// ============================================================

export interface TrainingPlannerProps {
  userId: string;
  activePlanId?: string;
  activities?: Array<{
    id: string;
    name?: string;
    type?: string;
    start_date: string;
    start_date_local?: string;
    moving_time?: number | null;
    duration_seconds?: number;
    average_watts?: number | null;
    distance?: number | null;
    total_elevation_gain?: number | null;
    tss?: number | null; // May not exist - calculated on the fly
    trainer?: boolean;
  }>;
  ftp?: number | null;
  onPlanUpdated?: () => void;
}

export interface WorkoutCardProps {
  workout: WorkoutDefinition;
  source: DragSource;
  sourceDate?: string;
  isCompact?: boolean;
  showDuration?: boolean;
  showTSS?: boolean;
  onDragStart?: (workoutId: string) => void;
  onDragEnd?: () => void;
}

export interface CalendarDayCellProps {
  date: string;
  plannedWorkout: PlannerWorkout | null;
  actualActivity?: {
    id: string;
    name?: string;
    type?: string;
    tss: number | null;
    duration_seconds: number;
    distance?: number | null;
    trainer?: boolean;
  };
  isToday: boolean;
  isDropTarget: boolean;
  onDrop: (date: string) => void;
  onRemoveWorkout: (date: string) => void;
  onClick: (date: string) => void;
}

export interface WorkoutLibrarySidebarProps {
  filter: SidebarFilter;
  onFilterChange: (filter: Partial<SidebarFilter>) => void;
  onDragStart: (workoutId: string) => void;
  onDragEnd: () => void;
}

export interface TwoWeekCalendarProps {
  startDate: string;
  workouts: Record<string, PlannerWorkout>;
  activities?: Record<string, {
    id: string;
    name?: string;
    type?: string;
    tss: number | null;
    duration_seconds: number;
    distance?: number | null;
    trainer?: boolean;
  }>;
  dropTargetDate: string | null;
  onDrop: (date: string) => void;
  onRemoveWorkout: (date: string) => void;
  onDateClick: (date: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}
