/**
 * TwoWeekCalendar Component
 * 2-week (14-day) calendar view for the training planner
 * Responsive: Mobile uses Week Summary + Day Detail pattern, Desktop shows full 2-week grid
 */

import { useMemo, useState } from 'react';
import { Box, Group, Text, ActionIcon, SimpleGrid, Paper, Badge, SegmentedControl, Stack, UnstyledButton, Tooltip, ThemeIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconFlame, IconCheck, IconX, IconBike, IconHome, IconPlus, IconArrowUp, IconArrowDown, IconClock, IconRoute, IconCalendarOff, IconStar, IconTrophy } from '@tabler/icons-react';
import { CalendarDayCell } from './CalendarDayCell';
import { WorkoutCard } from './WorkoutCard';
import { WorkoutDetailModal } from './WorkoutDetailModal';
import type { PlannerWorkout } from '../../types/planner';
import type { ResolvedAvailability, AvailabilityStatus, WorkoutDefinition } from '../../types/training';

// Race goal type for calendar display
interface RaceGoal {
  id: string;
  race_date: string;
  name: string;
  race_type: string;
  priority: 'A' | 'B' | 'C';
  distance_km?: number;
  location?: string;
}

// Race type display info
const RACE_TYPE_INFO: Record<string, { icon: string; label: string }> = {
  road_race: { icon: '🚴', label: 'Road Race' },
  criterium: { icon: '🔄', label: 'Criterium' },
  time_trial: { icon: '⏱️', label: 'Time Trial' },
  gran_fondo: { icon: '🏔️', label: 'Gran Fondo' },
  century: { icon: '💯', label: 'Century' },
  gravel: { icon: '🪨', label: 'Gravel' },
  cyclocross: { icon: '🌲', label: 'Cyclocross' },
  mtb: { icon: '🏔️', label: 'MTB' },
  triathlon: { icon: '🏊', label: 'Triathlon' },
  other: { icon: '🎯', label: 'Event' },
};

