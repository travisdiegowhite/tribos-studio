/**
 * Fitness progression chart — one "Fitness" line, server-preferred
 * (training_load_daily.tfi with a client-computed classic fill for days the
 * server hasn't written — the same reader policy every surface adopted in the
 * TFI-duality fix, docs/tfi-duality-decision.md). A plain-language headline
 * and, when a race is set, a calendar-terms decision sentence lead the chart
 * (thesis P2/P5); the chart is their citation.
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
import { fetchPlannedSessions } from '../../lib/calendar/readPlannedSessions';
import { getTodayString, formatLocalDate, parseLocalDate } from '../../utils/dateUtils.js';
import { workoutTypeCopy } from '../../utils/todayVocabulary';

const FITNESS_COLOR   = '#2A8C82';
const RACE_COLOR      = '#C49A0A';
const CTL_TAU         = 42;

/** Short flag label for a race reference line ("Boulder Roubaix" → "BR"). */
function raceShortLabel(name) {
  const initials = String(name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return initials.slice(0, 3) || 'RACE';
}

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
    if (rows[i].fitness == null) continue;
    for (let j = i + minDays; j < rows.length; j++) {
      if (rows[j].fitness == null) continue;
      const gain = rows[j].fitness - rows[i].fitness;
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
  const fitnessEntry = payload.find(p => p.dataKey === 'fitness');
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
      {fitnessEntry?.value != null && (
        <Text size="xs" style={{ color: FITNESS_COLOR }}>Fitness: {Number(fitnessEntry.value).toFixed(1)}</Text>
      )}
      {activity && (
        <Text size="xs" c="dimmed" mt={2}>{activity.name}</Text>
      )}
      {planned?.workout_type && (
        <Text size="xs" mt={2} style={{ color: getWorkoutColor(planned.workout_type) }}>
          Planned: {workoutTypeCopy(planned.workout_type).label}
          {(planned.actual_tss ?? planned.target_tss) ? ` · ${planned.actual_tss ?? planned.target_tss} RSS target` : ''}
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
  const [races, setRaces] = useState([]);
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
      setRaces(goals);
      setNextRace(goals.find(g => g.priority === 'A') ?? goals[0] ?? null);

      // Step 2: the calendar over the window. Athlete-scoped, and no longer
      // conditional on an active plan existing — the chart used to go blank for
      // anyone without one, and to miss every coach- or calendar-created entry
      // for everyone else, since those carry no plan_id.
      setPlannedWorkouts(
        await fetchPlannedSessions(user.id, { from: windowStart, to: TODAY }),
      );
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
        // Server-preferred with classic-formula fill (duality decision).
        fitness: tld?.tfi ?? Math.round(ctl * 10) / 10,
        activity: dayData?.activity ?? null,
        rss: dayData?.rss ?? 0,
        plannedWorkout: plannedByDate[dateStr] ?? null,
      });
    }

    const extendTo = nextRace?.race_date ? addDays(nextRace.race_date, 1) : addDays(TODAY, 14);
    const lastDate = merged[merged.length - 1]?.date ?? TODAY;
    const placeholders = [];
    let cursor = parseLocalDate(addDays(lastDate, 1));
    const end = parseLocalDate(extendTo);
    if (cursor && end) {
      while (cursor <= end) {
        placeholders.push({ date: formatLocalDate(cursor) ?? '', fitness: null, activity: null, rss: 0, plannedWorkout: null });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return { chartRows: [...merged, ...placeholders], withActivity: merged };
  }, [activities, ftp, tldRows, nextRace, plannedByDate, windowStart, TODAY]);

  const seasonStart = `${TODAY.slice(0, 4)}-01-01`;

  const displayRows = useMemo(() => {
    const start = window_ === 'jan1' ? seasonStart : window_ === '90' ? daysBefore(TODAY, 90) : daysBefore(TODAY, 30);
    return chartRows.filter(r => r.date >= start);
  }, [chartRows, window_, TODAY, seasonStart]);

  const bestBlock = useMemo(() => findBestBuildBlock(withActivity), [withActivity]);

  const tickInterval = displayRows.length <= 45 ? 6 : displayRows.length <= 100 ? 10 : 14;

  const lastReal = withActivity[withActivity.length - 1] ?? null;
  const currentFitness = lastReal?.fitness ?? null;

  const status = useMemo(() => {
    if (currentFitness == null || nextRace?.target_tfi_min == null || nextRace?.target_tfi_max == null) return null;
    if (currentFitness < nextRace.target_tfi_min) return 'OFF_TARGET';
    if (currentFitness > nextRace.target_tfi_max) return 'RUNNING_HOT';
    return 'ON_TRACK';
  }, [currentFitness, nextRace]);

  const fmt = (v, d = 1) => v != null ? Number(v).toFixed(d) : '—';
  const showTargetBand = nextRace?.target_tfi_min != null && nextRace?.target_tfi_max != null;
  const hasPlan = plannedWorkouts.length > 0;

  // Plain-language headline (thesis P2) — the chart below is its citation.
  const headline = useMemo(() => {
    if (currentFitness == null || withActivity.length < 2) return null;
    const back = withActivity[Math.max(0, withActivity.length - 43)];
    const delta = back?.fitness != null ? Math.round(currentFitness - back.fitness) : null;
    if (delta == null) return null;
    if (delta >= 5) return `Your fitness base is up ${delta} points over the last six weeks — steady building.`;
    if (delta <= -5) return `Your fitness has eased ${Math.abs(delta)} points over the last six weeks — lighter riding lately.`;
    return 'Your fitness has held steady over the last six weeks.';
  }, [currentFitness, withActivity]);

  // Calendar-terms decision (thesis P5) — replaces "read the band off the curve".
  const decisionLine = useMemo(() => {
    if (!status || !nextRace) return null;
    if (status === 'ON_TRACK') return `Hold this rhythm and you arrive at ${nextRace.name} inside your target range.`;
    if (status === 'OFF_TARGET')
      return `You're under target for ${nextRace.name} — ${hasPlan ? 'the plan closes the gap if the next weeks hold' : 'consistent weeks from here close the gap'}.`;
    return `You're above target for ${nextRace.name} — easing off as race day nears keeps you sharp.`;
  }, [status, nextRace, hasPlan]);

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

      {/* The sentences lead; the number and chart are their citations. */}
      {headline && (
        <Text size="md" fw={600} mb={4} style={{ lineHeight: 1.35 }}>
          {headline}
        </Text>
      )}
      {decisionLine && (
        <Text size="sm" fw={500} c="dimmed" mb={10} style={{ lineHeight: 1.4 }}>
          {decisionLine}
        </Text>
      )}

      {/* Status readout */}
      <Group gap={28} wrap="wrap" mb={14}>
        <Box>
          <Group gap={8} align="center">
            <Text style={{ fontFamily: 'monospace', fontSize: isMobile ? 18 : 22, fontWeight: 700, color: FITNESS_COLOR, lineHeight: 1 }}>
              {fmt(currentFitness)}
            </Text>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>FITNESS · TFI</Text>
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
          <Box style={{ width: 18, height: 2, backgroundColor: FITNESS_COLOR }} />
          <Text size="xs" style={{ fontFamily: 'monospace', color: FITNESS_COLOR }}>Fitness</Text>
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
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>dot size = ride stress · dashed ring = off-plan</Text>
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
          {bestBlock && bestBlock.start >= (window_ === 'jan1' ? seasonStart : window_ === '90' ? daysBefore(TODAY, 90) : daysBefore(TODAY, 30)) && (
            <ReferenceArea
              x1={bestBlock.start} x2={bestBlock.end}
              fill={FITNESS_COLOR} fillOpacity={0.07}
              stroke={FITNESS_COLOR} strokeOpacity={0.20}
              label={{ value: `+${bestBlock.gain} fitness`, position: 'insideTopLeft', fontSize: 9, fill: FITNESS_COLOR, fontFamily: 'monospace' }}
            />
          )}

          {showTargetBand && nextRace && (
            <ReferenceArea
              x1={TODAY} x2={nextRace.race_date}
              y1={nextRace.target_tfi_min} y2={nextRace.target_tfi_max}
              fill={FITNESS_COLOR} fillOpacity={0.10}
              stroke={FITNESS_COLOR} strokeOpacity={0.25}
              label={{ value: 'RACE TARGET', position: 'insideRight', fontSize: 9, fill: FITNESS_COLOR, fontFamily: 'monospace' }}
            />
          )}

          {races.map((race) => (
            <ReferenceLine
              key={race.id}
              x={race.race_date}
              stroke={RACE_COLOR}
              strokeWidth={1.5}
              label={{ value: raceShortLabel(race.name), fontSize: 9, fill: RACE_COLOR, position: 'top' }}
            />
          ))}
          <ReferenceLine x={TODAY} stroke="var(--mantine-color-dark-3)" strokeDasharray="4 2" label={{ value: 'TODAY', fontSize: 8, fill: 'var(--mantine-color-dark-3)', position: 'top' }} />

          <Line
            type="monotone" dataKey="fitness" name="Fitness"
            stroke={FITNESS_COLOR} strokeWidth={2}
            dot={(props) => {
              const { payload } = props;
              if (!payload?.activity || payload.fitness == null) return <g key={props.key} />;

              const pw = payload.plannedWorkout;
              // rest day with a planned rest — skip dot
              if (pw?.workout_type?.toLowerCase() === 'rest') return <g key={props.key} />;

              const color = hasPlan ? getWorkoutColor(pw?.workout_type) : FITNESS_COLOR;
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
            activeDot={{ r: 5, fill: FITNESS_COLOR }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
