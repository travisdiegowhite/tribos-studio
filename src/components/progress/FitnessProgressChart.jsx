/**
 * Fitness progression chart — CTL (τ=42) and TFI (adaptive τ) as peer lines.
 * Self-contained: fetches its own data from Supabase.
 * Embedded at the top of the Progress page.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Text, Group, Badge, Stack, SegmentedControl, Box, ActionIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { getTodayString, formatLocalDate, parseLocalDate } from '../../utils/dateUtils.js';

const CTL_COLOR       = '#2A8C82';
const TFI_COLOR       = '#C49A0A';
const SEASON_START    = '2026-01-01';
const BOULDER_ROUBAIX = '2026-04-26';
const BWR             = '2026-05-03';
const CTL_TAU         = 42;

const WORKOUT_COLORS = {
  recovery:  '#868e96',
  endurance: '#74C0B8',
  tempo:     '#C49A0A',
  threshold: '#E8821A',
  vo2max:    '#C43C2A',
  anaerobic: '#9C1C1C',
  race:      '#7B2D8B',
  rest:      null,
};
const UNPLANNED_COLOR = '#4dabf7';

function getWorkoutColor(workoutType) {
  if (!workoutType) return UNPLANNED_COLOR;
  return WORKOUT_COLORS[workoutType.toLowerCase()] ?? UNPLANNED_COLOR;
}

function getDotRadius(rss) {
  if (!rss || rss < 30) return 2.5;
  if (rss < 60) return 3.5;
  if (rss < 100) return 5;
  return 7;
}

function isSignificantDeviation(planned, actualRSS) {
  const target = planned?.actual_tss ?? planned?.target_tss;
  if (!target || target === 0 || actualRSS == null) return false;
  return Math.abs(actualRSS - target) / target > 0.40;
}

function findBestBuildBlock(rows, minDays = 7) {
  let bestGain = 0;
  let bestBlock = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].ctl == null) continue;
    for (let j = i + minDays; j < rows.length; j++) {
      if (rows[j].ctl == null) continue;
      const gain = rows[j].ctl - rows[i].ctl;
      if (gain > bestGain) {
        bestGain = gain;
        bestBlock = {
          start: rows[i].date,
          end: rows[j].date,
          gain: Math.round(gain * 10) / 10,
          days: j - i,
        };
      }
    }
  }
  return bestBlock;
}

function daysBefore(dateStr, n) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() - n);
  return formatLocalDate(d) ?? dateStr;
}

function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + n);
  return formatLocalDate(d) ?? dateStr;
}

function estimateRSS(a, ftp) {
  const stored = a.rss ?? a.tss;
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
    const effectiveFtp = ftp && ftp > 0 ? ftp : 200;
    const ri = avgPower / effectiveFtp;
    return Math.min(Math.round(durationHours * ri * ri * 100), 500);
  }
  const elevM = a.total_elevation_gain || 0;
  return Math.min(Math.round(durationHours * 50 + (elevM / 300) * 10), 500);
}

const STATUS_CONFIG = {
  ON_TRACK:    { color: 'teal',   label: 'ON TRACK' },
  OFF_TARGET:  { color: 'red',    label: 'OFF TARGET' },
  RUNNING_HOT: { color: 'yellow', label: 'RUNNING HOT' },
};

const ProgressTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const ctlEntry = payload.find(p => p.dataKey === 'ctl');
  const tfiEntry = payload.find(p => p.dataKey === 'tfi');
  const row = payload[0]?.payload ?? {};
  const activity = row.activity ?? null;
  const planned = row.plannedWorkout ?? null;
  const deviated = row.activity ? isSignificantDeviation(planned, row.rss) : false;

  return (
    <Box
      style={{
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-4)',
        padding: '8px 12px',
        fontFamily: 'monospace',
        minWidth: 140,
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
      {planned?.workout_type && (
        <Text size="xs" mt={2} style={{ color: getWorkoutColor(planned.workout_type) }}>
          Planned: {planned.workout_type}
          {(planned.actual_tss ?? planned.target_tss) ? ` · ${planned.actual_tss ?? planned.target_tss} TSS target` : ''}
        </Text>
      )}
      {deviated && (
        <Text size="xs" mt={1} style={{ color: '#E8821A' }}>⚠ deviated &gt;40%</Text>
      )}
    </Box>
  );
};

export default function FitnessProgressChart() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const TODAY = getTodayString();
  const windowStart = daysBefore(TODAY, 180);

  const [activities, setActivities] = useState([]);
  const [tldRows, setTldRows] = useState([]);
  const [nextRace, setNextRace] = useState(null);
  const [ftp, setFtp] = useState(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [window_, setWindow] = useState('jan1');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [actResult, profileResult, tldResult, goalsResult, plansResult] = await Promise.all([
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

        supabase
          .from('training_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      setActivities(actResult.data ?? []);
      setFtp(profileResult.data?.ftp ?? null);
      setTldRows(tldResult.data ?? []);

      const goals = goalsResult.data ?? [];
      setNextRace(goals.find(g => g.priority === 'A') ?? goals[0] ?? null);

      // Step 2: fetch planned workouts if there are active plans
      const planIds = (plansResult.data ?? []).map(p => p.id);
      if (planIds.length > 0) {
        const { data: pwData } = await supabase
          .from('planned_workouts')
          .select('scheduled_date, workout_type, target_tss, actual_tss, completed, activity_id')
          .in('plan_id', planIds)
          .gte('scheduled_date', windowStart)
          .lte('scheduled_date', TODAY);
        setPlannedWorkouts(pwData ?? []);
      } else {
        setPlannedWorkouts([]);
      }
    } catch (err) {
      console.error('[FitnessProgressChart] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, windowStart, TODAY]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const plannedByDate = useMemo(() => {
    const map = {};
    for (const pw of plannedWorkouts) {
      if (pw.scheduled_date && !map[pw.scheduled_date]) {
        map[pw.scheduled_date] = pw;
      }
    }
    return map;
  }, [plannedWorkouts]);

  const { chartRows, withActivity } = useMemo(() => {
    const actByDate = {};
    for (const a of activities) {
      const d = a.start_date?.slice(0, 10);
      if (!d) continue;
      if (!actByDate[d]) actByDate[d] = { rss: 0, activity: a };
      actByDate[d].rss += estimateRSS(a, ftp);
    }

    const tfiByDate = {};
    for (const row of tldRows) tfiByDate[row.date] = row;

    let ctl = 0;
    const merged = [];
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
        rss: dayData?.rss ?? 0,
        plannedWorkout: plannedByDate[dateStr] ?? null,
        tfi_tau: tld?.tfi_tau ?? null,
      });
    }

    const extendTo = nextRace?.race_date ? addDays(nextRace.race_date, 1) : addDays(BWR, 1);
    const lastDate = merged[merged.length - 1]?.date ?? TODAY;
    const placeholders = [];
    let cursor = parseLocalDate(addDays(lastDate, 1));
    const end = parseLocalDate(extendTo);
    if (cursor && end) {
      while (cursor <= end) {
        placeholders.push({ date: formatLocalDate(cursor) ?? '', ctl: null, tfi: null, activity: null, rss: 0, plannedWorkout: null, tfi_tau: null });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return { chartRows: [...merged, ...placeholders], withActivity: merged };
  }, [activities, ftp, tldRows, nextRace, plannedByDate, windowStart, TODAY]);

  const displayRows = useMemo(() => {
    const start = window_ === 'jan1' ? SEASON_START : window_ === '90' ? daysBefore(TODAY, 90) : daysBefore(TODAY, 30);
    return chartRows.filter(r => r.date >= start);
  }, [chartRows, window_, TODAY]);

  const bestBlock = useMemo(() => findBestBuildBlock(withActivity), [withActivity]);

  const tickInterval = displayRows.length <= 45 ? 6 : displayRows.length <= 100 ? 10 : 14;

  const lastReal = withActivity[withActivity.length - 1] ?? null;
  const currentCTL = lastReal?.ctl ?? null;
  const currentTFI = lastReal?.tfi ?? null;

  const status = useMemo(() => {
    if (currentCTL == null || nextRace?.target_tfi_min == null || nextRace?.target_tfi_max == null) return null;
    if (currentCTL < nextRace.target_tfi_min) return 'OFF_TARGET';
    if (currentCTL > nextRace.target_tfi_max) return 'RUNNING_HOT';
    return 'ON_TRACK';
  }, [currentCTL, nextRace]);

  const fmt = (v, d = 1) => v != null ? Number(v).toFixed(d) : '—';
  const showTargetBand = nextRace?.target_tfi_min != null && nextRace?.target_tfi_max != null;
  const hasPlan = plannedWorkouts.length > 0;

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 20,
        opacity: loading ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Header row */}
      <Group justify="space-between" mb={14}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
          }}
        >
          FITNESS PROGRESSION
        </Text>
        <ActionIcon variant="subtle" size="sm" onClick={fetchData} title="Refresh">
          <ArrowsClockwise size={14} />
        </ActionIcon>
      </Group>

      {/* Status readout */}
      <Group gap={28} wrap="wrap" mb={14}>
        <Box>
          <Group gap={8} align="center">
            <Text style={{ fontFamily: 'monospace', fontSize: isMobile ? 22 : 28, fontWeight: 700, color: CTL_COLOR, lineHeight: 1 }}>
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
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} mt={2}>
              target {nextRace.target_tfi_min}–{nextRace.target_tfi_max} by {nextRace.name} ({nextRace.race_date.slice(5)})
            </Text>
          )}
        </Box>
        <Box>
          <Group gap={8} align="center">
            <Text style={{ fontFamily: 'monospace', fontSize: isMobile ? 22 : 28, fontWeight: 700, color: TFI_COLOR, lineHeight: 1 }}>
              {fmt(currentTFI)}
            </Text>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>TFI</Text>
          </Group>
          {lastReal?.tfi_tau != null && (
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} mt={2}>τ={lastReal.tfi_tau}d</Text>
          )}
        </Box>
      </Group>

      {/* Window selector */}
      <Group gap={10} mb={12}>
        <SegmentedControl
          size="xs"
          value={window_}
          onChange={setWindow}
          data={[
            { label: '30d', value: '30' },
            { label: '90d', value: '90' },
            { label: 'Since Jan 1', value: 'jan1' },
          ]}
        />
      </Group>

      {/* Legend */}
      <Group gap={isMobile ? 8 : 16} mb={10} wrap="wrap">
        <Group gap={6} align="center">
          <Box style={{ width: 18, height: 2, backgroundColor: CTL_COLOR }} />
          <Text size="xs" style={{ fontFamily: 'monospace', color: CTL_COLOR }}>CTL (τ=42)</Text>
        </Group>
        <Group gap={6} align="center">
          <Box style={{ width: 18, height: 0, borderTop: `2px dashed ${TFI_COLOR}` }} />
          <Text size="xs" style={{ fontFamily: 'monospace', color: TFI_COLOR }}>TFI (adaptive τ)</Text>
        </Group>
        {hasPlan ? (
          <>
            {[
              ['recovery', '#868e96'],
              ['endurance', '#74C0B8'],
              ['tempo', '#C49A0A'],
              ['threshold', '#E8821A'],
              ['vo2max', '#C43C2A'],
            ].map(([label, color]) => (
              <Group key={label} gap={4} align="center">
                <Box style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                <Text size="xs" style={{ fontFamily: 'monospace', color }}>{label}</Text>
              </Group>
            ))}
            <Group gap={4} align="center">
              <Box style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: UNPLANNED_COLOR }} />
              <Text size="xs" style={{ fontFamily: 'monospace', color: UNPLANNED_COLOR }}>unplanned</Text>
            </Group>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>size=RSS · ⊙=deviated</Text>
          </>
        ) : null}
      </Group>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
        <LineChart data={displayRows} margin={{ top: 4, right: 36, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => String(d).slice(5)} interval={tickInterval} />
          <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
          <ChartTooltip content={<ProgressTooltip />} />

          {/* Best build block — shaded region */}
          {bestBlock && bestBlock.start >= (window_ === 'jan1' ? SEASON_START : window_ === '90' ? daysBefore(TODAY, 90) : daysBefore(TODAY, 30)) && (
            <ReferenceArea
              x1={bestBlock.start} x2={bestBlock.end}
              fill={CTL_COLOR} fillOpacity={0.07}
              stroke={CTL_COLOR} strokeOpacity={0.20}
              label={{ value: `+${bestBlock.gain} CTL`, position: 'insideTopLeft', fontSize: 9, fill: CTL_COLOR, fontFamily: 'monospace' }}
            />
          )}

          {showTargetBand && nextRace && (
            <ReferenceArea
              x1={TODAY} x2={nextRace.race_date}
              y1={nextRace.target_tfi_min} y2={nextRace.target_tfi_max}
              fill={CTL_COLOR} fillOpacity={0.10}
              stroke={CTL_COLOR} strokeOpacity={0.25}
              label={{ value: 'CTL TARGET ZONE', position: 'insideRight', fontSize: 9, fill: CTL_COLOR, fontFamily: 'monospace' }}
            />
          )}

          <ReferenceLine x={BOULDER_ROUBAIX} stroke={TFI_COLOR} strokeWidth={1.5} label={{ value: 'BR', fontSize: 9, fill: TFI_COLOR, position: 'top' }} />
          <ReferenceLine x={BWR} stroke={TFI_COLOR} strokeWidth={1.5} label={{ value: 'BWR', fontSize: 9, fill: TFI_COLOR, position: 'top' }} />
          <ReferenceLine x={TODAY} stroke="var(--mantine-color-dark-3)" strokeDasharray="4 2" label={{ value: 'TODAY', fontSize: 8, fill: 'var(--mantine-color-dark-3)', position: 'top' }} />

          <Line
            type="monotone" dataKey="ctl" name="CTL"
            stroke={CTL_COLOR} strokeWidth={2}
            dot={(props) => {
              const { payload } = props;
              if (!payload?.activity || payload.ctl == null) return <g key={props.key} />;

              const pw = payload.plannedWorkout;
              // rest day with a planned rest — skip dot
              if (pw?.workout_type?.toLowerCase() === 'rest') return <g key={props.key} />;

              const color = hasPlan ? getWorkoutColor(pw?.workout_type) : CTL_COLOR;
              const r = getDotRadius(payload.rss);
              const deviated = isSignificantDeviation(pw, payload.rss);

              return (
                <g key={props.key}>
                  {deviated && (
                    <circle
                      cx={props.cx} cy={props.cy} r={r + 3}
                      fill="none" stroke="#E8821A" strokeWidth={1.5} strokeDasharray="3 2"
                    />
                  )}
                  <circle
                    cx={props.cx} cy={props.cy} r={r}
                    fill={color} stroke="#fff" strokeWidth={1.5}
                  />
                </g>
              );
            }}
            activeDot={{ r: 5, fill: CTL_COLOR }}
            connectNulls={false}
          />
          <Line
            type="monotone" dataKey="tfi" name="TFI"
            stroke={TFI_COLOR} strokeWidth={2} strokeDasharray="4 2"
            dot={false} activeDot={{ r: 4, fill: TFI_COLOR }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
