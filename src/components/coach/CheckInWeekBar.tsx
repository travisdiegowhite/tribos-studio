/**
 * CheckInWeekBar — 7-day tally showing planned vs actual TSS per day.
 *
 * Uses LIVE data from TrainingDashboard (same source as the main calendar)
 * instead of stale check-in snapshot data.
 */

import { useMemo } from 'react';
import { Paper, Text, Group, Box, SimpleGrid, Stack } from '@mantine/core';
import { calculateTSS, estimateTSS } from '../../utils/trainingPlans';

interface CheckInWeekBarProps {
  plannedWorkouts?: any[];
  activities?: any[];
  ftp?: number | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Get Monday-to-Sunday date range for the current week */
function getCurrentWeekRange(): { start: Date; end: Date; dates: Date[] } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  const sunday = new Date(dates[6]);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday, dates };
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getActivityTSS(activity: any, ftp: number | null): number {
  if (activity.tss != null && activity.tss > 0) return Math.min(activity.tss, 500);
  if (activity.average_watts && ftp) {
    const tss = calculateTSS(activity.moving_time, activity.average_watts, ftp);
    return Math.min(tss || 0, 500);
  }
  return Math.min(
    estimateTSS(
      (activity.moving_time || 0) / 60,
      (activity.distance || 0) / 1000,
      activity.total_elevation_gain || 0,
      'endurance'
    ),
    500
  );
}

interface DayData {
  label: string;        // Mon, Tue, ...
  dateKey: string;      // 2026-03-16
  planned: number;
  actual: number;
  diff: number;
  isToday: boolean;
  isPast: boolean;
}

