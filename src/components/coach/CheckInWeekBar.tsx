/**
 * CheckInWeekBar — 7-day bar chart showing planned vs actual TSS per day.
 * Current day is highlighted. Uses Mantine Charts BarChart.
 */

import { BarChart } from '@mantine/charts';
import { Paper, Text, Group, Box } from '@mantine/core';

interface WeekDay {
  day: string;
  planned: number;
  actual: number;
  isToday: boolean;
}

interface CheckInWeekBarProps {
  weekSchedule: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseWeekSchedule(schedule: string): WeekDay[] {
  const today = new Date().getDay(); // 0=Sun
  const days: WeekDay[] = DAY_NAMES.map((name, i) => ({
    day: name,
    planned: 0,
    actual: 0,
    isToday: i === today,
  }));

  if (!schedule || schedule === 'No planned workouts this week.') {
    return days;
  }

  const lines = schedule.split('\n');
  for (const line of lines) {
    const match = line.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat):/);
    if (!match) continue;

    const dayName = match[1];
    const dayIndex = DAY_NAMES.indexOf(dayName);
    if (dayIndex < 0) continue;

    const plannedMatch = line.match(/planned=(\d+)/);
    const actualMatch = line.match(/actual=(\d+)/);

    if (plannedMatch) days[dayIndex].planned = parseInt(plannedMatch[1], 10);
    if (actualMatch) days[dayIndex].actual = parseInt(actualMatch[1], 10);
  }

  return days;
}

export default function CheckInWeekBar({ weekSchedule }: CheckInWeekBarProps) {
  const data = parseWeekSchedule(weekSchedule);

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