interface TwoWeekCalendarProps {
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
    isLinked?: boolean;
  }>;
  raceGoals?: Record<string, RaceGoal>;
  dropTargetDate: string | null;
  availabilityByDate?: Record<string, ResolvedAvailability>;
  onDrop: (date: string) => void;
  onDragOver: (date: string) => void;
  onDragLeave: () => void;
  onRemoveWorkout: (date: string) => void;
  onDateClick: (date: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSetAvailability?: (date: string, status: AvailabilityStatus) => void;
  onLinkActivity?: (workoutId: string, activityId: string) => void;
  linkingWorkoutId?: string | null; // Which workout is currently being linked (for loading state)
  isMobile?: boolean;
  selectedWorkoutId?: string | null; // For mobile tap-to-assign visual feedback
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Helper to format date as YYYY-MM-DD in local timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to parse YYYY-MM-DD string as local date (not UTC)
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper to format duration (seconds to human readable)
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Helper to format distance (meters to miles)
function formatDistance(meters: number | null | undefined): string {
  if (!meters) return '';
  const mi = (meters / 1000) * 0.621371;
  return `${mi.toFixed(1)} mi`;
}

// Helper to get activity type display info
function getActivityTypeInfo(type?: string, trainer?: boolean): { label: string; color: string; isIndoor: boolean } {
  const isIndoor = trainer || type === 'VirtualRide' || type?.toLowerCase().includes('indoor');
  if (isIndoor) return { label: 'Indoor', color: 'grape', isIndoor: true };
  switch (type) {
    case 'Ride': return { label: 'Ride', color: 'blue', isIndoor: false };
    case 'GravelRide': return { label: 'Gravel', color: 'orange', isIndoor: false };
    case 'MountainBikeRide': return { label: 'MTB', color: 'teal', isIndoor: false };
    case 'EBikeRide': return { label: 'E-Bike', color: 'cyan', isIndoor: false };
    default: return { label: type || 'Activity', color: 'blue', isIndoor: false };
  }
}

// Day status type for mobile compact view
type DayStatus = 'empty' | 'planned' | 'done' | 'partial' | 'missed';

export function TwoWeekCalendar({
  startDate,
  workouts,
  activities = {},
  raceGoals = {},
  dropTargetDate,
  availabilityByDate = {},
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveWorkout,
  onDateClick,
  onNavigate,
  onSetAvailability,
  onLinkActivity,
  linkingWorkoutId = null,
  isMobile = false,
  selectedWorkoutId = null,
}: TwoWeekCalendarProps) {
  // For mobile: track which week is currently shown (1 or 2)
  const [mobileWeek, setMobileWeek] = useState<'1' | '2'>('1');
  // For mobile: track which day is selected for detail view (index 0-6 within current week)
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  // Workout detail modal state
  const [detailWorkout, setDetailWorkout] = useState<WorkoutDefinition | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Handle workout click to open detail modal
  const handleWorkoutClick = (workout: WorkoutDefinition) => {
    setDetailWorkout(workout);
    setDetailModalOpen(true);
  };
  // Generate 14 days starting from startDate
  const days = useMemo(() => {
    const result: Array<{
      date: string;
      dayOfWeek: string;
      dayNumber: number;
      monthName: string;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    // Parse startDate as local date (not UTC)
    const start = parseLocalDate(startDate);

    // Get today's date at midnight local time
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatLocalDate(today);

    for (let i = 0; i < 14; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);

      // Get day index (0=Monday, 6=Sunday for our display)
      const dayIndex = (date.getDay() + 6) % 7;

      // Format as local date string
      const dateStr = formatLocalDate(date);

      result.push({
        date: dateStr,
        dayOfWeek: DAY_NAMES[dayIndex],
        dayNumber: date.getDate(),
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        isToday: dateStr === todayStr,
        isPast: date < today,
      });
    }

    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[TwoWeekCalendar] Calendar date range:', result[0]?.date, 'to', result[result.length - 1]?.date);
      const activityDates = Object.keys(activities);
      if (activityDates.length > 0) {
        const matchingDates = result.filter(d => activities[d.date]).map(d => d.date);
        console.log('[TwoWeekCalendar] Activities matching calendar days:', matchingDates.length, 'of', activityDates.length);
        if (matchingDates.length === 0 && activityDates.length > 0) {
          console.log('[TwoWeekCalendar] Activity dates (first 5):', activityDates.slice(0, 5));
          console.log('[TwoWeekCalendar] Calendar dates (first 5):', result.slice(0, 5).map(d => d.date));
        }
      }
    }

    return result;
  }, [startDate, activities]);

  // Calculate week summaries
  const weekSummaries = useMemo(() => {
    const week1Days = days.slice(0, 7);
    const week2Days = days.slice(7, 14);

    const calculateWeekTSS = (weekDays: typeof days) => {
      let planned = 0;
      let actual = 0;

      for (const day of weekDays) {
        const workout = workouts[day.date];
        const activity = activities[day.date];

        if (workout) {
          planned += workout.targetTSS || 0;
          actual += workout.actualTSS || activity?.tss || 0;
        } else if (activity) {
          actual += activity.tss || 0;
        }
      }

      return { planned, actual };
    };

    return {
      week1: calculateWeekTSS(week1Days),
      week2: calculateWeekTSS(week2Days),
    };
  }, [days, workouts, activities]);

  // Format date range for header
  const dateRange = useMemo(() => {
    const start = parseLocalDate(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 13);

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    // Handle year boundary properly
    if (startYear === endYear) {
      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${startYear}`;
      }
      return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${startYear}`;
    }
    // Different years - show both
    return `${startMonth} ${start.getDate()}, ${startYear} - ${endMonth} ${end.getDate()}, ${endYear}`;
  }, [startDate]);

  // Get current week's days for mobile view
  const currentWeekDays = mobileWeek === '1' ? days.slice(0, 7) : days.slice(7, 14);
  const currentWeekSummary = mobileWeek === '1' ? weekSummaries.week1 : weekSummaries.week2;

  // Get status for each day in current week (for mobile compact view)
  const getDayStatus = (day: typeof days[0]): DayStatus => {
    const workout = workouts[day.date];
    const activity = activities[day.date];

    if (workout && activity) {
      // Both planned and done - check if on target
      const targetTSS = workout.targetTSS || 0;
      const actualTSS = activity.tss || 0;
      const percentDiff = targetTSS > 0 ? ((actualTSS - targetTSS) / targetTSS) * 100 : 0;
      return Math.abs(percentDiff) <= 20 ? 'done' : 'partial';
    }
    if (workout && !activity && day.isPast) return 'missed';
    if (workout) return 'planned';
    if (activity) return 'done';
    return 'empty';
  };

  // Selected day data for mobile detail view
  const selectedDay = currentWeekDays[selectedDayIndex];
  const selectedDayWorkout = selectedDay ? workouts[selectedDay.date] : null;
  const selectedDayActivity = selectedDay ? activities[selectedDay.date] : null;
  const selectedDayRaceGoal = selectedDay ? raceGoals[selectedDay.date] : null;

  // Handle day selection on mobile
  const handleMobileDaySelect = (index: number) => {
    setSelectedDayIndex(index);
    // Also trigger the onDateClick for tap-to-assign functionality
    if (selectedWorkoutId && currentWeekDays[index]) {
      onDateClick(currentWeekDays[index].date);
    }
  };

  // Render a week section
  const renderWeek = (weekDays: typeof days, weekNum: number, summary: { planned: number; actual: number }) => (
    <Paper
      p="xs"
      mb={isMobile ? 0 : 'xs'}
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        border: selectedWorkoutId ? '2px dashed var(--mantine-color-lime-5)' : undefined,
      }}
    >
      {!isMobile && (
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={500} c="dimmed">Week {weekNum}</Text>
          <Group gap="xs">
            <Badge size="xs" color="gray" variant="light">
              <Group gap={4}>
                <IconFlame size={10} />
                <Text size="xs">{summary.planned} TSS planned</Text>
              </Group>
            </Badge>
            {summary.actual > 0 && (
              <Badge size="xs" color="lime" variant="light">
                {summary.actual} done
              </Badge>
            )}
          </Group>
        </Group>
      )}

      <SimpleGrid cols={7} spacing={isMobile ? 'xs' : 'sm'}>
        {weekDays.map((day) => (
          <CalendarDayCell
            key={day.date}
            date={day.date}
            dayOfWeek={day.dayOfWeek}
            dayNumber={day.dayNumber}
            plannedWorkout={workouts[day.date] || null}
            actualActivity={activities[day.date]}
            raceGoal={raceGoals[day.date]}
            isToday={day.isToday}
            isDropTarget={dropTargetDate === day.date || (!!selectedWorkoutId && !workouts[day.date])}
            isPast={day.isPast}
            availability={availabilityByDate[day.date]}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onRemoveWorkout={onRemoveWorkout}
            onClick={onDateClick}
            onSetAvailability={onSetAvailability}
            onWorkoutClick={handleWorkoutClick}
            onLinkActivity={onLinkActivity}
            linkingWorkoutId={linkingWorkoutId}
          />
        ))}
      </SimpleGrid>
    </Paper>
  );

  return (
    <Box>
      {/* Header with navigation */}
      <Group justify="space-between" mb="md">
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => onNavigate('prev')}
        >
          <IconChevronLeft />
        </ActionIcon>

        <Text size={isMobile ? 'md' : 'lg'} fw={600}>
          {dateRange}
        </Text>

        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => onNavigate('next')}
        >
          <IconChevronRight />
        </ActionIcon>
      </Group>

      {/* Mobile: Option A - Week Summary + Day Detail */}
      {isMobile && (
        <Box>
          {/* Week selector and summary */}
          <Group justify="space-between" mb="sm">
            <SegmentedControl
              size="xs"
              value={mobileWeek}
              onChange={(v) => {
                setMobileWeek(v as '1' | '2');
                setSelectedDayIndex(0); // Reset to first day when switching weeks
              }}
              data={[
                { label: 'Week 1', value: '1' },
                { label: 'Week 2', value: '2' },
              ]}
            />
            <Group gap="xs">
              <Badge size="xs" color="gray" variant="light">
                <IconFlame size={10} style={{ marginRight: 4 }} />
                {currentWeekSummary.planned} TSS
              </Badge>
              {currentWeekSummary.actual > 0 && (
                <Badge size="xs" color="lime" variant="light">
                  {currentWeekSummary.actual} done
                </Badge>
              )}
            </Group>
          </Group>

          {/* Compact Week Bar with status dots */}
          <Paper
            p="xs"
            mb="sm"
            withBorder
            style={{
              backgroundColor: 'var(--mantine-color-dark-7)',
              border: selectedWorkoutId ? '2px dashed var(--mantine-color-lime-5)' : undefined,
            }}
          >
            <Group justify="space-around" gap={0}>
              {currentWeekDays.map((day, index) => {
                const status = getDayStatus(day);
                const isSelected = index === selectedDayIndex;
                const hasWorkout = !!workouts[day.date];
                const hasRace = !!raceGoals[day.date];
                const canDrop = selectedWorkoutId && !hasWorkout;
                const availability = availabilityByDate[day.date];
                const isBlocked = availability?.status === 'blocked';
                const isPreferred = availability?.status === 'preferred';

                // Status indicator colors and symbols
                const statusConfig: Record<DayStatus, { color: string; symbol: string; bgColor: string }> = {
                  done: { color: 'var(--mantine-color-green-5)', symbol: '●', bgColor: 'rgba(34, 197, 94, 0.15)' },
                  planned: { color: 'var(--mantine-color-blue-5)', symbol: '○', bgColor: 'rgba(59, 130, 246, 0.15)' },
                  partial: { color: 'var(--mantine-color-orange-5)', symbol: '◐', bgColor: 'rgba(251, 146, 60, 0.15)' },
                  missed: { color: 'var(--mantine-color-red-5)', symbol: '✗', bgColor: 'rgba(239, 68, 68, 0.15)' },
                  empty: { color: 'var(--mantine-color-dark-3)', symbol: '·', bgColor: 'transparent' },
                };

                // Override background for blocked/preferred days
                const bgColor = isBlocked
                  ? 'rgba(250, 82, 82, 0.15)'
                  : isPreferred
                  ? 'rgba(250, 204, 21, 0.15)'
                  : statusConfig[status].bgColor;

                return (
                  <UnstyledButton
                    key={day.date}
                    onClick={() => handleMobileDaySelect(index)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '8px 6px',
                      borderRadius: 8,
                      backgroundColor: isSelected
                        ? 'var(--mantine-color-lime-9)'
                        : canDrop
                        ? 'rgba(163, 230, 53, 0.2)'
                        : bgColor,
                      border: day.isToday
                        ? '2px solid var(--mantine-color-lime-5)'
                        : isSelected
                        ? '2px solid var(--mantine-color-lime-6)'
                        : isBlocked
                        ? '2px solid var(--mantine-color-red-7)'
                        : isPreferred
                        ? '2px solid var(--mantine-color-yellow-7)'
                        : '2px solid transparent',
                      minWidth: 40,
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {/* Day name */}
                    <Text size="xs" c={isSelected ? 'lime' : 'dimmed'} fw={500}>
                      {day.dayOfWeek.charAt(0)}
                    </Text>
                    {/* Day number */}
                    <Text
                      size="md"
                      fw={isSelected || day.isToday ? 700 : 500}
                      c={isSelected ? 'lime' : day.isToday ? 'lime.4' : undefined}
                    >
                      {day.dayNumber}
                    </Text>
                    {/* Status dot or race indicator */}
                    {hasRace ? (
                      <Text size="sm" style={{ lineHeight: 1 }}>🏆</Text>
                    ) : (
                      <Text
                        size="lg"
                        style={{ color: statusConfig[status].color, lineHeight: 1 }}
                      >
                        {statusConfig[status].symbol}
                      </Text>
                    )}
                  </UnstyledButton>
                );
              })}
            </Group>
          </Paper>

          {/* Selected Day Detail View */}
          {selectedDay && (
            <Paper
              p="md"
              withBorder
              style={{
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: selectedDay.isToday ? 'var(--mantine-color-lime-6)' : undefined,
              }}
            >
              {/* Day header */}
              <Group justify="space-between" mb="md">
                <Group gap="xs">
                  <Text size="lg" fw={600} c={selectedDay.isToday ? 'lime' : undefined}>
                    {selectedDay.dayOfWeek}
                  </Text>
                  <Text size="lg" fw={600}>
                    {selectedDay.monthName} {selectedDay.dayNumber}
                  </Text>
                  {selectedDay.isToday && (
                    <Badge size="xs" color="lime" variant="filled">Today</Badge>
                  )}
                </Group>
                {selectedDayWorkout && (
                  <ActionIcon
                    size="sm"
                    color="red"
                    variant="subtle"
                    onClick={() => onRemoveWorkout(selectedDay.date)}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                )}
              </Group>

              {/* Race Goal Display */}
              {selectedDayRaceGoal && (() => {
                const raceTypeInfo = RACE_TYPE_INFO[selectedDayRaceGoal.race_type] || RACE_TYPE_INFO.other;
                const priorityColor = selectedDayRaceGoal.priority === 'A' ? 'red' : selectedDayRaceGoal.priority === 'B' ? 'orange' : 'gray';

                return (
                  <Paper
                    p="sm"
                    mb="md"
                    style={{
                      backgroundColor: 'rgba(250, 176, 5, 0.15)',
                      border: '2px solid var(--mantine-color-yellow-6)',
                      borderRadius: 8,
                    }}
                  >
                    <Group gap="sm" mb="xs">
                      <ThemeIcon size="lg" color="orange" variant="light">
                        <IconTrophy size={18} />
                      </ThemeIcon>
                      <Box style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text size="lg">{raceTypeInfo.icon}</Text>
                          <Badge size="sm" color={priorityColor} variant="filled">
                            {selectedDayRaceGoal.priority}
                          </Badge>
                          <Text fw={600} size="md">{selectedDayRaceGoal.name}</Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {raceTypeInfo.label}
                          {selectedDayRaceGoal.location && ` • ${selectedDayRaceGoal.location}`}
                          {selectedDayRaceGoal.distance_km && ` • ${Math.round(selectedDayRaceGoal.distance_km * 0.621371)} mi`}
                        </Text>
                      </Box>
                    </Group>
                    <Badge size="sm" color="yellow" variant="filled">
                      Race Day!
                    </Badge>
                  </Paper>
                );
              })()}

              {/* Planned Workout */}
              {selectedDayWorkout?.workout ? (
                <Box mb="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                    Planned Workout
                  </Text>
                  <Box
                    onClick={() => selectedDayWorkout.workout && handleWorkoutClick(selectedDayWorkout.workout)}
                    style={{ cursor: 'pointer' }}
                  >
                    <WorkoutCard
                      workout={selectedDayWorkout.workout}
                      source="calendar"
                      sourceDate={selectedDay.date}
                      showDuration
                      showTSS
                    />
                  </Box>
                  {/* Target TSS */}
                  <Group gap="xs" mt="xs">
                    <IconFlame size={14} color="var(--mantine-color-lime-5)" />
                    <Text size="sm" c="lime">Target: {selectedDayWorkout.targetTSS} TSS</Text>
                  </Group>
                </Box>
              ) : (
                <Box
                  mb="md"
                  p="lg"
                  style={{
                    border: '2px dashed var(--mantine-color-dark-4)',
                    borderRadius: 8,
                    textAlign: 'center',
                    backgroundColor: selectedWorkoutId ? 'rgba(163, 230, 53, 0.1)' : undefined,
                    borderColor: selectedWorkoutId ? 'var(--mantine-color-lime-5)' : undefined,
                  }}
                  onClick={() => selectedWorkoutId && onDateClick(selectedDay.date)}
                >
                  <IconPlus size={24} color="var(--mantine-color-dark-3)" style={{ marginBottom: 8 }} />
                  <Text size="sm" c="dimmed">
                    {selectedWorkoutId ? 'Tap to place workout here' : 'No workout planned'}
                  </Text>
                  {!selectedWorkoutId && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Open workout library to add one
                    </Text>
                  )}
                </Box>
              )}

              {/* Actual Activity */}
              {selectedDayActivity && (() => {
                const typeInfo = getActivityTypeInfo(selectedDayActivity.type, selectedDayActivity.trainer);
                const hasComparison = selectedDayWorkout && selectedDayActivity.tss;
                const tssVariance = hasComparison && selectedDayWorkout.targetTSS
                  ? (selectedDayActivity.tss || 0) - selectedDayWorkout.targetTSS
                  : null;

                return (
                  <Box>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                      Completed Activity
                    </Text>
                    <Paper
                      p="sm"
                      style={{
                        backgroundColor: `rgba(${typeInfo.isIndoor ? '139, 92, 246' : '59, 130, 246'}, 0.15)`,
                        borderLeft: `4px solid var(--mantine-color-${typeInfo.color}-5)`,
                      }}
                    >
                      {/* Activity name and type */}
                      <Group justify="space-between" mb="sm">
                        <Group gap="xs">
                          {typeInfo.isIndoor ? (
                            <IconHome size={18} color={`var(--mantine-color-${typeInfo.color}-5)`} />
                          ) : (
                            <IconBike size={18} color={`var(--mantine-color-${typeInfo.color}-5)`} />
                          )}
                          <Text size="md" fw={500}>
                            {selectedDayActivity.name || 'Activity'}
                          </Text>
                        </Group>
                        <Badge size="sm" color={typeInfo.color} variant="light">
                          {typeInfo.label}
                        </Badge>
                      </Group>

                      {/* Activity stats */}
                      <Group gap="lg">
                        <Group gap={4}>
                          <IconFlame size={16} color="var(--mantine-color-orange-5)" />
                          <Text size="md" fw={600}>{selectedDayActivity.tss || 0} TSS</Text>
                        </Group>
                        {selectedDayActivity.duration_seconds && (
                          <Group gap={4}>
                            <IconClock size={16} color="var(--mantine-color-gray-5)" />
                            <Text size="sm">{formatDuration(selectedDayActivity.duration_seconds)}</Text>
                          </Group>
                        )}
                        {selectedDayActivity.distance && (
                          <Group gap={4}>
                            <IconRoute size={16} color="var(--mantine-color-gray-5)" />
                            <Text size="sm">{formatDistance(selectedDayActivity.distance)}</Text>
                          </Group>
                        )}
                      </Group>

                      {/* Comparison with planned */}
                      {hasComparison && tssVariance !== null && (
                        <Box mt="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
                          <Group gap="xs">
                            {tssVariance >= -10 && tssVariance <= 10 ? (
                              <>
                                <IconCheck size={16} color="var(--mantine-color-green-5)" />
                                <Text size="sm" c="green">On target!</Text>
                              </>
                            ) : tssVariance > 10 ? (
                              <>
                                <IconArrowUp size={16} color="var(--mantine-color-blue-5)" />
                                <Text size="sm" c="blue">+{tssVariance} TSS above target</Text>
                              </>
                            ) : (
                              <>
                                <IconArrowDown size={16} color="var(--mantine-color-orange-5)" />
                                <Text size="sm" c="orange">{tssVariance} TSS below target</Text>
                              </>
                            )}
                          </Group>
                        </Box>
                      )}
                    </Paper>
                  </Box>
                );
              })()}

              {/* Empty day message */}
              {!selectedDayWorkout && !selectedDayActivity && (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No activity on this day
                </Text>
              )}

              {/* Missed workout warning */}
              {selectedDayWorkout && !selectedDayActivity && selectedDay.isPast && (
                <Badge size="sm" color="red" variant="light" fullWidth mt="sm">
                  <Group gap={4} justify="center">
                    <IconX size={12} />
                    Planned workout was missed
                  </Group>
                </Badge>
              )}
            </Paper>
          )}
        </Box>
      )}

      {/* Desktop: Day headers */}
      {!isMobile && (
        <SimpleGrid cols={7} spacing="xs" mb="xs">
          {DAY_NAMES.map((day) => (
            <Text
              key={day}
              size="xs"
              fw={600}
              ta="center"
              c="dimmed"
              tt="uppercase"
            >
              {day}
            </Text>
          ))}
        </SimpleGrid>
      )}

      {/* Desktop: Show both weeks */}
      {!isMobile && (
        <>
          {renderWeek(days.slice(0, 7), 1, weekSummaries.week1)}
          {renderWeek(days.slice(7, 14), 2, weekSummaries.week2)}
        </>
      )}

      {/* Selection mode indicator */}
      {selectedWorkoutId && (
        <Text size="xs" c="lime" ta="center" mt="xs">
          Tap a day to place the workout
        </Text>
      )}

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        workout={detailWorkout}
        opened={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
      />
    </Box>
  );
}

export default TwoWeekCalendar;
