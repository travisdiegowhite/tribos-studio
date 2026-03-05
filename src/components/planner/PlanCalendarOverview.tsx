/**
 * PlanCalendarOverview Component
 * Full-plan monthly calendar grid showing workout overview
 * Read-oriented view — click a day to switch to Week Detail for editing
 */

import { useMemo, useState } from 'react';
import { Box, Group, Text, Paper, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight, IconTrophy, IconCheck, IconX } from '@tabler/icons-react';
import type { PlannerWorkout } from '../../types/planner';
import { calculatePhase, formatLocalDate, parseLocalDate, addDays } from './PeriodizationView';

// Workout category colors for the dots
const CATEGORY_COLORS: Record<string, string> = {
  recovery: 'green',
  endurance: 'blue',
  tempo: 'cyan',
  sweet_spot: 'teal',
  threshold: 'orange',
  vo2max: 'red',
  anaerobic: 'grape',
  climbing: 'yellow',
  racing: 'violet',
  strength: 'pink',
  core: 'indigo',
  flexibility: 'lime',
  rest: 'gray',
};

// Phase colors for week row indicators
const PHASE_COLORS: Record<string, string> = {
  base: 'blue',
  build: 'orange',
  peak: 'red',
  taper: 'green',
  recovery: 'gray',
  race: 'violet',
};

interface RaceGoalInfo {
  name: string;
  priority?: string;
  race_type?: string;
}

interface PlanCalendarOverviewProps {
  planStartDate: string | null;
  planDurationWeeks: number;
  workouts: Record<string, PlannerWorkout>;
  activities?: Record<string, { tss: number | null }>;
  raceGoals?: Record<string, RaceGoalInfo>;
  onDayClick: (date: string) => void;
}

interface CalendarDay {
  date: string;
  dayNumber: number;
  isInPlan: boolean;
  isCurrentMonth: boolean;
  isToday: boolean;
  workout: PlannerWorkout | null;
  activity: { tss: number | null } | null;
  raceGoal: RaceGoalInfo | null;
  phase: string | null;
  weekNumber: number | null;
}

function getMonthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export function PlanCalendarOverview({
  planStartDate,
  planDurationWeeks,
  workouts,
  activities = {},
  raceGoals = {},
  onDayClick,
}: PlanCalendarOverviewProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const today = formatLocalDate(new Date());

  // Current viewing month
  const [viewYear, setViewYear] = useState(() => {
    if (planStartDate) {
      const d = parseLocalDate(planStartDate);
      return d.getFullYear();
    }
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (planStartDate) {
      const d = parseLocalDate(planStartDate);
      return d.getMonth();
    }
    return new Date().getMonth();
  });

  // Plan date range
  const planEndDate = useMemo(() => {
    if (!planStartDate) return null;
    return addDays(planStartDate, planDurationWeeks * 7 - 1);
  }, [planStartDate, planDurationWeeks]);

  // Navigate months
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Generate calendar grid for the current month
  const calendarDays = useMemo(() => {
    const result: CalendarDay[] = [];

    // First day of the month
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Day of week (0=Sun, adjust so Mon=0)
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;

    // Last day of the month
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastOfMonth.getDate();

    // Fill leading days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      const dateStr = formatLocalDate(d);
      result.push(makeDayEntry(dateStr, d.getDate(), false));
    }

    // Days of this month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      const dateStr = formatLocalDate(d);
      result.push(makeDayEntry(dateStr, day, true));
    }

    // Fill trailing days to complete last week
    const remaining = 7 - (result.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(viewYear, viewMonth + 1, i);
        const dateStr = formatLocalDate(d);
        result.push(makeDayEntry(dateStr, i, false));
      }
    }

    return result;

    function makeDayEntry(dateStr: string, dayNumber: number, isCurrentMonth: boolean): CalendarDay {
      const isInPlan = planStartDate && planEndDate
        ? dateStr >= planStartDate && dateStr <= planEndDate
        : false;

      // Calculate week number and phase within plan
      let weekNumber: number | null = null;
      let phase: string | null = null;
      if (isInPlan && planStartDate) {
        const daysSinceStart = Math.floor(
          (parseLocalDate(dateStr).getTime() - parseLocalDate(planStartDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        weekNumber = Math.floor(daysSinceStart / 7) + 1;
        phase = calculatePhase(weekNumber, planDurationWeeks);
      }

      return {
        date: dateStr,
        dayNumber,
        isInPlan,
        isCurrentMonth,
        isToday: dateStr === today,
        workout: workouts[dateStr] || null,
        activity: activities[dateStr] || null,
        raceGoal: raceGoals[dateStr] || null,
        phase,
        weekNumber,
      };
    }
  }, [viewYear, viewMonth, planStartDate, planEndDate, planDurationWeeks, workouts, activities, raceGoals, today]);

  // Group into weeks for phase indicators
  const weeks = useMemo(() => {
    const result: CalendarDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-4)',
      }}
    >
      {/* Month Navigation */}
      <Group justify="space-between" mb="sm">
        <ActionIcon variant="subtle" onClick={goToPrevMonth}>
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text size="sm" fw={600}>
          {monthLabel}
        </Text>
        <ActionIcon variant="subtle" onClick={goToNextMonth}>
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>

      {/* Day Headers */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
          marginBottom: 4,
        }}
      >
        {dayHeaders.map((day) => (
          <Text key={day} size="xs" c="dimmed" ta="center" fw={500}>
            {isMobile ? day[0] : day}
          </Text>
        ))}
      </Box>

      {/* Calendar Grid */}
      <Box style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {weeks.map((week, weekIdx) => {
          // Get the phase for this week row from the first in-plan day
          const planDay = week.find((d) => d.isInPlan);
          const weekPhase = planDay?.phase;

          return (
            <Box
              key={weekIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 1,
                position: 'relative',
              }}
            >
              {/* Phase indicator bar on the left edge */}
              {weekPhase && (
                <Box
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    backgroundColor: `var(--mantine-color-${PHASE_COLORS[weekPhase] || 'gray'}-6)`,
                    borderRadius: 2,
                  }}
                />
              )}

              {week.map((day) => (
                <DayCell key={day.date} day={day} onClick={() => onDayClick(day.date)} isMobile={isMobile} />
              ))}
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Group justify="center" gap="md" mt="sm">
        <Group gap={4}>
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-blue-6)',
            }}
          />
          <Text size="xs" c="dimmed">Planned</Text>
        </Group>
        <Group gap={4}>
          <IconCheck size={10} color="var(--mantine-color-green-5)" />
          <Text size="xs" c="dimmed">Completed</Text>
        </Group>
        <Group gap={4}>
          <IconX size={10} color="var(--mantine-color-red-5)" />
          <Text size="xs" c="dimmed">Missed</Text>
        </Group>
        <Group gap={4}>
          <IconTrophy size={10} color="var(--mantine-color-yellow-5)" />
          <Text size="xs" c="dimmed">Race</Text>
        </Group>
      </Group>

      <Text size="xs" c="dimmed" ta="center" mt="xs" fs="italic">
        Click any day to edit in Week Detail view
      </Text>
    </Paper>
  );
}

