import React, { useMemo } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SubHeading, kicker, mono, tooltipStyle, useChartColors } from './progressUi.jsx';
import { isRunningActivity } from '../../utils/sportType';
import { formatPace, formatPaceClock, paceForUnits, paceSecPerKm } from '../../utils/paceFormat';
import { BEST_EFFORT_TARGETS, mergeBests } from '../../utils/runBestEfforts';

// ============================================================================
// PACE — the running section of the Progress tab (multisport phase 4): best
// efforts and the weekly pace trend. Rides keep the Power section.
// ============================================================================

/** Runs of at least this long count toward the pace trend (strides are noise). */
const TREND_MIN_SECONDS = 20 * 60;
const TREND_WEEKS = 12;

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
}

/** Weekly median pace (s/km) of runs of 20+ minutes, oldest first. */
export function weeklyPaceTrend(runs, now = new Date(), weeks = TREND_WEEKS) {
  const first = weekStart(now);
  first.setDate(first.getDate() - 7 * (weeks - 1));
  const buckets = new Map();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + 7 * i);
    buckets.set(d.getTime(), []);
  }
  for (const run of runs) {
    if (!(run.moving_time >= TREND_MIN_SECONDS)) continue;
    const pace = paceSecPerKm(run.distance, run.moving_time);
    if (pace == null) continue;
    const key = weekStart(run.start_date).getTime();
    if (buckets.has(key)) buckets.get(key).push(pace);
  }
  return [...buckets.entries()].map(([key, paces]) => {
    const sorted = paces.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const d = new Date(key);
    return { week: `${d.getMonth() + 1}/${d.getDate()}`, pace: median, runs: sorted.length };
  });
}

function formatEffortTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const SOURCE_LABEL = { stream: 'GPS', whole_run: 'Whole run' };
const SOURCE_NOTE = {
  stream: 'Fastest stretch inside a run, from its GPS track.',
  whole_run: 'Average pace of a whole run at least this long — no GPS track to look inside.',
};

const PaceSection = React.memo(function PaceSection({ activities, isImperial = false }) {
  const colors = useChartColors();
  const runs = useMemo(() => (activities || []).filter((a) => isRunningActivity(a)), [activities]);
  const streamed = useMemo(() => runs.filter((r) => r.activity_streams?.coords && r.activity_streams?.speed), [runs]);
  const bests = useMemo(() => mergeBests(runs, streamed), [runs, streamed]);
  const trend = useMemo(() => weeklyPaceTrend(runs), [runs]);
  const hasTrend = trend.filter((t) => t.pace != null).length >= 2;

  if (runs.length === 0) {
    return (
      <Text size="sm" c="var(--color-text-muted)">
        No runs yet. Your best efforts and pace trend show up here once you log a few.
      </Text>
    );
  }

  return (
    <Stack gap="xl">
      <Box>
        <SubHeading>Best efforts</SubHeading>
        <Box
          data-testid="pace-best-efforts"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {BEST_EFFORT_TARGETS.map((target) => {
            const best = bests.find((b) => b.key === target.key);
            return (
              <Box key={target.key} style={{ padding: '10px 12px', borderLeft: '1px solid var(--color-border)' }}>
                <Text style={kicker}>{target.label}</Text>
                <Text style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 2 }}>
                  {best ? formatEffortTime(best.seconds) : '--'}
                </Text>
                {best && (
                  <Group gap={6} mt={2} wrap="nowrap">
                    <Text size="xs" c="var(--color-text-secondary)" style={mono}>
                      {formatPace(best.paceSecPerKm, isImperial)}
                    </Text>
                    <Text
                      size="xs"
                      title={SOURCE_NOTE[best.source]}
                      data-testid={`pace-source-${target.key}`}
                      style={{
                        ...mono,
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        border: '1px solid var(--color-border)',
                        padding: '0 4px',
                      }}
                    >
                      {SOURCE_LABEL[best.source]}
                    </Text>
                  </Group>
                )}
              </Box>
            );
          })}
        </Box>
        <Text size="xs" c="var(--color-text-muted)" mt={6}>
          GPS: the fastest stretch inside a run. Whole run: a run&apos;s average pace, used where there&apos;s no GPS track.
        </Text>
      </Box>

      {hasTrend && (
        <Box>
          <SubHeading>Pace trend, {TREND_WEEKS} weeks</SubHeading>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} />
              {/* Reversed: faster (fewer seconds) plots higher. */}
              <YAxis
                reversed
                domain={['dataMin - 10', 'dataMax + 10']}
                tickFormatter={(v) => formatPaceClock(paceForUnits(v, isImperial))}
                tick={{ fontSize: 11, fill: colors.axis }}
                width={44}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, _n, item) => [
                  `${formatPace(v, isImperial)} · ${item?.payload?.runs ?? 0} run${item?.payload?.runs === 1 ? '' : 's'}`,
                  'Median pace',
                ]}
              />
              <Line
                type="monotone"
                dataKey="pace"
                stroke={colors.fitness}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <Text size="xs" c="var(--color-text-muted)">
            Weekly median pace of runs of 20 minutes or more.
          </Text>
        </Box>
      )}
    </Stack>
  );
});

export default PaceSection;
