/**
 * PeriodizationView Component
 * Long-range 8-12 week overview showing training phases and weekly TSS
 */

import { useMemo } from 'react';
import { Box, Group, Text, Badge, Tooltip, Progress, Paper } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { PlannerWorkout } from '../../types/planner';

// Training phases
export type TrainingPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery' | 'race';

interface WeekSummary {
  weekStart: string;
  weekNumber: number;
  phase: TrainingPhase;
  plannedTSS: number;
  actualTSS: number;
  workoutCount: number;
  isCurrentWeek: boolean;
  isFocused: boolean;
}

interface PeriodizationViewProps {
  planStartDate: string | null;
  planDurationWeeks: number;
  focusedWeekStart: string;
  plannedWorkouts: Record<string, PlannerWorkout>;
  activities?: Record<string, { tss: number | null }>;
  onWeekClick: (weekStart: string) => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

// Phase colors
const PHASE_COLORS: Record<TrainingPhase, string> = {
  base: 'blue',
  build: 'orange',
  peak: 'red',
  taper: 'green',
  recovery: 'gray',
  race: 'violet',
};

// Phase icons
const PHASE_LABELS: Record<TrainingPhase, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  recovery: 'Recovery',
  race: 'Race',
};

/**
 * Calculate training phase based on week position in plan
 */
function calculatePhase(
  weekNumber: number,
  totalWeeks: number,
  raceWeek?: number
): TrainingPhase {
  // If we have a race week, work backwards from it
  if (raceWeek && weekNumber === raceWeek) {
    return 'race';
  }

  // Default periodization pattern
  const percentComplete = weekNumber / totalWeeks;

  if (percentComplete <= 0.4) {
    // First 40% is base
    return 'base';
  } else if (percentComplete <= 0.7) {
    // Next 30% is build
    return 'build';
  } else if (percentComplete <= 0.85) {
    // Next 15% is peak
    return 'peak';
  } else {
    // Final 15% is taper
    return 'taper';
  }
}

/**
 * Format date as YYYY-MM-DD in local timezone
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD string as local date (not UTC)
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get Monday of the week containing a date (local timezone)
 */
function getWeekStart(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return formatLocalDate(date);
}

/**
 * Add days to a date string (local timezone)
 */
