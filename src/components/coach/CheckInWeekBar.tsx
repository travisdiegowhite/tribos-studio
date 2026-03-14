import React from 'react';
import { Box, Group, Text, Stack, Tooltip } from '@mantine/core';

interface WeekDay {
  day_of_week: number;  // 0=Sunday, 6=Saturday
  workout_type: string | null;
  target_tss: number | null;
  actual_tss: number | null;
  completed: boolean;
  scheduled_date: string | null;
}

interface CheckInWeekBarProps {
  weekSchedule: WeekDay[];
}

// 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CheckInWeekBar({ weekSchedule }: CheckInWeekBarProps) {
  if (!weekSchedule || weekSchedule.length === 0) {
    return null;
  }

  const todayForMax = new Date().toISOString().split('T')[0];
  const maxTSS = Math.max(
    ...weekSchedule.map((d) => {
      const actual = (d.scheduled_date && d.scheduled_date > todayForMax) ? 0 : (d.actual_tss || 0);
      return Math.max(d.target_tss || 0, actual);
    }),
    1
  );

  return (
    <Box>
      <Text size="xs" fw={600} c="dimmed" mb="xs" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
        This Week
      </Text>
      <Group gap="xs" align="flex-end" style={{ height: 80 }}>
        {weekSchedule.map((day, idx) => {
          // Date guard: don't trust completed/actual_tss for future dates
          const todayStr = new Date().toISOString().split('T')[0];
          const isFuture = day.scheduled_date ? day.scheduled_date > todayStr : false;
          const actualTss = isFuture ? null : day.actual_tss;
          const isCompleted = isFuture ? false : day.completed;

          const targetHeight = day.target_tss ? (day.target_tss / maxTSS) * 60 + 4 : 4;
          const actualHeight = actualTss ? (actualTss / maxTSS) * 60 + 4 : 0;
          const dayName = DAY_NAMES[day.day_of_week] ?? `Day ${day.day_of_week}`;
          const workoutType = day.workout_type || 'rest';

          let barColor = 'var(--mantine-color-gray-3)';
          if (isCompleted && actualTss && day.target_tss) {
            const ratio = actualTss / day.target_tss;
            if (ratio >= 0.8 && ratio <= 1.2) {
              barColor = 'var(--mantine-color-teal-6)';
            } else if (ratio < 0.8) {
              barColor = 'var(--mantine-color-yellow-6)';
            } else {
              barColor = 'var(--mantine-color-orange-6)';
            }
          } else if (isCompleted) {
            barColor = 'var(--mantine-color-teal-6)';
          }

          const tooltipText = isCompleted
            ? `${dayName}: ${actualTss || 0} / ${day.target_tss || 0} TSS (${workoutType})`
            : `${dayName}: ${day.target_tss || 0} TSS planned (${workoutType})`;

          return (
            <Tooltip key={`${day.day_of_week}-${idx}`} label={tooltipText} position="top" withArrow>
              <Stack gap={2} align="center" style={{ flex: 1 }}>
                <Box style={{ position: 'relative', width: '100%', height: 64, display: 'flex', alignItems: 'flex-end' }}>
                  {/* Target bar (background) */}
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '15%',
                      width: '70%',
                      height: targetHeight,
                      background: 'var(--mantine-color-gray-2)',
                      borderRadius: 0,
                      opacity: 0.5,
                    }}
                  />
                  {/* Actual bar (foreground) */}
                  {actualHeight > 0 && (
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '15%',
                        width: '70%',
                        height: actualHeight,
                        background: barColor,
                        borderRadius: 0,
                      }}
                    />
                  )}
                </Box>
                <Text size="xs" c="dimmed" fw={500}>{dayName}</Text>
              </Stack>
            </Tooltip>
          );
        })}
      </Group>
    </Box>
  );
}
