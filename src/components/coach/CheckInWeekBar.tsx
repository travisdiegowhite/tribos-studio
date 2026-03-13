import React from 'react';
import { Box, Group, Text, Stack, Tooltip } from '@mantine/core';

interface WeekDay {
  day: number;
  type: string;
  target_tss: number | null;
  actual_tss: number | null;
  completed: boolean;
  date: string | null;
}

interface CheckInWeekBarProps {
  weekSchedule: WeekDay[];
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CheckInWeekBar({ weekSchedule }: CheckInWeekBarProps) {
  if (!weekSchedule || weekSchedule.length === 0) {
    return null;
  }

  const maxTSS = Math.max(
    ...weekSchedule.map((d) => Math.max(d.target_tss || 0, d.actual_tss || 0)),
    1
  );

  return (
    <Box>
      <Text size="xs" fw={600} c="dimmed" mb="xs" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
        This Week
      </Text>
      <Group gap="xs" align="flex-end" style={{ height: 80 }}>
        {weekSchedule.map((day) => {
          const targetHeight = day.target_tss ? (day.target_tss / maxTSS) * 60 + 4 : 4;
          const actualHeight = day.actual_tss ? (day.actual_tss / maxTSS) * 60 + 4 : 0;
          const dayName = DAY_NAMES[day.day] || `D${day.day}`;

          let barColor = 'var(--mantine-color-gray-3)';
          if (day.completed && day.actual_tss && day.target_tss) {
            const ratio = day.actual_tss / day.target_tss;
            if (ratio >= 0.8 && ratio <= 1.2) {
              barColor = 'var(--mantine-color-teal-6)';
            } else if (ratio < 0.8) {
              barColor = 'var(--mantine-color-yellow-6)';
            } else {
              barColor = 'var(--mantine-color-orange-6)';
            }
          } else if (day.completed) {
            barColor = 'var(--mantine-color-teal-6)';
          }

          const tooltipText = day.completed
            ? `${dayName}: ${day.actual_tss || 0} / ${day.target_tss || 0} TSS (${day.type})`
            : `${dayName}: ${day.target_tss || 0} TSS planned (${day.type})`;

          return (
            <Tooltip key={day.day} label={tooltipText} position="top" withArrow>
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
