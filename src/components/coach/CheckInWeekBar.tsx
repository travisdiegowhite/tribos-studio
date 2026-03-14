import React from 'react';
import { Box, Group, Text, Stack, Tooltip } from '@mantine/core';

interface WeekDay {
  day_of_week: number;
  workout_type: string | null;
  target_tss: number | null;
  actual_tss: number | null;
  completed: boolean;
  scheduled_date: string | null;
}

interface CheckInWeekBarProps {
  weekSchedule: WeekDay[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getActualBarColor(actual: number, target: number): string {
  const ratio = actual / target;
  if (ratio >= 0.8 && ratio <= 1.2) return 'var(--mantine-color-teal-6)';
  if (ratio < 0.8) return 'var(--mantine-color-yellow-6)';
  return 'var(--mantine-color-orange-6)';
}

export function CheckInWeekBar({ weekSchedule }: CheckInWeekBarProps) {
  if (!weekSchedule || weekSchedule.length === 0) {
    return null;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const maxTSS = Math.max(
    ...weekSchedule.map((d) => Math.max(d.target_tss || 0, d.actual_tss || 0)),
    1
  );
  const barHeight = 72;

  return (
    <Box>
      <Group justify="space-between" align="center" mb="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          This Week
        </Text>
        <Group gap={12}>
          <Group gap={4} align="center">
            <Box style={{ width: 10, height: 10, border: '2px solid var(--mantine-color-gray-4)', background: 'transparent' }} />
            <Text size="xs" c="dimmed">Planned</Text>
          </Group>
          <Group gap={4} align="center">
            <Box style={{ width: 10, height: 10, background: 'var(--mantine-color-teal-6)' }} />
            <Text size="xs" c="dimmed">Actual</Text>
          </Group>
        </Group>
      </Group>

      <Group gap={4} align="flex-end" style={{ height: barHeight + 40 }}>
        {weekSchedule.map((day, idx) => {
          const isFuture = day.scheduled_date ? day.scheduled_date > todayStr : false;
          const isToday = day.scheduled_date === todayStr;
          const isPast = day.scheduled_date ? day.scheduled_date < todayStr : false;
          const isCompleted = !isFuture && day.completed;
          const isMissed = isPast && !isCompleted && (day.target_tss || 0) > 0;

          const actualTss = isCompleted ? (day.actual_tss || 0) : 0;
          const targetTss = day.target_tss || 0;

          const targetBarH = targetTss ? (targetTss / maxTSS) * barHeight : 0;
          const actualBarH = actualTss ? (actualTss / maxTSS) * barHeight : 0;

          const dayName = day.scheduled_date
            ? DAY_NAMES[new Date(day.scheduled_date + 'T12:00:00').getDay()]
            : DAY_NAMES[day.day_of_week] ?? `Day ${day.day_of_week}`;
          const workoutType = day.workout_type || 'rest';

          // Tooltip
          let tooltipText: string;
          if (isCompleted) {
            tooltipText = `${dayName}: ${actualTss} / ${targetTss} TSS (${workoutType})`;
          } else if (isMissed) {
            tooltipText = `${dayName}: Missed — ${targetTss} TSS planned (${workoutType})`;
          } else if (isToday) {
            tooltipText = `${dayName}: Today — ${targetTss} TSS planned (${workoutType})`;
          } else {
            tooltipText = `${dayName}: ${targetTss} TSS planned (${workoutType})`;
          }

          // TSS label under bars
          const tssLabel = isCompleted
            ? `${actualTss}/${targetTss}`
            : targetTss > 0
              ? `${targetTss}`
              : '';

          return (
            <Tooltip key={`${day.day_of_week}-${idx}`} label={tooltipText} position="top" withArrow>
              <Stack gap={2} align="center" style={{ flex: 1, minWidth: 0 }}>
                {/* Bar area */}
                <Box style={{ position: 'relative', width: '100%', height: barHeight, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
                  {/* Planned bar (left) — outline style */}
                  {targetBarH > 0 && (
                    <Box
                      style={{
                        width: '40%',
                        height: Math.max(targetBarH, 4),
                        border: `2px solid ${isMissed ? 'var(--mantine-color-red-4)' : 'var(--mantine-color-gray-4)'}`,
                        background: isMissed ? 'var(--mantine-color-red-0)' : 'transparent',
                        borderStyle: isFuture ? 'dashed' : 'solid',
                        opacity: isFuture ? 0.5 : 1,
                      }}
                    />
                  )}
                  {/* Actual bar (right) — solid fill */}
                  {isCompleted && actualBarH > 0 ? (
                    <Box
                      style={{
                        width: '40%',
                        height: Math.max(actualBarH, 4),
                        background: getActualBarColor(actualTss, targetTss),
                      }}
                    />
                  ) : targetBarH > 0 ? (
                    // Empty placeholder to maintain side-by-side layout
                    <Box style={{ width: '40%' }} />
                  ) : null}
                </Box>

                {/* TSS label */}
                <Text size={10} c="dimmed" ta="center" style={{ lineHeight: 1.1 }}>
                  {tssLabel}
                </Text>

                {/* Day label */}
                <Text
                  size="xs"
                  fw={isToday ? 700 : 500}
                  c={isToday ? 'teal' : isMissed ? 'red' : 'dimmed'}
                >
                  {dayName}
                </Text>
              </Stack>
            </Tooltip>
          );
        })}
      </Group>
    </Box>
  );
}
