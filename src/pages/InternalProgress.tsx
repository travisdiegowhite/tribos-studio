/**
 * Internal PROGRESS chart — Travis-only (travisdiegowhite@gmail.com).
 *
 * Shows CTL (standard τ=42, from computeFitnessMetrics) and TFI (adaptive τ,
 * server-stored in training_load_daily) as equal-weight peer lines from Jan 1
 * through the next A-race date. Used to collect race-day data for the
 * CTL-vs-TFI audit (Boulder Roubaix Apr 26, BWR May 3).
 *
 * Route: /internal/progress
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
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

const AUDIT_EMAIL     = 'travisdiegowhite@gmail.com';
const CTL_COLOR       = '#2A8C82';
const TFI_COLOR       = '#C49A0A';
const SEASON_START    = '2026-01-01';
const BOULDER_ROUBAIX = '2026-04-26';
const BWR             = '2026-05-03';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyRow {
  date: string;
  rss: number;
  ctl: number;
  atl: number;
  tsb: number;
  tfi: number | null;
  afi: number | null;
  form_score: number | null;
  tfi_minus_ctl: number | null;
  rss_source: string | null;
  confidence: number | null;
  tfi_tau: number | null;
}

interface Activity {
  id: string;
  name: string;
  type: string;
  start_date: string;
  moving_time: number | null;
  rss: number | null;
  tss: number | null;
}

interface AuditData {
  through_date: string;
  daily: DailyRow[];
  activities: Activity[];
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

  // Gate: redirect non-Travis users
  if (user && user.email?.toLowerCase() !== AUDIT_EMAIL.toLowerCase()) {
    return <Navigate to="/today" replace />;
  }

  const TODAY = getTodayString();

  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [nextRace, setNextRace] = useState<RaceGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window_, setWindow] = useState<WindowOption>('jan1');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch audit data and race goals in parallel
      const [auditResult, goalsResult] = await Promise.all([
        (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error('Not authenticated');
          const res = await fetch('/api/internal/fitness-audit', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error((body as any).error || `HTTP ${res.status}`);
          }
          return res.json() as Promise<AuditData>;
        })(),
        (async () => {
          const { data, error: goalsError } = await supabase
            .from('race_goals')
            .select('id, name, race_date, priority, target_tfi_min, target_tfi_max')
            .eq('user_id', user.id)
            .eq('status', 'upcoming')
            .gte('race_date', TODAY)
            .order('priority', { ascending: true })
            .order('race_date', { ascending: true })
            .limit(5);
          // Treat "table does not exist" as no data, not an error
          if (goalsError?.code === '42P01' || goalsError?.message?.includes('does not exist')) {
            return [] as RaceGoal[];
          }
          if (goalsError) throw goalsError;
          return (data ?? []) as RaceGoal[];
        })(),
      ]);

      setAuditData(auditResult);
      const goals = goalsResult as RaceGoal[];
      setNextRace(goals.find(g => g.priority === 'A') ?? goals[0] ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user, TODAY]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build chart data: season-filtered, activity-merged, extended to race date
  const { chartRows, withActivity } = useMemo(() => {
    if (!auditData) return { chartRows: [], withActivity: [] };

    const filtered = auditData.daily.filter(r => r.date >= SEASON_START);

    // Build activity lookup by date
    const actByDate: Record<string, Activity> = {};
    for (const a of auditData.activities) {
      const d = a.start_date?.slice(0, 10);
      if (d && !actByDate[d]) actByDate[d] = a;
    }

    const merged: ChartRow[] = filtered.map(r => ({
      date: r.date,
      ctl: r.ctl,
      tfi: r.tfi ?? null,
      activity: actByDate[r.date] ?? null,
      tfi_tau: r.tfi_tau ?? null,
    }));

    // Extend data array from tomorrow through race_date + 1 day so that
    // ReferenceArea x1/x2 and race ReferenceLine values resolve on the axis.
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
  }, [auditData, nextRace, TODAY]);

  // Apply window filter
  const displayRows = useMemo(() => {
    const windowStart =
      window_ === 'jan1' ? SEASON_START :
      window_ === '90'   ? daysBefore(TODAY, 90) :
                           daysBefore(TODAY, 30);
    return chartRows.filter(r => r.date >= windowStart);
  }, [chartRows, window_, TODAY]);

  // Tick interval based on display range length
  const tickInterval = useMemo(() => {
    const n = displayRows.length;
    if (n <= 45) return 6;
    if (n <= 100) return 10;
    return 14;
  }, [displayRows.length]);

  // Current values from last real (non-placeholder) row
  const lastReal = withActivity[withActivity.length - 1] ?? null;
  const currentCTL = lastReal?.ctl ?? null;
  const currentTFI = lastReal?.tfi ?? null;

  // Status logic
  const status: Status = useMemo(() => {
    if (currentCTL == null || nextRace?.target_tfi_min == null || nextRace?.target_tfi_max == null) return null;
    if (currentCTL < nextRace.target_tfi_min) return 'OFF_TARGET';
    if (currentCTL > nextRace.target_tfi_max) return 'RUNNING_HOT';
    return 'ON_TRACK';
  }, [currentCTL, nextRace]);

  const fmt = (v: number | null, d = 1) => v != null ? v.toFixed(d) : '—';

  // ── Loading / error states ──────────────────────────────────────────────────

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
                PROGRESS — INTERNAL
              </Title>
              <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                CTL (τ=42 fixed) vs TFI (adaptive τ) · Season start Jan 1 · Gate: {AUDIT_EMAIL}
              </Text>
            </Stack>
            <ActionIcon variant="subtle" onClick={fetchData} title="Refresh">
              <ArrowsClockwise size={16} />
            </ActionIcon>
          </Group>

          {/* Status readout */}
          <Group gap={32} wrap="wrap">
            {/* CTL */}
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

            {/* TFI */}
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

            {/* Custom legend */}
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

                {/* Target zone band — behind lines, conditional */}
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

                {/* TODAY marker */}
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

                {/* TFI — gold dashed, no dots, gaps where null */}
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

          {/* Next race info */}
          {nextRace && (
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
              Next race: {nextRace.name} · {nextRace.race_date} · priority {nextRace.priority}
              {!showTargetBand && ' · no target range set — add target_tfi_min/max to race_goals to enable status badge and target band'}
            </Text>
          )}
          {!nextRace && (
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
              No upcoming race goals found — add a race_goals row with status=upcoming to enable status badge and target band
            </Text>
          )}

        </Stack>
      </Container>
    </AppShell>
  );
}
