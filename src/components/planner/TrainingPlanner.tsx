/**
 * TrainingPlanner Component
 * Main container for the drag-and-drop training planner
 */

import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import {
  Box,
  Group,
  Stack,
  Text,
  Button,
  Paper,
  Loader,
  Alert,
  Badge,
  Divider,
  ActionIcon,
  Tooltip,
  Drawer,
  Affix,
  Transition,
  Menu,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconBrain,
  IconDeviceFloppy,
  IconRefresh,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconBulb,
  IconAlertTriangle,
  IconThumbUp,
  IconBarbell,
  IconDotsVertical,
  IconCalendarOff,
  IconSettings,
} from '@tabler/icons-react';
import { WorkoutLibrarySidebar } from './WorkoutLibrarySidebar';
import { TwoWeekCalendar } from './TwoWeekCalendar';
import { PeriodizationView } from './PeriodizationView';
import { AvailabilitySettings } from '../settings/AvailabilitySettings';
import { AdaptationFeedbackModal } from './AdaptationFeedbackModal';
import { AdaptationInsightsPanel } from './AdaptationInsightsPanel';
import RaceGoalsPanel from '../RaceGoalsPanel';
import { supabase } from '../../lib/supabase';
import { useTrainingPlannerStore } from '../../stores/trainingPlannerStore';
import { useUserAvailability } from '../../hooks/useUserAvailability';
import { useWorkoutAdaptations } from '../../hooks/useWorkoutAdaptations';
import { getWorkoutById } from '../../data/workoutLibrary';
import { calculateTSS, estimateTSS } from '../../utils/trainingPlans';
import { shouldPromptForFeedback, triggerAdaptationDetection } from '../../utils/adaptationTrigger';
import type { TrainingPlannerProps } from '../../types/planner';
import type { ResolvedAvailability, AvailabilityStatus, WorkoutAdaptation, AdaptationReason } from '../../types/training';

// Helper to format date as YYYY-MM-DD in local timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to extract local date string from activity
function getLocalDateString(activity: { start_date_local?: string; start_date: string }): string {
  // Prefer start_date_local if available
  if (activity.start_date_local) {
    // Handle various formats: ISO string, timestamp, or date-only
    const dateStr = String(activity.start_date_local);
    // If it contains 'T', split to get date portion
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    // If it's just a date string already
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    // Parse as Date and format
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
  }

  // Fallback to start_date - parse as Date and get local date components
  const activityDate = new Date(activity.start_date);
  if (isNaN(activityDate.getTime())) {
    console.warn('Invalid activity date:', activity.start_date);
    return '';
  }
  return formatLocalDate(activityDate);
}

// Helper to calculate or estimate TSS from activity
function getActivityTSS(
  activity: {
    average_watts?: number | null;
    moving_time?: number | null;
    distance?: number | null;
    total_elevation_gain?: number | null;
  },
  ftp: number | null | undefined
): number | null {
  // Try power-based TSS first
  if (activity.average_watts && activity.moving_time && ftp) {
    return calculateTSS(activity.moving_time, activity.average_watts, ftp);
  }

  // Fall back to estimation from duration/distance/elevation
  if (activity.moving_time) {
    const durationMinutes = activity.moving_time / 60;
    const distanceKm = (activity.distance || 0) / 1000;
    const elevation = activity.total_elevation_gain || 0;
    return estimateTSS(durationMinutes, distanceKm, elevation, 'endurance');
  }

  return null;
}

// Race goal type from database
interface RaceGoal {
  id: string;
  race_date: string;
  name: string;
  race_type: string;
  priority: 'A' | 'B' | 'C';
  distance_km?: number;
  elevation_gain_m?: number;
  location?: string;
  goal_time_minutes?: number;
  goal_power_watts?: number;
  goal_placement?: string;
  notes?: string;
  course_description?: string;
  status: string;
}

