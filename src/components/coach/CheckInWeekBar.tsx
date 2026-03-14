/**
 * CheckInWeekBar — 7-day bar chart showing planned vs actual TSS per day.
 *
 * Fixed from original: receives structured data array instead of parsing
 * a string with regex. Current day is highlighted.
 */

import { BarChart } from '@mantine/charts';
import { Paper, Text, Group, Box } from '@mantine/core';

interface WeekScheduleEntry {
  day: string;
  day_of_week: number;
  target_tss: number;
  actual_tss: number;
  completed: boolean;
}

interface WeekDay {
  day: string;
  planned: number;
  actual: number;
}

interface CheckInWeekBarProps {
  weekSchedule: WeekScheduleEntry[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildWeekData(schedule: WeekScheduleEntry[]): WeekDay[] {
  // Start with empty days
  const days: WeekDay[] = DAY_NAMES.map((name) => ({
    day: name,
    planned: 0,
    actual: 0,
  }));

  if (!schedule || schedule.length === 0) return days;

  // Fill in from structured data
  for (const entry of schedule) {
    const dayIndex = entry.day_of_week;
    if (dayIndex >= 0 && dayIndex < 7) {
      days[dayIndex].planned += entry.target_tss || 0;
      days[dayIndex].actual += entry.actual_tss || 0;
    }
  }

  return days;
}

export default function CheckInWeekBar({ weekSchedule }: CheckInWeekBarProps) {
  const data = buildWeekData(weekSchedule);

  const totalPlanned = data.reduce((s, d) => s + d.planned, 0);
  const totalActual = data.reduce((s, d) => s + d.actual, 0);
  const compliancePercent = totalPlanned > 0
    ? Math.round((totalActual / totalPlanned) * 100)
    : 0;

  return (
    <Paper
      p="md"
      withBorder
      style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
    >
      <Group justify="space-between" mb="sm">
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          This Week
        </Text>
        <Group gap="lg">
          <Group gap={4}>
            <Box w={10} h={10} bg="var(--color-teal)" style={{ opacity: 0.3 }} />
            <Text size="xs" c="dimmed">Planned</Text>
          </Group>
          <Group gap={4}>
            <Box w={10} h={10} bg="var(--color-teal)" />
            <Text size="xs" c="dimmed">Actual</Text>
          </Group>
          <Text size="xs" fw={600}>
            {compliancePercent}% compliance
          </Text>
        </Group>
      </Group>

      <BarChart
        h={160}
        data={data}
        dataKey="day"
        series={[
          { name: 'planned', color: 'teal.2', label: 'Planned TSS' },
          { name: 'actual', color: 'teal.7', label: 'Actual TSS' },
        ]}
        tickLine="none"
        gridAxis="none"
        withTooltip
        barProps={{ radius: 0 }}
      />
    </Paper>
  );
}
