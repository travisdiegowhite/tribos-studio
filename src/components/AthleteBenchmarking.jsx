import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Paper,
  SimpleGrid,
  Progress,
  Tooltip,
  SegmentedControl,
  Table,
  Select,
} from '@mantine/core';
import {
  IconTrophy,
  IconChartBar,
  IconUsers,
  IconFlame,
  IconMountain,
  IconBolt,
} from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * Athlete Benchmarking Component
 *
 * Compares athlete's power outputs to:
 * - Age/gender-based percentiles
 * - Rider type classifications
 * - Professional/amateur benchmarks
 *
 * Uses published cycling performance data and power profiling research.
 */

/**
 * Power benchmarks by category and duration
 * Based on published cycling power data and Hunter/Coggan classifications
 * Values are in watts for a 70kg male cyclist
 */
const POWER_BENCHMARKS = {
  // Format: { duration: { untrained, recreational, trained, competitive, elite, worldClass } }
  // Values in W/kg
  5: { // 5 second sprint
    untrained: 9.0,
    recreational: 13.0,
    trained: 16.0,
    competitive: 19.0,
    elite: 22.0,
    worldClass: 25.0,
  },
  60: { // 1 minute
    untrained: 5.0,
    recreational: 6.5,
    trained: 7.5,
    competitive: 9.0,
    elite: 10.5,
    worldClass: 12.0,
  },
  300: { // 5 minutes
    untrained: 3.0,
    recreational: 3.8,
    trained: 4.5,
    competitive: 5.3,
    elite: 6.0,
    worldClass: 6.8,
  },
  1200: { // 20 minutes
    untrained: 2.5,
    recreational: 3.2,
    trained: 4.0,
    competitive: 4.7,
    elite: 5.5,
    worldClass: 6.2,
  },
  3600: { // 60 minutes (FTP)
    untrained: 2.0,
    recreational: 2.8,
    trained: 3.5,
    competitive: 4.2,
    elite: 5.0,
    worldClass: 5.8,
  },
};

/**
 * Rider type classifications based on power profile shape
 * Ratios of different duration powers
 */
const RIDER_TYPES = {
  sprinter: {
    name: 'Sprinter',
    description: 'Explosive power specialist - dominates short efforts',
    color: 'pink',
    icon: IconBolt,
    profile: {
      // 5s/5min ratio > 3.5
      sprintRatio: { min: 3.5, max: 5.0 },
      // Relatively lower 20min/5min
      enduranceRatio: { min: 0.7, max: 0.85 },
    },
    strengths: ['Bunch sprints', 'Short climbs', 'Accelerations'],
    weaknesses: ['Long climbs', 'Time trials', 'High tempo racing'],
  },
  pursuiter: {
    name: 'Pursuiter',
    description: 'Strong in 3-8 minute efforts - good track rider',
    color: 'orange',
    icon: IconFlame,
    profile: {
      sprintRatio: { min: 2.8, max: 3.5 },
      enduranceRatio: { min: 0.8, max: 0.9 },
    },
    strengths: ['Medium climbs', 'Breakaways', 'Pursuit races'],
    weaknesses: ['Pure sprints', 'Multi-hour races'],
  },
  timeTrial: {
    name: 'Time Trialist',
    description: 'Excellent sustained power - specialist against the clock',
    color: 'blue',
    icon: IconChartBar,
    profile: {
      sprintRatio: { min: 2.2, max: 3.0 },
      enduranceRatio: { min: 0.92, max: 1.0 },
    },
    strengths: ['Time trials', 'Long breakaways', 'Flat stages'],
    weaknesses: ['Pure sprints', 'Punchy climbs'],
  },
  climber: {
    name: 'Climber',
    description: 'High power-to-weight - excels on long ascents',
    color: 'green',
    icon: IconMountain,
    profile: {
      sprintRatio: { min: 2.0, max: 2.8 },
      enduranceRatio: { min: 0.9, max: 1.0 },
      // Plus high W/kg threshold
    },
    strengths: ['Mountain stages', 'Long climbs', 'Grand tours'],
    weaknesses: ['Flat sprints', 'Crosswind stages'],
  },
  allRounder: {
    name: 'All-Rounder',
    description: 'Balanced power profile - competitive in most situations',
    color: 'grape',
    icon: IconTrophy,
    profile: {
      sprintRatio: { min: 2.5, max: 3.5 },
      enduranceRatio: { min: 0.85, max: 0.95 },
    },
    strengths: ['Versatility', 'Stage races', 'One-day classics'],
    weaknesses: ['May lack specialization'],
  },
};