// Individual day cell for the calendar overview
function DayCell({
  day,
  onClick,
  isMobile,
}: {
  day: CalendarDay;
  onClick: () => void;
  isMobile: boolean | undefined;
}) {
  const isPast = day.date < formatLocalDate(new Date());
  const hasMissed = isPast && day.workout && !day.workout.completed && !day.activity;
  const hasCompleted = day.workout?.completed || (day.workout && day.activity);

  const categoryColor = day.workout?.workoutType
    ? CATEGORY_COLORS[day.workout.workoutType] || 'blue'
    : 'blue';

  return (
    <Tooltip
      label={
        <Box>
          <Text size="xs" fw={500}>
            {parseLocalDate(day.date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          {day.raceGoal && (
            <Text size="xs" c="yellow">
              Race: {day.raceGoal.name}
            </Text>
          )}
          {day.workout && (
            <>
              <Text size="xs">
                {day.workout.workout?.name || day.workout.workoutType || 'Workout'}
              </Text>
              {day.workout.targetTSS > 0 && (
                <Text size="xs">Target: {day.workout.targetTSS} TSS</Text>
              )}
            </>
          )}
          {day.activity && day.activity.tss && (
            <Text size="xs">Actual: {day.activity.tss} TSS</Text>
          )}
          {hasMissed && <Text size="xs" c="red">Missed</Text>}
          {hasCompleted && <Text size="xs" c="green">Completed</Text>}
        </Box>
      }
      position="top"
      disabled={!day.workout && !day.activity && !day.raceGoal}
    >
      <Box
        onClick={onClick}
        style={{
          padding: isMobile ? 2 : 4,
          minHeight: isMobile ? 36 : 48,
          cursor: 'pointer',
          borderRadius: 4,
          backgroundColor: day.isToday
            ? 'rgba(158, 90, 60, 0.15)'
            : day.isInPlan && day.isCurrentMonth
            ? 'var(--mantine-color-dark-6)'
            : 'var(--mantine-color-dark-8)',
          border: day.isToday
            ? '1px solid var(--mantine-color-terracotta-6)'
            : '1px solid transparent',
          opacity: day.isCurrentMonth ? 1 : 0.35,
          transition: 'background-color 0.1s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
        onMouseEnter={(e) => {
          if (day.isCurrentMonth) {
            e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-5)';
          }
        }}
        onMouseLeave={(e) => {
          if (day.isCurrentMonth) {
            e.currentTarget.style.backgroundColor = day.isToday
              ? 'rgba(158, 90, 60, 0.15)'
              : day.isInPlan
              ? 'var(--mantine-color-dark-6)'
              : 'var(--mantine-color-dark-8)';
          }
        }}
      >
        {/* Day number */}
        <Text
          size="xs"
          fw={day.isToday ? 700 : 400}
          c={day.isToday ? 'terracotta' : day.isCurrentMonth ? undefined : 'dimmed'}
        >
          {day.dayNumber}
        </Text>

        {/* Race goal indicator */}
        {day.raceGoal && (
          <IconTrophy size={isMobile ? 10 : 12} color="var(--mantine-color-yellow-5)" />
        )}

        {/* Workout indicator */}
        {day.workout && !day.raceGoal && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {hasCompleted ? (
              <IconCheck size={isMobile ? 10 : 12} color="var(--mantine-color-green-5)" />
            ) : hasMissed ? (
              <IconX size={isMobile ? 10 : 12} color="var(--mantine-color-red-5)" />
            ) : (
              <Box
                style={{
                  width: isMobile ? 6 : 8,
                  height: isMobile ? 6 : 8,
                  borderRadius: '50%',
                  backgroundColor: `var(--mantine-color-${categoryColor}-6)`,
                }}
              />
            )}
          </Box>
        )}

        {/* TSS label (desktop only) */}
        {!isMobile && day.workout && day.workout.targetTSS > 0 && (
          <Text size={10} c="dimmed" lh={1}>
            {day.workout.targetTSS}
          </Text>
        )}
      </Box>
    </Tooltip>
  );
}

export default PlanCalendarOverview;
