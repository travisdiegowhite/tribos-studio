import { useMemo, useState } from 'react';
import { Badge, Box, Group, SegmentedControl, Stack, Table, Text, Tooltip } from '@mantine/core';
import { StatRow, SubHeading, kicker, mono } from './train/progressUi.jsx';
import { ChartBar, Fire, Lightning, Mountains, Trophy } from '@phosphor-icons/react';

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
    icon: Lightning,
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
    icon: Fire,
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
    icon: ChartBar,
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
    icon: Mountains,
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
    icon: Trophy,
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
  // Role colours only: the top tiers in signal, the middle in ink, the rest muted.
  if (wkg >= 5.8) return { category: 'World Class', color: 'signal' };
  if (wkg >= 5.0) return { category: 'Elite', color: 'signal' };
  if (wkg >= 4.2) return { category: 'Competitive', color: 'ink' };
  if (wkg >= 3.5) return { category: 'Trained', color: 'ink' };
  if (wkg >= 2.8) return { category: 'Recreational', color: 'easy' };
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
      <Box>
        <SubHeading>Benchmarking</SubHeading>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          Enter your weight in Settings to see how you compare to other cyclists.
        </Text>
      </Box>
    );
  }

  const DURATIONS = [
    { duration: 5, label: '5 seconds (sprint)' },
    { duration: 60, label: '1 minute (anaerobic)' },
    { duration: 300, label: '5 minutes (VO2max)' },
    { duration: 1200, label: '20 minutes (threshold)' },
    { duration: 3600, label: '60 minutes (FTP)' },
  ];

  return (
    <Box>
      <SubHeading
        aside={
          <SegmentedControl
            size="xs"
            radius={0}
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: 'Percentiles', value: 'percentiles' },
              { label: 'Profile', value: 'profile' },
            ]}
          />
        }
      >
        Benchmarking
      </SubHeading>

      <StatRow
        minWidth={150}
        stats={[
          {
            label: 'Rider type',
            value: (analysis.riderTypeData?.name || 'Unknown').toUpperCase(),
            note: analysis.riderTypeData?.description,
          },
          { label: 'FTP category', value: `${analysis.wkgProfile[3600] || '--'} W/kg`, note: analysis.ftpCategory.category },
          {
            label: 'Overall',
            value: `Top ${100 - analysis.avgPercentile}%`,
            note: `of ${gender === 'female' ? 'female' : 'male'} cyclists`,
          },
        ]}
      />

      {viewMode === 'percentiles' ? (
        <Box mt="md">
          <Text style={kicker} mb={4}>Power percentiles by duration</Text>
          <Box style={{ borderTop: '1px solid var(--color-border)' }}>
            {DURATIONS.map(({ duration, label }) => {
              const pct = analysis.percentiles[duration] || 0;
              return (
                <Box key={duration} style={{ borderBottom: '1px solid var(--color-border)', padding: '8px 0' }}>
                  <Group justify="space-between" wrap="nowrap" mb={6}>
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600}>{label}</Text>
                      <Text style={{ ...mono, fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {analysis.powerProfile[duration] || '--'}W · {analysis.wkgProfile[duration] || '--'} W/kg
                      </Text>
                    </Box>
                    <Text style={{ ...mono, fontSize: 14, fontWeight: 700, color: pct >= 85 ? 'var(--color-signal-text)' : undefined }}>
                      Top {100 - pct}%
                    </Text>
                  </Group>
                  <Box style={{ height: 6, backgroundColor: 'var(--color-bg-secondary)' }}>
                    <Box style={{ height: 6, width: `${pct}%`, backgroundColor: pct >= 85 ? 'var(--color-signal)' : 'var(--color-ink)' }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        <Stack gap="md" mt="md">
          {analysis.riderTypeData && (
            <>
              <Box>
                <Text style={kicker} mb={4}>Strengths</Text>
                <Text size="sm">{analysis.riderTypeData.strengths.join(' · ')}</Text>
              </Box>
              <Box>
                <Text style={kicker} mb={4}>Areas to improve</Text>
                <Text size="sm">{analysis.riderTypeData.weaknesses.join(' · ')}</Text>
              </Box>
            </>
          )}

          <Box>
            <Text style={kicker} mb={4}>FTP benchmark categories (W/kg)</Text>
            <Table size="sm" withRowBorders style={{ fontFamily: 'var(--font-mono)' }}>
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
                  <Table.Tr key={row.cat} style={row.cat === analysis.ftpCategory.category ? { fontWeight: 700 } : undefined}>
                    <Table.Td>{row.cat}</Table.Td>
                    <Table.Td>{row.male}</Table.Td>
                    <Table.Td>{row.female}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </Stack>
      )}

      <Text size="xs" c="var(--color-text-muted)" mt="md">
        Benchmarks based on Hunter/Coggan power profiling. Percentiles adjusted for age and gender.
      </Text>
    </Box>
  );
};

/**
 * Get color based on percentile
 */
function getPercentileColor(percentile) {
  // Role ramps: top 15% in signal, above median in ink, the rest easy / muted.
  if (!percentile) return 'gray';
  if (percentile >= 85) return 'signal';
  if (percentile >= 50) return 'ink';
  if (percentile >= 30) return 'easy';
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
