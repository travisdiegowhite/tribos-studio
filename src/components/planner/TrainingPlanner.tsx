/**
 * TrainingPlanner Component
 * Main container for the drag-and-drop training planner
 */

import { useEffect, useMemo, useCallback } from 'react';
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
} from '@mantine/core';
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
} from '@tabler/icons-react';
import { WorkoutLibrarySidebar } from './WorkoutLibrarySidebar';
import { TwoWeekCalendar } from './TwoWeekCalendar';
import { PeriodizationView } from './PeriodizationView';
import { GoalInput } from './GoalInput';
import { useTrainingPlannerStore } from '../../stores/trainingPlannerStore';
import { getWorkoutById } from '../../data/workoutLibrary';
import { calculateTSS, estimateTSS } from '../../utils/trainingPlans';
import type { TrainingPlannerProps } from '../../types/planner';

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

export function TrainingPlanner({
  userId,
  activePlanId,
  activities = [],
  ftp,
  onPlanUpdated,
}: TrainingPlannerProps) {
  const store = useTrainingPlannerStore();

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
  }, [activities, ftp]);

  // Load plan on mount or when activePlanId changes
  useEffect(() => {
    if (activePlanId && activePlanId !== store.activePlanId) {
      store.loadPlan(activePlanId);
    }
  }, [activePlanId, store.activePlanId]);

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
        height: 'calc(100vh - 200px)',
        minHeight: 600,
      }}
    >
      {/* Workout Library Sidebar */}
      <WorkoutLibrarySidebar
        filter={store.sidebarFilter}
        onFilterChange={store.setSidebarFilter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />

      {/* Main Content Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <Box
          p="sm"
          style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
        >
          <Group justify="space-between">
            <Group gap="xs">
              <Text size="lg" fw={600}>
                Training Planner
              </Text>
              {store.hasUnsavedChanges && (
                <Badge color="yellow" variant="light" size="sm">
                  Unsaved changes
                </Badge>
              )}
            </Group>

            <Group gap="xs">
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

          {/* Goal Input */}
          <Box mt="md">
            <GoalInput
              goals={store.goals}
              onAddGoal={store.addGoal}
              onRemoveGoal={store.removeGoal}
              onUpdateGoal={store.updateGoal}
            />
          </Box>

          {/* Two-week Detail View */}
          <Box mt="md">
            <TwoWeekCalendar
            startDate={store.focusedWeekStart}
            workouts={store.plannedWorkouts}
            activities={activitiesByDate}
            dropTargetDate={store.dropTargetDate}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onRemoveWorkout={store.removeWorkout}
            onDateClick={store.selectDate}
            onNavigate={store.navigateWeeks}
            />
          </Box>
        </Box>

        {/* AI Hints Panel */}
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
    </Box>
  );
}

export default TrainingPlanner;