function addDays(dateStr: string, days: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

/**
 * Format date for display
 */
function formatWeekLabel(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PeriodizationView({
  planStartDate,
  planDurationWeeks,
  focusedWeekStart,
  plannedWorkouts,
  activities = {},
  onWeekClick,
}: PeriodizationViewProps) {
  // Calculate current week (using local timezone)
  const currentWeekStart = useMemo(() => {
    return getWeekStart(formatLocalDate(new Date()));
  }, []);

  // Generate week summaries
  const weeks = useMemo(() => {
    const result: WeekSummary[] = [];

    // Determine the range of weeks to show
    // If we have a plan, use that; otherwise show 12 weeks from current
    const startDate = planStartDate || currentWeekStart;
    const numWeeks = planDurationWeeks || 12;

    for (let i = 0; i < numWeeks; i++) {
      const weekStart = addDays(startDate, i * 7);

      // Calculate TSS for the week
      let plannedTSS = 0;
      let actualTSS = 0;
      let workoutCount = 0;

      for (let day = 0; day < 7; day++) {
        const date = addDays(weekStart, day);
        const workout = plannedWorkouts[date];
        if (workout) {
          plannedTSS += workout.targetTSS || 0;
          workoutCount++;
        }
        const activity = activities[date];
        if (activity?.tss) {
          actualTSS += activity.tss;
        }
      }

      result.push({
        weekStart,
        weekNumber: i + 1,
        phase: calculatePhase(i + 1, numWeeks),
        plannedTSS,
        actualTSS,
        workoutCount,
        isCurrentWeek: weekStart === currentWeekStart,
        isFocused: weekStart === focusedWeekStart || addDays(weekStart, 7) === addDays(focusedWeekStart, 7),
      });
    }

    return result;
  }, [planStartDate, planDurationWeeks, plannedWorkouts, activities, currentWeekStart, focusedWeekStart]);

  // Calculate max TSS for scaling
  const maxTSS = useMemo(() => {
    const allTSS = weeks.map((w) => Math.max(w.plannedTSS, w.actualTSS));
    return Math.max(500, ...allTSS); // Minimum 500 for scale
  }, [weeks]);

  // Check if focused week is visible in current view
  const focusedWeekIndex = weeks.findIndex(
    (w) => w.weekStart === focusedWeekStart || w.weekStart === addDays(focusedWeekStart, -7)
  );

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-4)',
      }}
    >
      <Group justify="space-between" mb="sm">
        <Text size="sm" fw={600}>
          Training Overview
        </Text>
        <Group gap="xs">
          {Object.entries(PHASE_COLORS).slice(0, 4).map(([phase, color]) => (
            <Badge key={phase} size="xs" color={color} variant="light">
              {PHASE_LABELS[phase as TrainingPhase]}
            </Badge>
          ))}
        </Group>
      </Group>

      {/* Week bars */}
      <Box
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {weeks.map((week) => (
          <Tooltip
            key={week.weekStart}
            label={
              <Box>
                <Text size="xs" fw={500}>
                  Week {week.weekNumber} - {formatWeekLabel(week.weekStart)}
                </Text>
                <Text size="xs">Phase: {PHASE_LABELS[week.phase]}</Text>
                <Text size="xs">Planned: {week.plannedTSS} TSS</Text>
                {week.actualTSS > 0 && (
                  <Text size="xs">Actual: {week.actualTSS} TSS</Text>
                )}
                <Text size="xs">{week.workoutCount} workouts</Text>
              </Box>
            }
            position="top"
          >
            <Box
              onClick={() => onWeekClick(week.weekStart)}
              style={{
                minWidth: 48,
                maxWidth: 60,
                flex: 1,
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                backgroundColor: week.isFocused
                  ? 'rgba(163, 230, 53, 0.15)'
                  : 'var(--mantine-color-dark-6)',
                border: week.isCurrentWeek
                  ? '2px solid var(--mantine-color-lime-6)'
                  : week.isFocused
                  ? '2px solid var(--mantine-color-lime-4)'
                  : '1px solid var(--mantine-color-dark-4)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!week.isFocused) {
                  e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!week.isFocused) {
                  e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-6)';
                }
              }}
            >
              {/* Week number and phase */}
              <Group justify="space-between" gap={2} mb={4}>
                <Text size="xs" fw={week.isCurrentWeek ? 700 : 500} c={week.isCurrentWeek ? 'lime' : undefined}>
                  W{week.weekNumber}
                </Text>
                <Box
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: `var(--mantine-color-${PHASE_COLORS[week.phase]}-6)`,
                  }}
                />
              </Group>

              {/* TSS bar */}
              <Box
                style={{
                  height: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  gap: 2,
                  position: 'relative',
                }}
              >
                {/* Planned TSS bar */}
                <Box
                  style={{
                    height: `${Math.max(4, (week.plannedTSS / maxTSS) * 100)}%`,
                    backgroundColor: `var(--mantine-color-${PHASE_COLORS[week.phase]}-7)`,
                    borderRadius: 2,
                    minHeight: week.plannedTSS > 0 ? 4 : 0,
                  }}
                />
                {/* Actual TSS bar shown below planned */}
                {week.actualTSS > 0 && (
                  <Box
                    style={{
                      height: `${Math.max(2, (week.actualTSS / maxTSS) * 40)}px`,
                      backgroundColor: 'var(--mantine-color-lime-6)',
                      borderRadius: 2,
                      marginTop: 2,
                    }}
                  />
                )}
              </Box>

              {/* TSS value */}
              <Text size="xs" c="dimmed" ta="center" mt={4}>
                {week.plannedTSS > 0 ? week.plannedTSS : '-'}
              </Text>
            </Box>
          </Tooltip>
        ))}
      </Box>

      {/* Legend */}
      <Group justify="center" gap="md" mt="xs">
        <Group gap={4}>
          <Box
            style={{
              width: 12,
              height: 12,
              backgroundColor: 'var(--mantine-color-blue-7)',
              borderRadius: 2,
            }}
          />
          <Text size="xs" c="dimmed">
            Planned TSS
          </Text>
        </Group>
        <Group gap={4}>
          <Box
            style={{
              width: 12,
              height: 12,
              backgroundColor: 'var(--mantine-color-lime-6)',
              borderRadius: 2,
            }}
          />
          <Text size="xs" c="dimmed">
            Actual TSS
          </Text>
        </Group>
      </Group>
    </Paper>
  );
}

export default PeriodizationView;
