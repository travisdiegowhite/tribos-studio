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

// Workout category colors — matches existing planner components
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

// Short labels for badges
const CATEGORY_SHORT_LABELS: Record<string, string> = {
  recovery: 'Recov',
  endurance: 'Endur',
  tempo: 'Tempo',
  sweet_spot: 'SS',
  threshold: 'Thresh',
  vo2max: 'VO2',
  anaerobic: 'Anaer',
  climbing: 'Climb',
  racing: 'Race',
  strength: 'Str',
  core: 'Core',
  flexibility: 'Flex',
  rest: 'Rest',
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

// Intensity heat tint based on TSS
function getTSSHeatTint(tss: number): string {
  if (tss >= 150) return 'rgba(250, 82, 82, 0.08)';
  if (tss >= 100) return 'rgba(253, 126, 20, 0.08)';
  if (tss >= 50) return 'rgba(59, 130, 246, 0.06)';
  return 'transparent';
}

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

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastOfMonth.getDate();

    // Leading days from previous month
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

    // Trailing days to complete last week
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
      p="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-4)',
      }}
    >
      {/* Month Navigation */}
      <Group justify="space-between" mb="md">
        <ActionIcon variant="subtle" size="lg" onClick={goToPrevMonth}>
          <IconChevronLeft size={20} />
        </ActionIcon>
        <Text size="lg" fw={700} tt="uppercase" style={{ letterSpacing: 1 }}>
          {monthLabel}
        </Text>
        <ActionIcon variant="subtle" size="lg" onClick={goToNextMonth}>
          <IconChevronRight size={20} />
        </ActionIcon>
      </Group>

      {/* Day Headers */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          marginBottom: 6,
        }}
      >
        {dayHeaders.map((day) => (
          <Text key={day} size="sm" c="dimmed" ta="center" fw={600} tt="uppercase" style={{ letterSpacing: 0.5 }}>
            {isMobile ? day.slice(0, 2) : day}
          </Text>
        ))}
      </Box>

      {/* Calendar Grid */}
      <Box style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {weeks.map((week, weekIdx) => {
          const planDay = week.find((d) => d.isInPlan);
          const weekPhase = planDay?.phase;

          return (
            <Box
              key={weekIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 3,
                position: 'relative',
                paddingLeft: weekPhase ? 6 : 0,
              }}
            >
              {/* Phase indicator bar on the left edge */}
              {weekPhase && (
                <Box
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 2,
                    bottom: 2,
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
      <Group justify="center" gap="lg" mt="md">
        <Group gap={6}>
          <Badge size="xs" color="blue" variant="light">Endur</Badge>
          <Text size="xs" c="dimmed">Planned</Text>
        </Group>
        <Group gap={6}>
          <Badge size="xs" color="green" variant="filled">
            <Group gap={2}><IconCheck size={8} />Done</Group>
          </Badge>
          <Text size="xs" c="dimmed">Completed</Text>
        </Group>
        <Group gap={6}>
          <Box style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: 'rgba(255, 107, 107, 0.15)', border: '1px solid rgba(255, 107, 107, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconX size={8} color="#ff6b6b" />
          </Box>
          <Text size="xs" c="dimmed">Missed</Text>
        </Group>
        <Group gap={6}>
          <IconTrophy size={14} color="var(--mantine-color-yellow-5)" />
          <Text size="xs" c="dimmed">Race</Text>
        </Group>
      </Group>

      <Text size="xs" c="dimmed" ta="center" mt="xs" fs="italic">
        Click any day to edit in Week Detail view
      </Text>
    </Paper>
  );
}

// Individual day cell
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

  const workoutType = day.workout?.workoutType || null;
  const categoryColor = workoutType ? (CATEGORY_COLORS[workoutType] || 'blue') : 'blue';
  const categoryLabel = workoutType ? (CATEGORY_SHORT_LABELS[workoutType] || workoutType) : '';
  const tss = day.workout?.targetTSS || 0;

  // Determine left border color
  let leftBorderColor = 'transparent';
  if (day.raceGoal) {
    leftBorderColor = 'var(--mantine-color-yellow-5)';
  } else if (hasCompleted) {
    leftBorderColor = '#51cf66';
  } else if (hasMissed) {
    leftBorderColor = '#ff6b6b';
  } else if (day.workout) {
    leftBorderColor = `var(--mantine-color-${categoryColor}-5)`;
  }

  // Determine background
  let bgColor: string;
  if (!day.isCurrentMonth) {
    bgColor = 'var(--mantine-color-dark-8)';
  } else if (day.isToday) {
    bgColor = 'rgba(158, 90, 60, 0.2)';
  } else if (hasMissed) {
    bgColor = 'rgba(255, 107, 107, 0.1)';
  } else if (hasCompleted) {
    bgColor = 'rgba(81, 207, 102, 0.08)';
  } else if (day.isInPlan) {
    bgColor = 'var(--mantine-color-dark-5)';
  } else {
    bgColor = 'var(--mantine-color-dark-7)';
  }

  // Add TSS heat tint for workout days
  const heatTint = day.workout && tss > 0 ? getTSSHeatTint(tss) : 'transparent';

  // Is this an empty rest day within the plan?
  const isRestDay = day.isInPlan && !day.workout && !day.raceGoal && day.isCurrentMonth;

  return (
    <Tooltip
      label={
        <Box>
          <Text size="xs" fw={600}>
            {parseLocalDate(day.date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          {day.raceGoal && (
            <Text size="xs" c="yellow" fw={500} mt={2}>
              Race: {day.raceGoal.name}
            </Text>
          )}
          {day.workout && (
            <Box mt={2}>
              <Text size="xs">
                {day.workout.workout?.name || workoutType || 'Workout'}
              </Text>
              {tss > 0 && <Text size="xs">Target: {tss} TSS</Text>}
              {day.workout.targetDuration > 0 && (
                <Text size="xs">{day.workout.targetDuration}min</Text>
              )}
            </Box>
          )}
          {day.activity?.tss && (
            <Text size="xs" mt={2}>Actual: {Math.round(day.activity.tss)} TSS</Text>
          )}
          {hasMissed && <Text size="xs" c="red" fw={500} mt={2}>Missed</Text>}
          {hasCompleted && <Text size="xs" c="green" fw={500} mt={2}>Completed</Text>}
        </Box>
      }
      position="top"
      disabled={!day.workout && !day.activity && !day.raceGoal}
    >
      <Box
        onClick={onClick}
        style={{
          padding: isMobile ? '4px 3px' : '6px 5px',
          minHeight: isMobile ? 56 : 72,
          cursor: 'pointer',
          borderRadius: 4,
          backgroundColor: bgColor,
          backgroundImage: heatTint !== 'transparent'
            ? `linear-gradient(${heatTint}, ${heatTint})`
            : undefined,
          borderLeft: leftBorderColor !== 'transparent'
            ? `3px solid ${leftBorderColor}`
            : undefined,
          border: day.isToday
            ? '2px solid var(--mantine-color-terracotta-5)'
            : isRestDay
            ? '1px dashed var(--mantine-color-dark-3)'
            : '1px solid var(--mantine-color-dark-4)',
          opacity: day.isCurrentMonth ? 1 : 0.3,
          transition: 'all 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
        onMouseEnter={(e) => {
          if (day.isCurrentMonth) {
            e.currentTarget.style.borderColor = 'var(--mantine-color-terracotta-6)';
            if (!day.isToday) {
              e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-4)';
            }
          }
        }}
        onMouseLeave={(e) => {
          if (day.isCurrentMonth) {
            e.currentTarget.style.borderColor = day.isToday
              ? 'var(--mantine-color-terracotta-5)'
              : isRestDay
              ? 'var(--mantine-color-dark-3)'
              : 'var(--mantine-color-dark-4)';
            if (!day.isToday) {
              e.currentTarget.style.backgroundColor = bgColor;
            }
          }
        }}
      >
        {/* Day number */}
        <Text
          size="sm"
          fw={day.isToday ? 800 : 600}
          c={day.isToday ? 'terracotta' : day.isCurrentMonth ? 'white' : 'dimmed'}
          lh={1}
        >
          {day.dayNumber}
        </Text>

        {/* Race goal */}
        {day.raceGoal && (
          <Group gap={3} wrap="nowrap" style={{ overflow: 'hidden' }}>
            <IconTrophy size={12} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />
            <Text size={10} c="yellow" fw={600} lineClamp={1} lh={1}>
              {day.raceGoal.name}
            </Text>
          </Group>
        )}

        {/* Workout badge */}
        {day.workout && !day.raceGoal && (
          <>
            <Badge
              size="xs"
              color={hasCompleted ? 'green' : hasMissed ? 'red' : categoryColor}
              variant={hasCompleted ? 'filled' : 'light'}
              leftSection={
                hasCompleted ? <IconCheck size={8} /> :
                hasMissed ? <IconX size={8} /> :
                null
              }
              styles={{
                root: { padding: '0 4px', height: 18, maxWidth: '100%' },
                label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
              }}
            >
              {isMobile ? categoryLabel.slice(0, 3) : categoryLabel}
            </Badge>

            {/* TSS */}
            {tss > 0 && (
              <Text size={11} c="orange" fw={600} lh={1}>
                {tss} TSS
              </Text>
            )}
          </>
        )}

        {/* Rest day indicator */}
        {isRestDay && !day.activity && (
          <Text size={10} c="dimmed" fs="italic" lh={1}>
            Rest
          </Text>
        )}
      </Box>
    </Tooltip>
  );
}

export default PlanCalendarOverview;
