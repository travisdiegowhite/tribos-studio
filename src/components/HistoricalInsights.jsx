/**
 * Historical Insights Component
 * Visualizations for historical fitness data comparisons
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Text,
  Title,
  Stack,
  Group,
  SimpleGrid,
  Select,
  Badge,
  Loader,
  Box,
  Paper,
  ThemeIcon,
  Alert,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconCalendarStats,
  IconChartLine,
  IconFlame,
  IconTrophy,
  IconAlertCircle,
} from '@tabler/icons-react';
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
  ReferenceLine,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

/**
 * Year-over-Year CTL Comparison Chart
 */
function YearOverYearChart({ snapshots, selectedYears }) {
  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    // Group snapshots by year and week of year
    const byYearAndWeek = {};

    snapshots.forEach(s => {
      const date = new Date(s.snapshot_week);
      const year = date.getFullYear();
      const weekOfYear = getWeekOfYear(date);

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
      uniqueYears.add(new Date(s.snapshot_week).getFullYear());
    });
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [snapshots]);

  const colors = ['#4dabf7', '#69db7c', '#ffd43b', '#ff8787', '#da77f2'];

  if (chartData.length === 0) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed" ta="center">No data available for comparison</Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md">
      <Group justify="space-between" mb="md">
        <Title order={4}>Year-over-Year Fitness (CTL)</Title>
        <Badge color="blue" variant="light">Week of Year Comparison</Badge>
      </Group>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="week"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Week of Year', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'CTL', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tribos-bg-secondary)',
              border: `1px solid ${'var(--tribos-border)'}`,
              borderRadius: 8
            }}
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
    </Card>
  );
}

/**
 * Seasonal Pattern Chart - Average CTL by month
 */
function SeasonalPatternChart({ snapshots }) {
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
    <Card withBorder p="md">
      <Group justify="space-between" mb="md">
        <Title order={4}>Seasonal Training Pattern</Title>
        <Group gap="xs">
          <Badge color="green" variant="light">Peak: {peakMonth.month}</Badge>
          <Badge color="orange" variant="light">Low: {lowMonth.month}</Badge>
        </Group>
      </Group>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="month"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tribos-bg-secondary)',
              border: `1px solid ${'var(--tribos-border)'}`,
              borderRadius: 8
            }}
            formatter={(value, name) => {
              if (name === 'avgCtl') return [value, 'Avg CTL'];
              if (name === 'avgHours') return [value, 'Avg Hours/Week'];
              return [value, name];
            }}
          />
          <Bar dataKey="avgCtl" fill="#4dabf7" name="avgCtl" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <Text size="xs" c="dimmed" ta="center" mt="xs">
        Based on {snapshots?.length || 0} weeks of data
      </Text>
    </Card>
  );
}

/**
 * Long-term Fitness Progression Chart
 */