export default function CheckInWeekBar({
  plannedWorkouts = [],
  activities = [],
  ftp = null,
}: CheckInWeekBarProps) {
  const week = useMemo(() => getCurrentWeekRange(), []);
  const todayKey = toDateKey(new Date());

  const days: DayData[] = useMemo(() => {
    // Index planned TSS by date
    const plannedByDate: Record<string, number> = {};
    for (const w of plannedWorkouts) {
      if (!w.scheduled_date) continue;
      const key = w.scheduled_date.split('T')[0];
      plannedByDate[key] = (plannedByDate[key] || 0) + (w.target_tss || 0);
    }

    // Index actual TSS by date
    const actualByDate: Record<string, number> = {};
    for (const a of activities) {
      if (!a.start_date) continue;
      const key = new Date(a.start_date).toISOString().split('T')[0];
      // Only count activities within this week
      const aDate = new Date(a.start_date);
      if (aDate >= week.start && aDate <= week.end) {
        actualByDate[key] = (actualByDate[key] || 0) + getActivityTSS(a, ftp);
      }
    }

    return week.dates.map((date) => {
      const key = toDateKey(date);
      const dayIndex = date.getDay();
      // Reorder: week.dates is Mon-Sun, but getDay() gives 0=Sun
      const label = DAY_NAMES[dayIndex];
      const planned = Math.round(plannedByDate[key] || 0);
      const actual = Math.round(actualByDate[key] || 0);
      return {
        label,
        dateKey: key,
        planned,
        actual,
        diff: actual - planned,
        isToday: key === todayKey,
        isPast: date < new Date() && key !== todayKey,
      };
    });
  }, [plannedWorkouts, activities, ftp, week, todayKey]);

  const totalPlanned = days.reduce((s, d) => s + d.planned, 0);
  const totalActual = days.reduce((s, d) => s + d.actual, 0);
  const totalDiff = totalActual - totalPlanned;

  return (
    <Paper
      p="md"
      withBorder
      style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
    >
      <Group justify="space-between" mb="xs">
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          This Week
        </Text>
        <Group gap="lg">
          <Group gap={4}>
            <Box w={8} h={8} style={{ backgroundColor: 'var(--mantine-color-teal-2)', borderRadius: 0 }} />
            <Text size="xs" c="dimmed">Plan</Text>
          </Group>
          <Group gap={4}>
            <Box w={8} h={8} style={{ backgroundColor: 'var(--mantine-color-teal-7)', borderRadius: 0 }} />
            <Text size="xs" c="dimmed">Actual</Text>
          </Group>
        </Group>
      </Group>

      {/* Daily tally grid */}
      <SimpleGrid cols={7} spacing={4}>
        {days.map((d) => {
          const hasPlan = d.planned > 0;
          const hasActivity = d.actual > 0;
          const diffColor = d.diff > 0 ? 'teal' : d.diff < 0 ? 'red' : 'dimmed';
          const maxTSS = Math.max(d.planned, d.actual, 1);

          return (
            <Stack
              key={d.dateKey}
              gap={2}
              align="center"
              p={4}
              style={{
                borderRadius: 0,
                border: d.isToday ? '1px solid var(--mantine-color-teal-6)' : '1px solid transparent',
                backgroundColor: d.isToday ? 'var(--mantine-color-teal-0)' : undefined,
                opacity: d.isPast && !hasActivity && !hasPlan ? 0.4 : 1,
              }}
            >
              {/* Day label */}
              <Text
                size="xs"
                fw={d.isToday ? 700 : 500}
                ff="monospace"
                c={d.isToday ? 'teal' : 'dimmed'}
              >
                {d.label}
              </Text>

              {/* Mini bar: planned vs actual */}
              <Box w="100%" style={{ position: 'relative', height: 32 }}>
                {/* Planned bar (lighter, behind) */}
                {hasPlan && (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '10%',
                      width: '35%',
                      height: `${Math.max((d.planned / maxTSS) * 100, 8)}%`,
                      backgroundColor: 'var(--mantine-color-teal-2)',
                      borderRadius: 0,
                    }}
                  />
                )}
                {/* Actual bar (darker, front) */}
                {hasActivity && (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: '10%',
                      width: '35%',
                      height: `${Math.max((d.actual / maxTSS) * 100, 8)}%`,
                      backgroundColor: 'var(--mantine-color-teal-7)',
                      borderRadius: 0,
                    }}
                  />
                )}
                {/* Empty state */}
                {!hasPlan && !hasActivity && (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '25%',
                      width: '50%',
                      height: 1,
                      backgroundColor: 'var(--mantine-color-gray-3)',
                    }}
                  />
                )}
              </Box>

              {/* Planned / Actual numbers */}
              <Text size="10px" ff="monospace" c="dimmed" lh={1}>
                {hasPlan || hasActivity
                  ? `${d.planned}/${d.actual}`
                  : '—'}
              </Text>

              {/* Diff */}
              {(hasPlan || hasActivity) && (
                <Text size="10px" ff="monospace" fw={600} c={diffColor} lh={1}>
                  {d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? '0' : d.diff}
                </Text>
              )}
            </Stack>
          );
        })}
      </SimpleGrid>

      {/* Weekly totals */}
      <Group justify="space-between" mt="xs" pt="xs" style={{ borderTop: '1px solid var(--tribos-border-default)' }}>
        <Text size="xs" ff="monospace" c="dimmed">
          Plan: <Text span fw={600} c="var(--mantine-color-teal-2)">{totalPlanned}</Text>
          {' / '}
          Actual: <Text span fw={600} c="var(--mantine-color-teal-7)">{totalActual}</Text>
        </Text>
        <Text size="xs" ff="monospace" fw={700} c={totalDiff >= 0 ? 'teal' : 'red'}>
          {totalDiff > 0 ? '+' : ''}{totalDiff} TSS
          {totalPlanned > 0 && (
            <Text span c="dimmed" fw={400}>
              {' '}({Math.round((totalActual / totalPlanned) * 100)}%)
            </Text>
          )}
        </Text>
      </Group>
    </Paper>
  );
}
