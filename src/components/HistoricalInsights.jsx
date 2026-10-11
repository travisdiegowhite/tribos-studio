/**
 * Historical Insights Component
 * Visualizations for historical fitness data comparisons
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  Stack,
  Group,
  SimpleGrid,
  Badge,
  Loader,
  Box,
  Paper,
  Alert,
  Button,
  SegmentedControl,
} from '@mantine/core';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { StatRow, TONE, display, mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';
import { ArrowsClockwise, TrendDown, TrendUp, WarningCircle } from '@phosphor-icons/react';
import { computeWeeklySnapshots, overlayServerLoadOnWeeklySnapshots } from '../utils/computeFitnessSnapshots';
import { getISOWeek, getISOWeekYear } from '../utils/isoWeek';
import { selectTimeTicks } from '../utils/timeAxisTicks';
import { parseLocalDate } from '../utils/dateUtils';

/**
 * Year-over-Year CTL Comparison Chart
 */
function YearOverYearChart({ snapshots, selectedYears }) {
  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    // Group by ISO week-year and ISO week so week N means the same calendar
    // alignment on every year's line (a late-December Monday belongs to
    // week 1 of the NEXT ISO year, not week 53/54 of its calendar year).
    const byYearAndWeek = {};

    snapshots.forEach(s => {
      const year = getISOWeekYear(s.snapshot_week);
      const weekOfYear = getISOWeek(s.snapshot_week);

      if (!byYearAndWeek[weekOfYear]) {
        byYearAndWeek[weekOfYear] = { week: weekOfYear };
      }
      byYearAndWeek[weekOfYear][`ctl_${year}`] = s.ctl;
      byYearAndWeek[weekOfYear][`hours_${year}`] = s.weekly_hours;
    });

    return Object.values(byYearAndWeek).sort((a, b) => a.week - b.week);
  }, [snapshots]);

  const years = useMemo(() => {
    const uniqueYears = new Set();
    snapshots?.forEach(s => {
      uniqueYears.add(getISOWeekYear(s.snapshot_week));
    });
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [snapshots]);

  const CHART = useChartColors();
  // Newest year in ink, the year before in signal, older years in cyan / grey.
  const colors = [CHART.fitness, CHART.fatigue, CHART.bar, CHART.future];

  if (chartData.length === 0) {
    return (
      <Box>
        <Text c="dimmed" ta="center">No data available for comparison</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Text style={{ ...display, fontSize: 15 }}>Year-over-Year Fitness</Text>
        <Text style={{ ...mono, fontSize: 11, color: 'var(--color-text-muted)' }}>WEEK OF YEAR</Text>
      </Group>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="week"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Week of Year', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Fitness (TFI)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [Math.round(value), name.replace('ctl_', '')]}
          />
          <Legend />
          {(selectedYears || years.slice(0, 3)).map((year, i) => (
            <Line
              key={year}
              type="monotone"
              dataKey={`ctl_${year}`}
              name={year.toString()}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

/**
 * Seasonal Pattern Chart - Average CTL by month
 */
function SeasonalPatternChart({ snapshots }) {
  const CHART = useChartColors();
  const monthlyData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotals = Array(12).fill(null).map(() => ({ ctl: [], hours: [], tss: [] }));

    snapshots.forEach(s => {
      const month = new Date(s.snapshot_week).getMonth();
      monthlyTotals[month].ctl.push(s.ctl);
      monthlyTotals[month].hours.push(s.weekly_hours);
      monthlyTotals[month].tss.push(s.weekly_tss);
    });

    return monthlyTotals.map((data, i) => ({
      month: monthNames[i],
      avgCtl: data.ctl.length > 0 ? Math.round(avg(data.ctl)) : 0,
      avgHours: data.hours.length > 0 ? Math.round(avg(data.hours) * 10) / 10 : 0,
      avgTss: data.tss.length > 0 ? Math.round(avg(data.tss)) : 0,
      samples: data.ctl.length,
    }));
  }, [snapshots]);

  const peakMonth = monthlyData.reduce((max, m) => m.avgCtl > max.avgCtl ? m : max, { avgCtl: 0 });
  const lowMonth = monthlyData.reduce((min, m) => (m.avgCtl > 0 && m.avgCtl < min.avgCtl) ? m : min, { avgCtl: Infinity });

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Text style={{ ...display, fontSize: 15 }}>Seasonal Training Pattern</Text>
        <Group gap="xs">
          <Text style={{ ...mono, fontSize: 11 }}>PEAK {peakMonth.month.toUpperCase()}</Text>
          <Text style={{ ...mono, fontSize: 11, color: 'var(--color-text-muted)' }}>LOW {lowMonth.month.toUpperCase()}</Text>
        </Group>
      </Group>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="month"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              if (name === 'avgCtl') return [value, 'Avg fitness'];
              if (name === 'avgHours') return [value, 'Avg Hours/Week'];
              return [value, name];
            }}
          />
          <Bar dataKey="avgCtl" fill={CHART.bar} name="avgCtl" />
        </BarChart>
      </ResponsiveContainer>

      <Text size="xs" c="dimmed" ta="center" mt="xs">
        Based on {snapshots?.length || 0} weeks of data
      </Text>
    </Box>
  );
}

/**
 * Long-term Fitness Progression Chart
 */
const PROGRESSION_RANGES = { All: null, '5y': 5, '2y': 2, '1y': 1 };

function FitnessProgressionChart({ snapshots }) {
  const CHART = useChartColors();
  const [range, setRange] = useState('All');

  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    return snapshots
      .slice()
      .sort((a, b) => a.snapshot_week.localeCompare(b.snapshot_week))
      .map(s => ({ date: s.snapshot_week, ctl: s.ctl }));
  }, [snapshots]);

  // Filter to the selected range by string math on the YYYY-MM-DD key
  // (never `new Date(key)` — UTC parsing shifts dates in negative offsets).
  const visibleData = useMemo(() => {
    const years = PROGRESSION_RANGES[range];
    if (!years || chartData.length === 0) return chartData;
    const lastKey = chartData[chartData.length - 1].date;
    const cutoff = `${Number(lastKey.slice(0, 4)) - years}${lastKey.slice(4)}`;
    return chartData.filter(d => d.date >= cutoff);
  }, [chartData, range]);

  const { ticks, format } = useMemo(
    () => selectTimeTicks(visibleData.map(d => d.date)),
    [visibleData],
  );

  // Headline: current CTL vs the snapshot closest to a year ago. Hidden when
  // there isn't a year of history or the year-ago value is still in the
  // cold-start ramp (a tiny divisor makes any percentage meaningless — the
  // old "vs first week ever" version of this badge read +2200%).
  const yearOverYear = useMemo(() => {
    if (chartData.length === 0) return null;
    const lastPoint = chartData[chartData.length - 1];
    const yearAgoKey = `${Number(lastPoint.date.slice(0, 4)) - 1}${lastPoint.date.slice(4)}`;
    let prior = null;
    for (const d of chartData) {
      if (d.date > yearAgoKey) break;
      prior = d;
    }
    if (!prior || !(prior.ctl >= 5)) return null;
    return Math.round(((lastPoint.ctl - prior.ctl) / prior.ctl) * 100);
  }, [chartData]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Text style={{ ...display, fontSize: 15 }}>Long-term Fitness Progression</Text>
        <Group gap="sm">
          {yearOverYear != null && (
            <Badge
              color={yearOverYear >= 0 ? 'ink' : 'signal'}
              radius={0}
              variant="light"
              leftSection={yearOverYear >= 0 ? <TrendUp size={14} /> : <TrendDown size={14} />}
            >
              {yearOverYear >= 0 ? '+' : ''}{yearOverYear}% vs last year
            </Badge>
          )}
          <SegmentedControl
            size="xs"
            value={range}
            onChange={setRange}
            data={Object.keys(PROGRESSION_RANGES)}
          />
        </Group>
      </Group>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={visibleData}>
          <defs>
                      </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="date"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
            ticks={ticks}
            interval={0}
            tickFormatter={format}
          />
          <YAxis
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(date) => `Week of ${parseLocalDate(date).toLocaleDateString()}`}
            formatter={(value, name) => [Math.round(value), name.toUpperCase()]}
          />
          <Area
            type="monotone"
            dataKey="ctl"
            stroke={CHART.fitness}
            fill={CHART.fitness}
            fillOpacity={0.08}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