/**
 * Calculate percentile ranking based on power and weight
 */
function calculatePercentile(wkg, duration, gender = 'male', age = 30) {
  const benchmarks = POWER_BENCHMARKS[duration];
  if (!benchmarks || !wkg) return null;

  // Age adjustment (peak at ~28, -2% per 5 years after 35)
  let ageAdjustment = 1.0;
  if (age > 35) {
    ageAdjustment = 1 - ((age - 35) / 5) * 0.02;
  }

  // Gender adjustment (female benchmarks typically 85-90% of male)
  const genderAdjustment = gender === 'female' ? 1.15 : 1.0;

  // Adjusted W/kg for comparison
  const adjustedWkg = wkg * genderAdjustment / ageAdjustment;

  // Calculate percentile based on benchmark levels
  const levels = ['untrained', 'recreational', 'trained', 'competitive', 'elite', 'worldClass'];
  const percentiles = [10, 30, 50, 75, 90, 99];

  for (let i = 0; i < levels.length; i++) {
    if (adjustedWkg < benchmarks[levels[i]]) {
      if (i === 0) return percentiles[0] * (adjustedWkg / benchmarks[levels[0]]);

      // Interpolate between levels
      const prevLevel = benchmarks[levels[i - 1]];
      const currLevel = benchmarks[levels[i]];
      const ratio = (adjustedWkg - prevLevel) / (currLevel - prevLevel);
      return percentiles[i - 1] + ratio * (percentiles[i] - percentiles[i - 1]);
    }
  }

  return 99; // Above world class
}

/**
 * Determine rider type from power profile
 */
function determineRiderType(powerProfile, weight) {
  if (!powerProfile || !weight) return null;

  const wkg = {
    5: powerProfile[5] ? powerProfile[5] / weight : 0,
    60: powerProfile[60] ? powerProfile[60] / weight : 0,
    300: powerProfile[300] ? powerProfile[300] / weight : 0,
    1200: powerProfile[1200] ? powerProfile[1200] / weight : 0,
    3600: powerProfile[3600] ? powerProfile[3600] / weight : 0,
  };

  // Calculate ratios
  const sprintRatio = wkg[5] && wkg[300] ? wkg[5] / wkg[300] : 0;
  const enduranceRatio = wkg[1200] && wkg[300] ? wkg[1200] / wkg[300] : 0;

  // Special case: check for climber (high W/kg FTP)
  if (wkg[3600] > 4.5 && enduranceRatio > 0.88) {
    return 'climber';
  }

  // Match against rider type profiles
  for (const [type, data] of Object.entries(RIDER_TYPES)) {
    const profile = data.profile;

    if (sprintRatio >= profile.sprintRatio.min && sprintRatio <= profile.sprintRatio.max &&
        enduranceRatio >= profile.enduranceRatio.min && enduranceRatio <= profile.enduranceRatio.max) {
      return type;
    }
  }

  // Default to all-rounder
  return 'allRounder';
}

/**
 * Get category label from W/kg for FTP
 */
function getFTPCategory(wkg) {
  if (wkg >= 5.8) return { category: 'World Class', color: 'yellow' };
  if (wkg >= 5.0) return { category: 'Elite', color: 'red' };
  if (wkg >= 4.2) return { category: 'Competitive', color: 'orange' };
  if (wkg >= 3.5) return { category: 'Trained', color: 'lime' };
  if (wkg >= 2.8) return { category: 'Recreational', color: 'blue' };
  return { category: 'Untrained', color: 'gray' };
}

/**
 * Athlete Benchmarking Component
 */