export function TrainingPlanner({
  userId,
  activePlanId,
  activities = [],
  ftp,
  onPlanUpdated,
}: TrainingPlannerProps) {
  const store = useTrainingPlannerStore();

  // Mobile detection
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  // Mobile sidebar drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Availability settings drawer state
  const [availabilitySettingsOpen, setAvailabilitySettingsOpen] = useState(false);

  // Selected workout for tap-to-assign on mobile
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  // Race goals state (synced with database)
  const [raceGoals, setRaceGoals] = useState<RaceGoal[]>([]);
  const [raceGoalsLoading, setRaceGoalsLoading] = useState(true);

  // Adaptation feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedAdaptation, setSelectedAdaptation] = useState<WorkoutAdaptation | null>(null);

  // Workout adaptations hook
  const {
    adaptations,
    insights,
    loading: adaptationsLoading,
    fetchAdaptations,
    getWeekSummary,
    updateAdaptationFeedback,
    dismissInsight,
    applyInsight,
  } = useWorkoutAdaptations({ userId });

  // Week summary state
  const [weekSummary, setWeekSummary] = useState<Awaited<ReturnType<typeof getWeekSummary>>>(null);

  // Track which activities have been processed for auto-linking (to prevent duplicates)
  const autoLinkedActivitiesRef = useRef<Set<string>>(new Set());

  // User availability hook
  const {
    weeklyAvailability,
    dateOverrides,
    getAvailabilityForDate,
    setDateOverride,
    loading: availabilityLoading,
  } = useUserAvailability({ userId, autoLoad: true });

  // Convert activities array to record keyed by date (using local timezone)
  const activitiesByDate = useMemo(() => {
    const result: Record<string, {
      id: string;
      name?: string;
      type?: string;
      tss: number | null;
      duration_seconds: number;
      distance?: number | null;
      trainer?: boolean;
      isLinked?: boolean;
    }> = {};

    // Debug logging in development
    if (process.env.NODE_ENV === 'development' && activities.length > 0) {
      console.log('[TrainingPlanner] Processing', activities.length, 'activities');
    }

    for (const activity of activities) {
      // Use local date string (prefers start_date_local if available)
      const date = getLocalDateString(activity);

      // Skip activities with invalid dates
      if (!date) {
        console.warn('[TrainingPlanner] Skipping activity with invalid date:', activity.id);
        continue;
      }

      // Calculate TSS from power data or estimate from duration/distance
      const tss = getActivityTSS(activity, ftp);
      const duration = activity.moving_time || activity.duration_seconds || 0;

      // Check if this activity is already linked to a planned workout
      const plannedWorkout = store.plannedWorkouts[date];
      const isLinked = plannedWorkout?.activityId === activity.id;

      // Take the activity with highest TSS for the day
      if (!result[date] || (tss || 0) > (result[date].tss || 0)) {
        result[date] = {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          tss,
          duration_seconds: duration,
          distance: activity.distance,
          trainer: activity.trainer,
          isLinked,
        };
      }
    }

    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      const dateKeys = Object.keys(result);
      if (dateKeys.length > 0) {
        console.log('[TrainingPlanner] activitiesByDate keys:', dateKeys.slice(0, 10), dateKeys.length > 10 ? `... (${dateKeys.length} total)` : '');
      }
    }

    return result;
  }, [activities, ftp, store.plannedWorkouts]);

  // Build availability by date for the current 2-week view
  const availabilityByDate = useMemo(() => {
    const result: Record<string, ResolvedAvailability> = {};

    if (!store.focusedWeekStart) return result;

    // Generate 14 days from the focused week start
    const start = new Date(store.focusedWeekStart + 'T12:00:00');
    for (let i = 0; i < 14; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = formatLocalDate(date);
      result[dateStr] = getAvailabilityForDate(dateStr);
    }

    return result;
  }, [store.focusedWeekStart, weeklyAvailability, dateOverrides, getAvailabilityForDate]);

  // Handle setting availability from calendar context menu
  const handleSetAvailability = useCallback(
    async (date: string, status: AvailabilityStatus) => {
      await setDateOverride({ date, status });
    },
    [setDateOverride]
  );

  // Load plan on mount or when activePlanId changes
  useEffect(() => {
    if (activePlanId && activePlanId !== store.activePlanId) {
      store.loadPlan(activePlanId);
    }
  }, [activePlanId, store.activePlanId]);

  // Load race goals from database
  const loadRaceGoals = useCallback(async () => {
    if (!userId) return;

    setRaceGoalsLoading(true);
    try {
      const { data, error } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('race_date', { ascending: true });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('race_goals table not yet available');
          return;
        }
        throw error;
      }

      setRaceGoals(data || []);
    } catch (err) {
      console.error('Failed to load race goals:', err);
    } finally {
      setRaceGoalsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRaceGoals();
  }, [loadRaceGoals]);

  // Fetch adaptations and week summary when focused week changes
  useEffect(() => {
    if (!userId || !store.focusedWeekStart) return;

    const weekStart = store.focusedWeekStart;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 14); // Fetch 2 weeks

    // Fetch adaptations for the visible date range
    fetchAdaptations({
      weekStart,
      weekEnd: weekEnd.toISOString().split('T')[0],
    });

    // Fetch week summary
    getWeekSummary(weekStart).then(setWeekSummary);
  }, [userId, store.focusedWeekStart, fetchAdaptations, getWeekSummary]);

  // Check for adaptations that need feedback
  useEffect(() => {
    if (adaptations.length === 0) return;

    // Find the most recent adaptation that needs feedback
    const needsFeedback = adaptations.find(
      (a) => !a.userFeedback.reason && shouldPromptForFeedback(a)
    );

    if (needsFeedback && !feedbackModalOpen) {
      setSelectedAdaptation(needsFeedback);
      setFeedbackModalOpen(true);
    }
  }, [adaptations, feedbackModalOpen]);

  // Auto-link activities to planned workouts when they match by date
  // This runs when activities or planned workouts change
  useEffect(() => {
    if (!userId || activities.length === 0) return;

    const autoLinkActivities = async () => {
      const plannedWorkouts = store.plannedWorkouts;
      const workoutsToLink: { workoutId: string; activityId: string; activity: typeof activities[0] }[] = [];

      // Find activities that have a matching planned workout on the same day
      for (const activity of activities) {
        // Skip if we've already processed this activity
        if (autoLinkedActivitiesRef.current.has(activity.id)) continue;

        const date = getLocalDateString(activity);
        if (!date) continue;

        const plannedWorkout = plannedWorkouts[date];

        // Check if there's a planned workout that isn't already linked
        if (plannedWorkout && plannedWorkout.id && !plannedWorkout.activityId) {
          // Only auto-link cycling activities
          const activityType = activity.type?.toLowerCase() || '';
          const isCycling = activityType.includes('ride') || activityType.includes('cycling');

          if (isCycling) {
            workoutsToLink.push({
              workoutId: plannedWorkout.id,
              activityId: activity.id,
              activity,
            });
          }
        }
      }

      // Link each matching pair
      for (const { workoutId, activityId, activity } of workoutsToLink) {
        // Mark as processed to prevent re-linking
        autoLinkedActivitiesRef.current.add(activityId);

        try {
          const actualTss = getActivityTSS(activity, ftp);
          const actualDuration = activity.moving_time
            ? Math.round(activity.moving_time / 60)
            : null;

          const { error } = await supabase
            .from('planned_workouts')
            .update({
              activity_id: activityId,
              completed: true,
              completed_at: new Date().toISOString(),
              actual_tss: actualTss,
              actual_duration: actualDuration,
            })
            .eq('id', workoutId);

          if (error) {
            console.error('[TrainingPlanner] Auto-link failed:', error);
            continue;
          }

          console.log('[TrainingPlanner] Auto-linked activity', activityId, 'to workout', workoutId);

          // Trigger adaptation detection (async, non-blocking)
          triggerAdaptationDetection(userId, workoutId, activityId).then((result) => {
            if (result.success && result.adaptation) {
              console.log('[TrainingPlanner] Adaptation detected:', result.adaptation.adaptationType);
            }
          });
        } catch (err) {
          console.error('[TrainingPlanner] Auto-link error:', err);
        }
      }

      // Refresh store if we linked anything
      if (workoutsToLink.length > 0) {
        await store.syncWithDatabase();
        // Refresh adaptations
        if (store.focusedWeekStart) {
          fetchAdaptations({ weekStart: store.focusedWeekStart });
        }
      }
    };

    autoLinkActivities();
  }, [userId, activities, store.plannedWorkouts, ftp, store, fetchAdaptations]);

  // Handle adaptation feedback submission
  const handleAdaptationFeedback = useCallback(
    async (reason: AdaptationReason, notes: string) => {
      if (!selectedAdaptation) return;
      await updateAdaptationFeedback(selectedAdaptation.id, { reason, notes });
      setFeedbackModalOpen(false);
      setSelectedAdaptation(null);
    },
    [selectedAdaptation, updateAdaptationFeedback]
  );

  // Handle viewing an adaptation from the insights panel
  const handleViewAdaptation = useCallback((adaptation: WorkoutAdaptation) => {
    setSelectedAdaptation(adaptation);
    setFeedbackModalOpen(true);
  }, []);

  // Handle dismissing an insight
  const handleDismissInsight = useCallback(
    (insightId: string) => {
      dismissInsight(insightId);
    },
    [dismissInsight]
  );

  // Handle applying an insight (would need to integrate with store for actual workout changes)
  const handleApplyInsight = useCallback(
    async (insightId: string) => {
      const insight = insights.find((i) => i.id === insightId);
      if (!insight?.suggestedAction) return;

      // Mark as applied
      await applyInsight(insightId);

      // TODO: Implement actual workout modifications based on suggestedAction.type
      // For now, just mark as applied - the actual changes would need to be
      // integrated with the training planner store
      console.log('Applied insight action:', insight.suggestedAction);
    },
    [insights, applyInsight]
  );

  // Handle linking an activity to a planned workout
  const handleLinkActivity = useCallback(
    async (workoutId: string, activityId: string) => {
      if (!userId) return;

      try {
        // Get the activity details
        const activity = activities.find((a) => a.id === activityId);
        if (!activity) {
          console.error('Activity not found:', activityId);
          return;
        }

        // Calculate actual TSS
        const actualTss = getActivityTSS(activity, ftp);
        const actualDuration = activity.moving_time
          ? Math.round(activity.moving_time / 60)
          : null;

        // Update the planned workout in the database
        const { error } = await supabase
          .from('planned_workouts')
          .update({
            activity_id: activityId,
            completed: true,
            completed_at: new Date().toISOString(),
            actual_tss: actualTss,
            actual_duration: actualDuration,
          })
          .eq('id', workoutId);

        if (error) throw error;

        // Trigger adaptation detection (async, non-blocking)
        triggerAdaptationDetection(userId, workoutId, activityId).then(
          (result) => {
            if (result.success && result.adaptation) {
              console.log(
                '[TrainingPlanner] Adaptation detected:',
                result.adaptation.adaptationType
              );
              // Refresh adaptations to show in UI
              if (store.focusedWeekStart) {
                fetchAdaptations({ weekStart: store.focusedWeekStart });
              }
            }
          }
        );

        // Refresh the store to show updated state
        await store.syncWithDatabase();
        console.log('[TrainingPlanner] Activity linked successfully');
      } catch (err) {
        console.error('[TrainingPlanner] Failed to link activity:', err);
      }
    },
    [userId, activities, ftp, store, fetchAdaptations]
  );

  // Convert race goals to map by date for calendar display
  const raceGoalsByDate = useMemo(() => {
    const result: Record<string, RaceGoal> = {};
    for (const goal of raceGoals) {
      if (goal.race_date) {
        result[goal.race_date] = goal;
      }
    }
    return result;
  }, [raceGoals]);

  // Handle drag start from sidebar
  const handleDragStart = useCallback(
    (workoutId: string, source: 'library' | 'calendar', sourceDate?: string) => {
      store.startDrag(source, workoutId, sourceDate);
    },
    [store]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    store.endDrag();
  }, [store]);

  // Handle drop on calendar
  const handleDrop = useCallback(
    (date: string) => {
      const { draggedWorkout } = store;
      if (!draggedWorkout) return;

      if (draggedWorkout.source === 'library') {
        store.addWorkoutToDate(date, draggedWorkout.workoutId);
      } else if (draggedWorkout.sourceDate) {
        store.moveWorkout(draggedWorkout.sourceDate, date);
      }

      store.endDrag();
    },
    [store]
  );

  // Handle drag over
  const handleDragOver = useCallback(
    (date: string) => {
      store.setDropTarget(date);
    },
    [store]
  );

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    store.setDropTarget(null);
  }, [store]);

  // Handle week review
  const handleWeekReview = useCallback(() => {
    store.requestWeekReview(store.focusedWeekStart);
  }, [store]);

  // Handle save
  const handleSave = useCallback(async () => {
    await store.savePendingChanges();
    onPlanUpdated?.();
  }, [store, onPlanUpdated]);

  // Handle week click from periodization view
  const handleWeekClick = useCallback(
    (weekStart: string) => {
      store.setFocusedWeek(weekStart);
    },
    [store]
  );

  // Handle workout selection for mobile tap-to-assign
  const handleWorkoutSelect = useCallback((workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setSidebarOpen(false); // Close drawer after selection
  }, []);

  // Handle date tap for mobile tap-to-assign
  const handleDateTap = useCallback((date: string) => {
    if (selectedWorkoutId) {
      store.addWorkoutToDate(date, selectedWorkoutId);
      setSelectedWorkoutId(null); // Clear selection after assignment
    } else {
      store.selectDate(date);
    }
  }, [selectedWorkoutId, store]);

  // Cancel workout selection
  const handleCancelSelection = useCallback(() => {
    setSelectedWorkoutId(null);
  }, []);

  // Filter out dismissed hints
  const activeHints = useMemo(() => {
    return store.aiHints.filter((h) => !h.dismissed);
  }, [store.aiHints]);

  if (store.isLoading) {
    return (
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
        }}
      >
        <Loader color="lime" />
      </Box>
    );
  }

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        height: isMobile ? 'auto' : 'calc(100vh - 200px)',
        minHeight: isMobile ? 'auto' : 600,
      }}
    >
      {/* Workout Library Sidebar - Desktop */}
      {!isMobile && (
        <WorkoutLibrarySidebar
          filter={store.sidebarFilter}
          onFilterChange={store.setSidebarFilter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* Workout Library Drawer - Mobile */}
      <Drawer
        opened={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="Workout Library"
        position="bottom"
        size="85%"
        styles={{
          body: { padding: 0, height: '100%' },
          content: { backgroundColor: 'var(--mantine-color-dark-7)' },
          header: { backgroundColor: 'var(--mantine-color-dark-7)' },
        }}
      >
        <WorkoutLibrarySidebar
          filter={store.sidebarFilter}
          onFilterChange={store.setSidebarFilter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onWorkoutTap={handleWorkoutSelect}
          isMobile
        />
      </Drawer>

      {/* Availability Settings Drawer */}
      <Drawer
        opened={availabilitySettingsOpen}
        onClose={() => setAvailabilitySettingsOpen(false)}
        title="Training Availability"
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? '90%' : 'lg'}
        styles={{
          body: { padding: 16, height: '100%', overflowY: 'auto' },
          content: { backgroundColor: 'var(--mantine-color-dark-7)' },
          header: { backgroundColor: 'var(--mantine-color-dark-7)' },
        }}
      >
        <AvailabilitySettings
          userId={userId}
          onAvailabilityChange={() => {
            // Availability changed - could trigger reshuffle prompt here
          }}
        />
      </Drawer>

      {/* Main Content Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <Box
          p="sm"
          style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              {!isMobile && (
                <Text size="lg" fw={600}>
                  Training Planner
                </Text>
              )}
              {store.hasUnsavedChanges && (
                <Badge color="yellow" variant="light" size="sm">
                  {isMobile ? 'Unsaved' : 'Unsaved changes'}
                </Badge>
              )}
            </Group>

            {/* Desktop actions */}
            {!isMobile && (
              <Group gap="xs">
                <Tooltip label="Set your training availability">
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconCalendarOff size={14} />}
                    onClick={() => setAvailabilitySettingsOpen(true)}
                  >
                    Availability
                  </Button>
                </Tooltip>

                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => store.syncWithDatabase()}
                >
                  Refresh
                </Button>

                <Button
                  variant="light"
                  size="xs"
                  color="lime"
                  leftSection={<IconBrain size={14} />}
                  onClick={handleWeekReview}
                  loading={store.isReviewingWeek}
                >
                  Review My Week
                </Button>

                {store.hasUnsavedChanges && (
                  <Button
                    variant="filled"
                    size="xs"
                    color="lime"
                    leftSection={<IconDeviceFloppy size={14} />}
                    onClick={handleSave}
                    loading={store.isSaving}
                  >
                    Save Changes
                  </Button>
                )}
              </Group>
            )}

            {/* Mobile actions menu */}
            {isMobile && (
              <Group gap={4}>
                {store.hasUnsavedChanges && (
                  <ActionIcon
                    variant="filled"
                    color="lime"
                    onClick={handleSave}
                    loading={store.isSaving}
                  >
                    <IconDeviceFloppy size={18} />
                  </ActionIcon>
                )}
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon variant="subtle">
                      <IconDotsVertical size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconCalendarOff size={14} />}
                      onClick={() => setAvailabilitySettingsOpen(true)}
                    >
                      Availability Settings
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => store.syncWithDatabase()}
                    >
                      Refresh
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconBrain size={14} />}
                      onClick={handleWeekReview}
                    >
                      Review My Week
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            )}
          </Group>
        </Box>

        {/* Calendar Area */}
        <Box style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* Long-range Periodization View */}
          <PeriodizationView
            planStartDate={store.planStartDate}
            planDurationWeeks={store.planDurationWeeks}
            focusedWeekStart={store.focusedWeekStart}
            plannedWorkouts={store.plannedWorkouts}
            activities={activitiesByDate}
            onWeekClick={handleWeekClick}
          />

          {/* Race Goals - synced with database */}
          <Box mt="md">
            <RaceGoalsPanel
              isImperial={false}
              onRaceGoalChange={loadRaceGoals}
              compact={false}
            />
          </Box>

          {/* Two-week Detail View */}
          <Box mt="md">
            <TwoWeekCalendar
              startDate={store.focusedWeekStart}
              workouts={store.plannedWorkouts}
              activities={activitiesByDate}
              raceGoals={raceGoalsByDate}
              dropTargetDate={store.dropTargetDate}
              availabilityByDate={availabilityByDate}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onRemoveWorkout={store.removeWorkout}
              onDateClick={isMobile ? handleDateTap : store.selectDate}
              onNavigate={store.navigateWeeks}
              onSetAvailability={handleSetAvailability}
              onLinkActivity={handleLinkActivity}
              isMobile={isMobile}
              selectedWorkoutId={selectedWorkoutId}
            />
          </Box>
        </Box>

        {/* Mobile FAB to open workout library */}
        {isMobile && (
          <Affix position={{ bottom: 20, right: 20 }}>
            <Transition transition="slide-up" mounted>
              {(transitionStyles) => (
                <ActionIcon
                  size={56}
                  radius="xl"
                  color="lime"
                  variant="filled"
                  style={transitionStyles}
                  onClick={() => setSidebarOpen(true)}
                >
                  <IconBarbell size={28} />
                </ActionIcon>
              )}
            </Transition>
          </Affix>
        )}

        {/* Mobile workout selection banner */}
        {isMobile && selectedWorkoutId && (
          <Box
            p="sm"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'var(--mantine-color-lime-9)',
              borderTop: '2px solid var(--mantine-color-lime-5)',
              zIndex: 100,
            }}
          >
            <Group justify="space-between">
              <Group gap="xs">
                <IconBarbell size={18} />
                <Text size="sm" fw={500}>
                  Tap a day to add workout
                </Text>
              </Group>
              <Button
                size="xs"
                variant="white"
                color="dark"
                onClick={handleCancelSelection}
              >
                Cancel
              </Button>
            </Group>
          </Box>
        )}

        {/* Adaptation Insights Panel - Shows week summary, adaptations, and AI insights */}
        <AdaptationInsightsPanel
          weekStart={store.focusedWeekStart}
          adaptations={adaptations}
          insights={insights}
          weekSummary={weekSummary}
          onDismissInsight={handleDismissInsight}
          onApplyInsight={handleApplyInsight}
          onViewAdaptation={handleViewAdaptation}
          isLoading={adaptationsLoading}
        />

        {/* Legacy AI Hints Panel (from week review) */}
        {activeHints.length > 0 && (
          <Box
            p="sm"
            style={{
              borderTop: '1px solid var(--mantine-color-dark-4)',
              backgroundColor: 'var(--mantine-color-dark-7)',
            }}
          >
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <IconBulb size={16} color="var(--mantine-color-yellow-5)" />
                <Text size="sm" fw={500}>
                  AI Suggestions
                </Text>
              </Group>
              <Button
                variant="subtle"
                size="xs"
                onClick={store.clearHints}
              >
                Clear all
              </Button>
            </Group>

            <Stack gap="xs">
              {activeHints.map((hint) => (
                <Paper
                  key={hint.id}
                  p="xs"
                  withBorder
                  style={{
                    borderLeft: `3px solid var(--mantine-color-${
                      hint.type === 'warning'
                        ? 'orange'
                        : hint.type === 'praise'
                        ? 'green'
                        : 'blue'
                    }-5)`,
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      {hint.type === 'warning' && (
                        <IconAlertTriangle size={16} color="var(--mantine-color-orange-5)" />
                      )}
                      {hint.type === 'praise' && (
                        <IconThumbUp size={16} color="var(--mantine-color-green-5)" />
                      )}
                      {hint.type === 'suggestion' && (
                        <IconBulb size={16} color="var(--mantine-color-blue-5)" />
                      )}
                      <Text size="sm">{hint.message}</Text>
                    </Group>

                    <Group gap={4}>
                      {hint.suggestedWorkoutId && (
                        <Tooltip label="Apply suggestion">
                          <ActionIcon
                            size="sm"
                            color="green"
                            variant="subtle"
                            onClick={() => store.applyHint(hint.id)}
                          >
                            <IconCheck size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Dismiss">
                        <ActionIcon
                          size="sm"
                          color="gray"
                          variant="subtle"
                          onClick={() => store.dismissHint(hint.id)}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* No plan message */}
        {!activePlanId && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="No Active Plan"
            color="yellow"
            m="md"
          >
            You don't have an active training plan. You can still drag workouts onto the calendar
            to plan individual weeks, or go to the Plans tab to activate a structured training plan.
          </Alert>
        )}
      </Box>

      {/* Adaptation Feedback Modal */}
      <AdaptationFeedbackModal
        adaptation={selectedAdaptation}
        opened={feedbackModalOpen}
        onClose={() => {
          setFeedbackModalOpen(false);
          setSelectedAdaptation(null);
        }}
        onSubmit={handleAdaptationFeedback}
      />
    </Box>
  );
}

export default TrainingPlanner;