/**
 * Peak Fitness Timeline
 */
function PeakFitnessCard({ snapshots }) {
  const peaks = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    return snapshots
      .slice()
      .sort((a, b) => b.ctl - a.ctl)
      .slice(0, 5)
      .map(s => ({
        week: s.snapshot_week,
        ctl: s.ctl,
        hours: s.weekly_hours,
        tss: s.weekly_tss,
        rides: s.weekly_ride_count,
      }));
  }, [snapshots]);

  const currentCtl = snapshots?.[0]?.ctl || 0;
  const peakCtl = peaks[0]?.ctl || 0;
  const percentOfPeak = peakCtl > 0 ? Math.round((currentCtl / peakCtl) * 100) : 0;

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Text style={{ ...display, fontSize: 15 }}>Peak Fitness Periods</Text>
        </Group>
        <Badge color="ink" variant="outline" radius={0}>
          Current: {percentOfPeak}% of peak
        </Badge>
      </Group>

      <Stack gap="xs">
        {peaks.map((peak, i) => {
          const date = new Date(peak.week);
          const isRecent = (new Date() - date) < 90 * 24 * 60 * 60 * 1000;

          return (
            <Paper key={peak.week} p="sm" style={{
              border: `1px solid ${i === 0 ? 'var(--color-ink)' : 'var(--color-border)'}`,
              backgroundColor: 'transparent'
            }}>
              <Group justify="space-between">
                <Group gap="sm">
                  <Text fw={700} size="lg" style={{ ...mono, color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    #{i + 1}
                  </Text>
                  <Box>
                    <Text fw={500}>
                      {date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {peak.hours?.toFixed(1)}h • {peak.rides} rides
                    </Text>
                  </Box>
                </Group>
                <Group gap="xs">
                  <Badge size="lg" color={i === 0 ? 'ink' : 'gray'} variant={i === 0 ? 'filled' : 'outline'} radius={0}>
                    Fitness {peak.ctl}
                  </Badge>
                  {isRecent && <Badge color="easy" variant="outline" radius={0} size="xs">Recent</Badge>}
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Training Volume Comparison
 */
function VolumeComparisonChart({ snapshots }) {
  const CHART = useChartColors();
  const yearlyStats = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    const byYear = {};

    snapshots.forEach(s => {
      const year = new Date(s.snapshot_week).getFullYear();
      if (!byYear[year]) {
        byYear[year] = {
          year,
          totalHours: 0,
          totalTss: 0,
          totalRides: 0,
          weeks: 0,
          peakCtl: 0
        };
      }
      byYear[year].totalHours += s.weekly_hours || 0;
      byYear[year].totalTss += s.weekly_tss || 0;
      byYear[year].totalRides += s.weekly_ride_count || 0;
      byYear[year].weeks++;
      byYear[year].peakCtl = Math.max(byYear[year].peakCtl, s.ctl || 0);
    });

    return Object.values(byYear)
      .map(y => ({
        ...y,
        avgHoursPerWeek: y.weeks > 0 ? Math.round((y.totalHours / y.weeks) * 10) / 10 : 0,
      }))
      .sort((a, b) => a.year - b.year);
  }, [snapshots]);

  return (
    <Box>
      <Text style={{ ...display, fontSize: 15 }} mb="md">Annual Training Volume</Text>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={yearlyStats}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="year"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            yAxisId="hours"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="ctl"
            orientation="right"
            stroke={'var(--color-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Peak fitness', angle: 90, position: 'insideRight' }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
          />
          <Legend />
          <Bar
            yAxisId="hours"
            dataKey="totalHours"
            fill={CHART.fitness}
            name="Total Hours"
          />
          <Bar
            yAxisId="ctl"
            dataKey="peakCtl"
            fill={CHART.bar}
            name="Peak fitness"
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/**
 * Quick Stats Summary
 */
function QuickStats({ snapshots, activities }) {
  const stats = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;

    const current = snapshots[0];
    const peakCtl = Math.max(...snapshots.map(s => s.ctl));
    const avgCtl = Math.round(avg(snapshots.map(s => s.ctl)));
    const totalYears = new Set(snapshots.map(s => new Date(s.snapshot_week).getFullYear())).size;

    // Find same week last year
    const currentDate = new Date(current.snapshot_week);
    const lastYearDate = new Date(currentDate);
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
    const lastYearWeek = snapshots.find(s => {
      const d = new Date(s.snapshot_week);
      return Math.abs(d - lastYearDate) < 14 * 24 * 60 * 60 * 1000;
    });

    return {
      currentCtl: current.ctl,
      peakCtl,
      avgCtl,
      totalYears,
      percentOfPeak: peakCtl > 0 ? Math.round((current.ctl / peakCtl) * 100) : 0,
      vsLastYear: lastYearWeek ? current.ctl - lastYearWeek.ctl : null,
      weeksOfData: snapshots.length,
      totalActivities: activities?.length || 0,
    };
  }, [snapshots, activities]);

  if (!stats) return null;

  return (
    <StatRow
      stats={[
        { label: 'Current fitness (TFI)', value: String(stats.currentCtl), note: `${stats.percentOfPeak}% of peak` },
        { label: 'All-time peak', value: String(stats.peakCtl), note: 'highest recorded' },
        {
          label: 'vs last year',
          value: stats.vsLastYear !== null ? `${stats.vsLastYear >= 0 ? '+' : ''}${stats.vsLastYear}` : 'N/A',
          color: stats.vsLastYear !== null && stats.vsLastYear < 0 ? TONE.warn : TONE.neutral,
          note: 'same time last year',
        },
        { label: 'Data span', value: `${stats.totalYears} years`, note: `${stats.weeksOfData} weeks tracked` },
      ]}
    />
  );
}

/**
 * Main Historical Insights Component
 */
function HistoricalInsights({ userId, activities, ftp }) {
  const [serverSnapshots, setServerSnapshots] = useState([]);
  const [serverLoadDaily, setServerLoadDaily] = useState([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYears, setSelectedYears] = useState([]);

  // Client-side computation from activity data (synchronous, ~1ms for 2+ years),
  // with the server's daily-load engine overriding ctl/atl/tsb per week where
  // rows exist (training_load_daily > client engine > fitness_snapshots).
  // Weeks pre-dating the server engine keep the client values.
  const clientSnapshots = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    return overlayServerLoadOnWeeklySnapshots(
      computeWeeklySnapshots(activities, ftp),
      serverLoadDaily,
    );
  }, [activities, ftp, serverLoadDaily]);

  // Merge: client data takes priority, server fills gaps (advanced fields)
  const snapshots = useMemo(() => {
    if (clientSnapshots.length === 0 && serverSnapshots.length === 0) return [];
    if (clientSnapshots.length === 0) return serverSnapshots;
    if (serverSnapshots.length === 0) return clientSnapshots;

    const byWeek = new Map();
    // Server first (lower priority for core metrics)
    serverSnapshots.forEach(s => byWeek.set(s.snapshot_week, s));
    // Client overwrites core metrics (higher priority, guaranteed complete)
    clientSnapshots.forEach(s => {
      const existing = byWeek.get(s.snapshot_week);
      if (existing) {
        // Merge: keep server's advanced fields, overwrite core metrics
        byWeek.set(s.snapshot_week, { ...existing, ...s });
      } else {
        byWeek.set(s.snapshot_week, s);
      }
    });

    return Array.from(byWeek.values())
      .sort((a, b) => new Date(b.snapshot_week) - new Date(a.snapshot_week));
  }, [clientSnapshots, serverSnapshots]);

  // Set selected years when snapshots change (ISO week-years, matching the
  // YearOverYearChart series keys)
  useEffect(() => {
    if (snapshots.length > 0) {
      const years = [...new Set(snapshots.map(s => getISOWeekYear(s.snapshot_week)))];
      setSelectedYears(prev => prev.length > 0 ? prev : years.sort((a, b) => b - a).slice(0, 3));
    }
  }, [snapshots]);

  // Fetch server snapshots (supplementary — charts work without these)
  async function loadServerSnapshots() {
    if (!userId) return;

    try {
      setServerLoading(true);

      const { data, error: fetchError } = await supabase
        .from('fitness_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('snapshot_week', { ascending: false });

      if (fetchError) throw fetchError;
      // Canonical-first column reads per the freeze policy (rows dual-write
      // tfi/afi/form_score alongside ctl/atl/tsb with identical values; the
      // charts keep reading the legacy JS keys).
      setServerSnapshots(
        (data || []).map((s) => ({
          ...s,
          ctl: s.tfi ?? s.ctl,
          atl: s.afi ?? s.atl,
          tsb: s.form_score ?? s.tsb,
          weekly_tss: s.weekly_rss ?? s.weekly_tss,
          avg_normalized_power: s.avg_effective_power ?? s.avg_normalized_power,
        }))
      );

    } catch (err) {
      console.error('Error loading server snapshots:', err);
      // Non-fatal: client snapshots still work
    } finally {
      setServerLoading(false);
    }
  }

  // Daily server load rows for the ctl/atl/tsb overlay. Paginated past the
  // implicit 1000-row cap: after the full-history rebuild the table spans
  // the athlete's entire activity history, and shedding the oldest rows
  // would seam older chart years back to client-engine values mid-year.
  // Four small columns per row — a decade is a handful of requests.
  async function loadServerLoadDaily() {
    if (!userId) return;
    try {
      const PAGE_SIZE = 1000;
      const rows = [];
      for (let page = 0; ; page++) {
        const { data, error: fetchError } = await supabase
          .from('training_load_daily')
          .select('date, tfi, afi, form_score')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      setServerLoadDaily(rows);
    } catch (err) {
      console.error('Error loading daily server load:', err);
      // Non-fatal: charts fall back to client-engine values
    }
  }

  useEffect(() => {
    loadServerSnapshots();
    loadServerLoadDaily();
  }, [userId]);

  // Rebuild server snapshots from activity data
  async function handleRebuildSnapshots() {
    if (rebuilding) return;
    setRebuilding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch('/api/fitness-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'backfill', weeksBack: 104 }),
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Backfill failed');

      console.log('Snapshot rebuild complete:', result);
      await loadServerSnapshots();
    } catch (err) {
      console.error('Snapshot rebuild failed:', err);
      setError(err.message);
    } finally {
      setRebuilding(false);
    }
  }

  // Only show loading if BOTH client and server have nothing yet
  const isLoading = serverLoading && clientSnapshots.length === 0;

  if (isLoading) {
    return (
      <Box py="md">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading historical data...</Text>
        </Stack>
      </Box>
    );
  }

  if (error && snapshots.length === 0) {
    return (
      <Alert color="signal" variant="outline" radius={0} icon={<WarningCircle />} title="Error loading data">
        {error}
      </Alert>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Box py="md">
        <Stack align="center" gap="md">
          <Text style={{ ...display, fontSize: 18 }}>No historical data yet</Text>
          <Text c="dimmed" ta="center" maw={400}>
            Sync activities from Strava, Garmin, or Wahoo to see your fitness history.
            Data will appear here as soon as activities are imported.
          </Text>
        </Stack>
      </Box>
    );
  }

  return (
    <Stack gap="md">
      {/* Rebuild button */}
      <Group justify="flex-end">
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<ArrowsClockwise size={14} />}
          loading={rebuilding}
          onClick={handleRebuildSnapshots}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          {rebuilding ? 'REBUILDING...' : 'REBUILD SNAPSHOTS'}
        </Button>
      </Group>

      {/* Quick Stats Summary */}
      <QuickStats snapshots={snapshots} activities={activities} />

      {/* Year-over-Year Comparison */}
      <YearOverYearChart snapshots={snapshots} selectedYears={selectedYears} />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Seasonal Pattern */}
        <SeasonalPatternChart snapshots={snapshots} />

        {/* Peak Fitness */}
        <PeakFitnessCard snapshots={snapshots} />
      </SimpleGrid>

      {/* Long-term Progression */}
      <FitnessProgressionChart snapshots={snapshots} />

      {/* Annual Volume */}
      <VolumeComparisonChart snapshots={snapshots} />
    </Stack>
  );
}

// Helper functions
function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (b || 0), 0) / arr.length;
}

export default React.memo(HistoricalInsights);