function FitnessProgressionChart({ snapshots }) {
  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    return snapshots
      .slice()
      .sort((a, b) => new Date(a.snapshot_week) - new Date(b.snapshot_week))
      .map(s => ({
        date: s.snapshot_week,
        ctl: s.ctl,
        atl: s.atl,
        tsb: s.tsb,
        hours: s.weekly_hours,
      }));
  }, [snapshots]);

  if (chartData.length === 0) {
    return null;
  }

  // Calculate overall trend
  const firstCtl = chartData[0]?.ctl || 0;
  const lastCtl = chartData[chartData.length - 1]?.ctl || 0;
  const overallChange = lastCtl - firstCtl;
  const percentChange = firstCtl > 0 ? Math.round((overallChange / firstCtl) * 100) : 0;

  return (
    <Card withBorder p="md">
      <Group justify="space-between" mb="md">
        <Title order={4}>Long-term Fitness Progression</Title>
        <Badge
          color={overallChange >= 0 ? 'green' : 'red'}
          variant="light"
          leftSection={overallChange >= 0 ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}
        >
          {overallChange >= 0 ? '+' : ''}{percentChange}% overall
        </Badge>
      </Group>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="ctlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4dabf7" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#4dabf7" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="date"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 10 }}
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tribos-bg-secondary)',
              border: `1px solid ${'var(--tribos-border)'}`,
              borderRadius: 8
            }}
            labelFormatter={(date) => new Date(date).toLocaleDateString()}
            formatter={(value, name) => [Math.round(value), name.toUpperCase()]}
          />
          <Area
            type="monotone"
            dataKey="ctl"
            stroke="#4dabf7"
            fill="url(#ctlGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
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
    <Card withBorder p="md">
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon color="yellow" variant="light" size="lg">
            <IconTrophy size={20} />
          </ThemeIcon>
          <Title order={4}>Peak Fitness Periods</Title>
        </Group>
        <Badge color="blue" variant="light">
          Current: {percentOfPeak}% of peak
        </Badge>
      </Group>

      <Stack gap="xs">
        {peaks.map((peak, i) => {
          const date = new Date(peak.week);
          const isRecent = (new Date() - date) < 90 * 24 * 60 * 60 * 1000;

          return (
            <Paper key={peak.week} p="sm" withBorder style={{
              borderColor: i === 0 ? tokens.colors.accent : 'var(--tribos-border)',
              backgroundColor: i === 0 ? `${tokens.colors.accent}10` : 'transparent'
            }}>
              <Group justify="space-between">
                <Group gap="sm">
                  <Text fw={700} size="lg" c={i === 0 ? 'blue' : 'dimmed'}>
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
                  <Badge size="lg" color={i === 0 ? 'yellow' : 'gray'} variant="light">
                    CTL {peak.ctl}
                  </Badge>
                  {isRecent && <Badge color="green" size="xs">Recent</Badge>}
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </Card>
  );
}

/**
 * Training Volume Comparison
 */
function VolumeComparisonChart({ snapshots }) {
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
    <Card withBorder p="md">
      <Title order={4} mb="md">Annual Training Volume</Title>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={yearlyStats}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-border)'} />
          <XAxis
            dataKey="year"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            yAxisId="hours"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="ctl"
            orientation="right"
            stroke={'var(--tribos-text-muted)'}
            tick={{ fontSize: 12 }}
            label={{ value: 'Peak CTL', angle: 90, position: 'insideRight' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tribos-bg-secondary)',
              border: `1px solid ${'var(--tribos-border)'}`,
              borderRadius: 8
            }}
          />
          <Legend />
          <Bar
            yAxisId="hours"
            dataKey="totalHours"
            fill="#69db7c"
            name="Total Hours"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="ctl"
            dataKey="peakCtl"
            fill="#4dabf7"
            name="Peak CTL"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
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
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
      <Paper p="md" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">Current CTL</Text>
        <Text size="xl" fw={700}>{stats.currentCtl}</Text>
        <Text size="xs" c="dimmed">{stats.percentOfPeak}% of peak</Text>
      </Paper>

      <Paper p="md" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">All-time Peak</Text>
        <Text size="xl" fw={700} c="yellow">{stats.peakCtl}</Text>
        <Text size="xs" c="dimmed">Highest recorded</Text>
      </Paper>

      <Paper p="md" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">vs Last Year</Text>
        <Text size="xl" fw={700} c={stats.vsLastYear >= 0 ? 'green' : 'red'}>
          {stats.vsLastYear !== null ? `${stats.vsLastYear >= 0 ? '+' : ''}${stats.vsLastYear}` : 'N/A'}
        </Text>
        <Text size="xs" c="dimmed">Same time last year</Text>
      </Paper>

      <Paper p="md" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">Data Span</Text>
        <Text size="xl" fw={700}>{stats.totalYears} years</Text>
        <Text size="xs" c="dimmed">{stats.weeksOfData} weeks tracked</Text>
      </Paper>
    </SimpleGrid>
  );
}

/**
 * Main Historical Insights Component
 */
export default function HistoricalInsights({ userId, activities }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYears, setSelectedYears] = useState([]);

  // Fetch fitness snapshots
  useEffect(() => {
    async function loadSnapshots() {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('fitness_snapshots')
          .select('*')
          .eq('user_id', userId)
          .order('snapshot_week', { ascending: false });

        if (fetchError) throw fetchError;

        setSnapshots(data || []);

        // Set default selected years (last 3 years with data)
        const years = [...new Set(data?.map(s => new Date(s.snapshot_week).getFullYear()) || [])];
        setSelectedYears(years.sort((a, b) => b - a).slice(0, 3));

      } catch (err) {
        console.error('Error loading fitness snapshots:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadSnapshots();
  }, [userId]);

  if (loading) {
    return (
      <Card withBorder p="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading historical data...</Text>
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle />} title="Error loading data">
        {error}
      </Alert>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Card withBorder p="xl">
        <Stack align="center" gap="md">
          <ThemeIcon size={60} radius="xl" color="gray" variant="light">
            <IconCalendarStats size={30} />
          </ThemeIcon>
          <Title order={3}>No Historical Data Yet</Title>
          <Text c="dimmed" ta="center" maw={400}>
            Historical fitness snapshots will be generated when you ask the AI coach about
            your training history, or they'll build up automatically over time as you train.
          </Text>
          <Text size="sm" c="dimmed">
            Try asking the AI coach: "How does my fitness compare to last year?"
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
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
function getWeekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneWeek = 604800000;
  return Math.ceil((diff / oneWeek) + 1);
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (b || 0), 0) / arr.length;
}