const AthleteBenchmarking = ({ activities, ftp, weight, gender = 'male', age = 30 }) => {
  const [viewMode, setViewMode] = useState('percentiles');

  // Build power profile from activities
  const analysis = useMemo(() => {
    if (!activities || activities.length === 0 || !weight) return null;

    const powerProfile = {};
    const durations = [5, 60, 300, 1200, 3600];

    // Map from duration seconds to power_curve_summary keys
    const durationToKey = {
      5: '5s',
      60: '60s',
      300: '300s',
      1200: '1200s',
      3600: '3600s',
    };

    // First, try to use actual power_curve_summary data (Mean Maximal Power)
    // This is calculated from real power streams and is much more accurate
    activities.forEach(activity => {
      const pcs = activity.power_curve_summary;
      if (pcs && typeof pcs === 'object') {
        durations.forEach(d => {
          const key = durationToKey[d];
          const mmpValue = pcs[key];
          if (mmpValue && mmpValue > 0) {
            // Keep the best (highest) MMP across all activities
            if (!powerProfile[d] || mmpValue > powerProfile[d]) {
              powerProfile[d] = Math.round(mmpValue);
            }
          }
        });
      }
    });

    // Use FTP if provided (user-set FTP is more reliable for 60-minute power)
    // Note: We don't estimate short-duration power from avg/max - it's unreliable
    // Users should run power backfill to get accurate MMP data
    if (ftp) {
      powerProfile[3600] = ftp;
    }

    // Calculate percentiles for each duration
    const percentiles = {};
    const wkgProfile = {};

    for (const d of durations) {
      if (powerProfile[d]) {
        wkgProfile[d] = Math.round((powerProfile[d] / weight) * 100) / 100;
        percentiles[d] = Math.round(calculatePercentile(wkgProfile[d], d, gender, age));
      }
    }

    // Determine rider type
    const riderType = determineRiderType(powerProfile, weight);
    const riderTypeData = riderType ? RIDER_TYPES[riderType] : null;

    // FTP category
    const ftpWkg = ftp ? ftp / weight : (powerProfile[3600] / weight);
    const ftpCategory = getFTPCategory(ftpWkg);

    // Average percentile
    const percentileValues = Object.values(percentiles).filter(p => p > 0);
    const avgPercentile = percentileValues.length > 0
      ? Math.round(percentileValues.reduce((a, b) => a + b, 0) / percentileValues.length)
      : 0;

    return {
      powerProfile,
      wkgProfile,
      percentiles,
      riderType,
      riderTypeData,
      ftpCategory,
      avgPercentile,
    };
  }, [activities, ftp, weight, gender, age]);

  if (!analysis) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: tokens.colors.textMuted }} ta="center">
          Enter your weight in Settings to see how you compare to other cyclists.
        </Text>
      </Card>
    );
  }

  const RiderIcon = analysis.riderTypeData?.icon || IconTrophy;

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconUsers size={20} color={tokens.colors.electricLime} />
          <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
            Athlete Benchmarking
          </Text>
        </Group>
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={setViewMode}
          data={[
            { label: 'Percentiles', value: 'percentiles' },
            { label: 'Profile', value: 'profile' },
          ]}
        />
      </Group>

      {/* Rider Type & Category Summary */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="md">
        <Paper
          p="md"
          style={{
            backgroundColor: tokens.colors.bgTertiary,
            border: `1px solid var(--mantine-color-${analysis.riderTypeData?.color || 'gray'}-7)`,
          }}
        >
          <Group gap="sm" mb="xs">
            <RiderIcon size={24} color={`var(--mantine-color-${analysis.riderTypeData?.color || 'gray'}-5)`} />
            <Box>
              <Text size="lg" fw={700} c={analysis.riderTypeData?.color}>
                {analysis.riderTypeData?.name || 'Unknown'}
              </Text>
              <Text size="xs" c="dimmed">Rider Type</Text>
            </Box>
          </Group>
          <Text size="xs" c="dimmed">
            {analysis.riderTypeData?.description}
          </Text>
        </Paper>

        <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Text size="xs" c="dimmed" mb="xs">FTP Category</Text>
          <Badge size="lg" color={analysis.ftpCategory.color} variant="filled">
            {analysis.ftpCategory.category}
          </Badge>
          <Text size="lg" fw={700} mt="xs">
            {analysis.wkgProfile[3600] || '--'} W/kg
          </Text>
        </Paper>

        <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Text size="xs" c="dimmed" mb="xs">Overall Percentile</Text>
          <Text size="2rem" fw={700} c="lime">
            Top {100 - analysis.avgPercentile}%
          </Text>
          <Text size="xs" c="dimmed">
            Compared to {gender === 'female' ? 'female' : 'male'} cyclists
          </Text>
        </Paper>
      </SimpleGrid>

      {viewMode === 'percentiles' ? (
        /* Percentile View */
        <Stack gap="sm">
          <Text size="xs" fw={600} c="dimmed">Power Percentiles by Duration</Text>

          {[
            { duration: 5, label: '5 seconds (Sprint)' },
            { duration: 60, label: '1 minute (Anaerobic)' },
            { duration: 300, label: '5 minutes (VO2max)' },
            { duration: 1200, label: '20 minutes (Threshold)' },
            { duration: 3600, label: '60 minutes (FTP)' },
          ].map(({ duration, label }) => (
            <Paper key={duration} p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
              <Group justify="space-between" mb="xs">
                <Box>
                  <Text size="sm" fw={500}>{label}</Text>
                  <Text size="xs" c="dimmed">
                    {analysis.powerProfile[duration] || '--'}W
                    ({analysis.wkgProfile[duration] || '--'} W/kg)
                  </Text>
                </Box>
                <Badge color={getPercentileColor(analysis.percentiles[duration])} variant="light">
                  Top {100 - (analysis.percentiles[duration] || 0)}%
                </Badge>
              </Group>
              <Progress
                value={analysis.percentiles[duration] || 0}
                color={getPercentileColor(analysis.percentiles[duration])}
                size="md"
                radius="xl"
              />
            </Paper>
          ))}
        </Stack>
      ) : (
        /* Profile View - Strengths & Weaknesses */
        <Stack gap="md">
          {analysis.riderTypeData && (
            <>
              <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
                <Text size="sm" fw={600} c="green" mb="sm">Strengths</Text>
                <Group gap="xs">
                  {analysis.riderTypeData.strengths.map((s, i) => (
                    <Badge key={i} color="green" variant="light" size="sm">
                      {s}
                    </Badge>
                  ))}
                </Group>
              </Paper>

              <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
                <Text size="sm" fw={600} c="red" mb="sm">Areas to Improve</Text>
                <Group gap="xs">
                  {analysis.riderTypeData.weaknesses.map((w, i) => (
                    <Badge key={i} color="red" variant="light" size="sm">
                      {w}
                    </Badge>
                  ))}
                </Group>
              </Paper>
            </>
          )}

          {/* Benchmark Table */}
          <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
            <Text size="sm" fw={600} mb="sm">FTP Benchmark Categories (W/kg)</Text>
            <Table striped highlightOnHover size="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Male</Table.Th>
                  <Table.Th>Female</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[
                  { cat: 'World Class', male: '5.8+', female: '5.0+' },
                  { cat: 'Elite', male: '5.0-5.8', female: '4.3-5.0' },
                  { cat: 'Competitive', male: '4.2-5.0', female: '3.6-4.3' },
                  { cat: 'Trained', male: '3.5-4.2', female: '3.0-3.6' },
                  { cat: 'Recreational', male: '2.8-3.5', female: '2.4-3.0' },
                  { cat: 'Untrained', male: '<2.8', female: '<2.4' },
                ].map(row => (
                  <Table.Tr key={row.cat}>
                    <Table.Td>{row.cat}</Table.Td>
                    <Table.Td>{row.male}</Table.Td>
                    <Table.Td>{row.female}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Stack>
      )}

      <Text size="xs" c="dimmed" mt="md">
        Benchmarks based on Hunter/Coggan power profiling. Percentiles adjusted for age and gender.
      </Text>
    </Card>
  );
};

/**
 * Get color based on percentile
 */
function getPercentileColor(percentile) {
  if (!percentile) return 'gray';
  if (percentile >= 95) return 'yellow';
  if (percentile >= 85) return 'red';
  if (percentile >= 70) return 'orange';
  if (percentile >= 50) return 'lime';
  if (percentile >= 30) return 'blue';
  return 'gray';
}

/**
 * Compact percentile badge
 */
export function PercentileBadge({ wkg, duration = 3600, gender = 'male', age = 30 }) {
  const percentile = calculatePercentile(wkg, duration, gender, age);
  if (!percentile) return null;

  return (
    <Tooltip label={`Top ${100 - Math.round(percentile)}% of ${gender} cyclists`}>
      <Badge color={getPercentileColor(percentile)} variant="light" size="sm">
        Top {100 - Math.round(percentile)}%
      </Badge>
    </Tooltip>
  );
}

export default AthleteBenchmarking;
