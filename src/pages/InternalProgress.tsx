/**
 * Fitness Progress Chart — CTL and TFI as peer lines.
 *
 * CTL (Chronic Training Load): standard EWA τ=42, computed client-side from
 * stored RSS/TSS values on activities.
 * TFI (Training Fitness Index): adaptive τ, server-computed and stored in
 * training_load_daily.tfi.
 *
 * Route: /internal/progress (accessible to all authenticated users)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container, Title, Text, Group, Badge, Stack, Button, SegmentedControl,
  Alert, Loader, Center, Box, ActionIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { ArrowsClockwise, Warning } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import AppShell from '../components/AppShell.jsx';
import { getTodayString, formatLocalDate, parseLocalDate } from '../utils/dateUtils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CTL_COLOR       = '#2A8C82';
const TFI_COLOR       = '#C49A0A';
const SEASON_START    = '2026-01-01';
const BOULDER_ROUBAIX = '2026-04-26';
const BWR             = '2026-05-03';
const CTL_TAU         = 42;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Activity {
  id: string;
  name: string;
  type: string;
  start_date: string;
  moving_time: number | null;
  distance: number | null;
  total_elevation_gain: number | null;
  average_watts: number | null;
  average_heartrate: number | null;
  kilojoules: number | null;
  rss: number | null;
  tss: number | null;
  effective_power: number | null;
  normalized_power: number | null;
}

interface TLDRow {
  date: string;
  tfi: number | null;
  tfi_tau: number | null;
}

interface RaceGoal {
  id: string;
  name: string;
  race_date: string;
  priority: string;
  target_tfi_min: number | null;
  target_tfi_max: number | null;
}

interface ChartRow {
  date: string;
  ctl: number | null;
  tfi: number | null;
  activity: Activity | null;
  tfi_tau: number | null;
}

type WindowOption = '30' | '90' | 'jan1';
type Status = 'ON_TRACK' | 'OFF_TARGET' | 'RUNNING_HOT' | null;

const STATUS_CONFIG: Record<NonNullable<Status>, { color: string; label: string }> = {
  ON_TRACK:    { color: 'teal',   label: 'ON TRACK' },
  OFF_TARGET:  { color: 'red',    label: 'OFF TARGET' },
  RUNNING_HOT: { color: 'yellow', label: 'RUNNING HOT' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBefore(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() - n);
  return formatLocalDate(d) ?? dateStr;
}

function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + n);
  return formatLocalDate(d) ?? dateStr;
}

function estimateRSS(a: Activity, ftp: number | null): number {
  const stored = (a.rss ?? a.tss);
  if (stored && stored > 0) return Math.min(stored, 500);

  const durationHours = (a.moving_time || 0) / 3600;
  if (durationHours === 0) return 0;

  const power = a.effective_power ?? a.normalized_power ?? a.average_watts;
  if (power && power > 0 && ftp && ftp > 0) {
    const ri = power / ftp;
    return Math.min(Math.round(durationHours * ri * ri * 100), 500);
  }

  if (a.kilojoules && a.kilojoules > 0) {
    const avgPower = (a.kilojoules * 1000) / (a.moving_time || 1);
    const effectiveFtp = (ftp && ftp > 0) ? ftp : 200;
    const ri = avgPower / effectiveFtp;
    return Math.min(Math.round(durationHours * ri * ri * 100), 500);
  }

  const elevM = a.total_elevation_gain || 0;
  return Math.min(Math.round(durationHours * 50 + (elevM / 300) * 10), 500);
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const ProgressTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const ctlEntry = payload.find((p: any) => p.dataKey === 'ctl');
  const tfiEntry = payload.find((p: any) => p.dataKey === 'tfi');
  const activity = payload[0]?.payload?.activity as Activity | null;
  return (
    <Box
      style={{
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-4)',
        padding: '8px 12px',
        fontFamily: 'monospace',
      }}
    >
      <Text size="xs" fw={700} mb={4}>{label}</Text>
      {ctlEntry?.value != null && (
        <Text size="xs" style={{ color: CTL_COLOR }}>CTL: {Number(ctlEntry.value).toFixed(1)}</Text>
      )}
      {tfiEntry?.value != null && (
        <Text size="xs" style={{ color: TFI_COLOR }}>TFI: {Number(tfiEntry.value).toFixed(1)}</Text>
      )}
      {activity && (
        <Text size="xs" c="dimmed" mt={2}>{activity.name}</Text>
      )}
    </Box>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InternalProgress() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const TODAY = getTodayString();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [tldRows, setTldRows] = useState<TLDRow[]>([]);
  const [nextRace, setNextRace] = useState<RaceGoal | null>(null);
  const [ftp, setFtp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window_, setWindow] = useState<WindowOption>('jan1');

  const windowStart = daysBefore(TODAY, 180);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [actResult, profileResult, tldResult, goalsResult] = await Promise.all([
        supabase
          .from('activities')
          .select(
            'id, name, type, start_date, moving_time, distance, ' +
            'total_elevation_gain, average_watts, average_heartrate, ' +
            'kilojoules, rss, tss, effective_power, normalized_power'
          )
          .eq('user_id', user.id)
          .or('is_hidden.eq.false,is_hidden.is.null')
          .is('duplicate_of', null)
          .gte('start_date', windowStart + 'T00:00:00Z')
          .order('start_date', { ascending: true }),

        supabase
          .from('user_profiles')
          .select('ftp')
          .eq('id', user.id)
          .maybeSingle(),

        supabase
          .from('training_load_daily')
          .select('date, tfi, tfi_tau')
          .eq('user_id', user.id)
          .gte('date', windowStart)
          .order('date', { ascending: true }),

        supabase
          .from('race_goals')
          .select('id, name, race_date, priority, target_tfi_min, target_tfi_max')
          .eq('user_id', user.id)
          .eq('status', 'upcoming')
          .gte('race_date', TODAY)
          .order('priority', { ascending: true })
          .order('race_date', { ascending: true })
          .limit(5),
      ]);

      if (actResult.error) throw actResult.error;

      setActivities((actResult.data ?? []) as Activity[]);
      setFtp(profileResult.data?.ftp ?? null);
      setTldRows((tldResult.data ?? []) as TLDRow[]);

      const goals = (goalsResult.data ?? []) as RaceGoal[];
      setNextRace(goals.find(g => g.priority === 'A') ?? goals[0] ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, windowStart, TODAY]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build daily CTL from activities using EWA
  const { chartRows, withActivity } = useMemo(() => {
    if (!activities) return { chartRows: [], withActivity: [] };

    // Activity lookup by date
    const actByDate: Record<string, { rss: number; activity: Activity }> = {};
    for (const a of activities) {
      const d = a.start_date?.slice(0, 10);
      if (!d) continue;
      if (!actByDate[d]) actByDate[d] = { rss: 0, activity: a };
      actByDate[d].rss += estimateRSS(a, ftp);
    }

    // TFI lookup by date
    const tfiByDate: Record<string, TLDRow> = {};
    for (const row of tldRows) {
      tfiByDate[row.date] = row;
    }

    // Walk day-by-day for 180 days, computing CTL via EWA
    let ctl = 0;
    const merged: ChartRow[] = [];
    const startDate = parseLocalDate(windowStart);
    if (!startDate) return { chartRows: [], withActivity: [] };

    for (let i = 0; i < 180; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i + 1);
      const dateStr = formatLocalDate(d) ?? '';
      if (dateStr > TODAY) break;

      const dayData = actByDate[dateStr];
      const rss = dayData?.rss ?? 0;
      ctl = ctl + (rss - ctl) / CTL_TAU;

      const tld = tfiByDate[dateStr];
      merged.push({
        date: dateStr,
        ctl: Math.round(ctl * 10) / 10,
        tfi: tld?.tfi ?? null,
        activity: dayData?.activity ?? null,
        tfi_tau: tld?.tfi_tau ?? null,
      });
    }

    // Extend to race date for ReferenceArea and race ReferenceLine rendering
    const extendTo = nextRace?.race_date
      ? addDays(nextRace.race_date, 1)
      : addDays(BWR, 1);
    const lastDate = merged[merged.length - 1]?.date ?? TODAY;
    const placeholders: ChartRow[] = [];
    let cursor = parseLocalDate(addDays(lastDate, 1));
    const end = parseLocalDate(extendTo);
    if (cursor && end) {
      while (cursor <= end) {
        placeholders.push({
          date: formatLocalDate(cursor) ?? '',
          ctl: null,
          tfi: null,
          activity: null,
          tfi_tau: null,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return { chartRows: [...merged, ...placeholders], withActivity: merged };
  }, [activities, ftp, tldRows, nextRace, windowStart, TODAY]);

  // Apply window filter
  const displayRows = useMemo(() => {
    const start =
      window_ === 'jan1' ? SEASON_START :
      window_ === '90'   ? daysBefore(TODAY, 90) :
                           daysBefore(TODAY, 30);
    return chartRows.filter(r => r.date >= start);
  }, [chartRows, window_, TODAY]);

  const tickInterval = useMemo(() => {
    const n = displayRows.length;
    if (n <= 45) return 6;
    if (n <= 100) return 10;
    return 14;
  }, [displayRows.length]);

  // Current values from last real row
  const lastReal = withActivity[withActivity.length - 1] ?? null;
  const currentCTL = lastReal?.ctl ?? null;
  const currentTFI = lastReal?.tfi ?? null;

  const status: Status = useMemo(() => {
    if (currentCTL == null || nextRace?.target_tfi_min == null || nextRace?.target_tfi_max == null) return null;
    if (currentCTL < nextRace.target_tfi_min) return 'OFF_TARGET';
    if (currentCTL > nextRace.target_tfi_max) return 'RUNNING_HOT';
    return 'ON_TRACK';
  }, [currentCTL, nextRace]);

  const fmt = (v: number | null, d = 1) => v != null ? v.toFixed(d) : '—';

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (loading) return (
    <AppShell>
      <Center h={300}><Loader color="teal" /></Center>
    </AppShell>
  );

  if (error) return (
    <AppShell>
      <Container size="xl" py="lg">
        <Alert icon={<Warning size={16} />} color="red" title="Error loading data">
          {error}
        </Alert>
        <Button mt="md" onClick={fetchData} leftSection={<ArrowsClockwise size={14} />}>Retry</Button>
      </Container>
    </AppShell>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const showTargetBand = nextRace?.target_tfi_min != null && nextRace?.target_tfi_max != null;

  return (
    <AppShell>
      <Container size="xl" py="lg" px={20}>
        <Stack gap={16}>

          {/* Header */}
          <Group justify="space-between" align="flex-end">
            <Stack gap={2}>
              <Title order={3} fw={700} style={{ fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                PROGRESS
              </Title>
              <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                CTL (τ=42) vs TFI (adaptive τ) · Season start Jan 1
              </Text>
            </Stack>
            <ActionIcon variant="subtle" onClick={fetchData} title="Refresh">
              <ArrowsClockwise size={16} />
            </ActionIcon>
          </Group>

          {/* Status readout */}
          <Group gap={32} wrap="wrap">
            <Box>
              <Group gap={10} align="center">
                <Text
                  style={{
                    fontFamily: 'monospace',
                    fontSize: isMobile ? 24 : 32,
                    fontWeight: 700,
                    color: CTL_COLOR,
                    lineHeight: 1,
                  }}
                >
                  {fmt(currentCTL)}
                </Text>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>CTL</Text>
                {status && (
                  <Badge color={STATUS_CONFIG[status].color} variant="filled" size="sm">
                    {STATUS_CONFIG[status].label}
                  </Badge>
                )}
              </Group>
              {showTargetBand && nextRace && (
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} mt={3}>
                  target {nextRace.target_tfi_min}–{nextRace.target_tfi_max} by {nextRace.name} ({nextRace.race_date.slice(5)})
                </Text>
              )}
            </Box>

            <Box>
              <Group gap={10} align="center">
                <Text
                  style={{
                    fontFamily: 'monospace',
                    fontSize: isMobile ? 24 : 32,
                    fontWeight: 700,
                    color: TFI_COLOR,
                    lineHeight: 1,
                  }}
                >
                  {fmt(currentTFI)}
                </Text>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>TFI</Text>
              </Group>
              {lastReal?.tfi_tau != null && (
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} mt={3}>
                  τ={lastReal.tfi_tau}d
                </Text>
              )}
            </Box>
          </Group>

          {/* Window selector */}
          <Group gap={12}>
            <Text size="sm" fw={600} style={{ fontFamily: 'monospace' }}>Window:</Text>
            <SegmentedControl
              size="xs"
              value={window_}
              onChange={v => setWindow(v as WindowOption)}
              data={[
                { label: '30d', value: '30' },
                { label: '90d', value: '90' },
                { label: 'Since Jan 1', value: 'jan1' },
              ]}
            />
          </Group>

          {/* Chart */}
          <Box style={{ border: '1px solid var(--mantine-color-dark-4)' }} p={16}>

            {/* Legend */}
            <Group gap={20} mb={12}>
              <Group gap={6} align="center">
                <Box style={{ width: 20, height: 2, backgroundColor: CTL_COLOR }} />
                <Text size="xs" style={{ fontFamily: 'monospace', color: CTL_COLOR }}>CTL (standard τ=42)</Text>
              </Group>
              <Group gap={6} align="center">
                <Box style={{ width: 20, height: 0, borderTop: `2px dashed ${TFI_COLOR}` }} />
                <Text size="xs" style={{ fontFamily: 'monospace', color: TFI_COLOR }}>TFI (adaptive τ)</Text>
              </Group>
            </Group>

            <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
              <LineChart data={displayRows} margin={{ top: 8, right: 40, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => String(d).slice(5)}
                  interval={tickInterval}
                />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <ChartTooltip content={<ProgressTooltip />} />

                {/* Target zone band */}
                {showTargetBand && nextRace && (
                  <ReferenceArea
                    x1={TODAY}
                    x2={nextRace.race_date}
                    y1={nextRace.target_tfi_min!}
                    y2={nextRace.target_tfi_max!}
                    fill={CTL_COLOR}
                    fillOpacity={0.10}
                    stroke={CTL_COLOR}
                    strokeOpacity={0.25}
                    label={{
                      value: 'CTL TARGET ZONE',
                      position: 'insideRight',
                      fontSize: 9,
                      fill: CTL_COLOR,
                      fontFamily: 'monospace',
                    }}
                  />
                )}

                {/* Race reference lines */}
                <ReferenceLine
                  x={BOULDER_ROUBAIX}
                  stroke={TFI_COLOR}
                  strokeWidth={1.5}
                  label={{ value: 'BR', fontSize: 9, fill: TFI_COLOR, position: 'top' }}
                />
                <ReferenceLine
                  x={BWR}
                  stroke={TFI_COLOR}
                  strokeWidth={1.5}
                  label={{ value: 'BWR', fontSize: 9, fill: TFI_COLOR, position: 'top' }}
                />

                {/* TODAY */}
                <ReferenceLine
                  x={TODAY}
                  stroke="var(--mantine-color-dark-3)"
                  strokeDasharray="4 2"
                  label={{ value: 'TODAY', fontSize: 8, fill: 'var(--mantine-color-dark-3)', position: 'top' }}
                />

                {/* CTL — teal solid, dots on activity days */}
                <Line
                  type="monotone"
                  dataKey="ctl"
                  name="CTL"
                  stroke={CTL_COLOR}
                  strokeWidth={2}
                  dot={(props: any) => {
                    if (!props.payload?.activity || props.payload.ctl == null) {
                      return <g key={props.key} />;
                    }
                    return (
                      <circle
                        key={props.key}
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill={CTL_COLOR}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 5, fill: CTL_COLOR }}
                  connectNulls={false}
                />

                {/* TFI — gold dashed, gaps where null */}
                <Line
                  type="monotone"
                  dataKey="tfi"
                  name="TFI"
                  stroke={TFI_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={{ r: 4, fill: TFI_COLOR }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          {/* Race info */}
          {nextRace && !showTargetBand && (
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
              Next race: {nextRace.name} · {nextRace.race_date} · no target range set
            </Text>
          )}

        </Stack>
      </Container>
    </AppShell>
  );
}
