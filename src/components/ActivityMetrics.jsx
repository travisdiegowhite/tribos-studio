import { useMemo } from 'react';
import {
  Group,
  Badge,
  Text,
  Tooltip,
  Stack,
  Paper,
  Box,
  SimpleGrid,
} from '@mantine/core';
import {
  IconBolt,
  IconActivity,
  IconHeart,
  IconFlame,
  IconGauge,
} from '@tabler/icons-react';
import { tokens } from '../theme';

// FIT protocol uses 0xFFFF (65535) for "no data" - must filter before calculations
const MAX_VALID_POWER_WATTS = 2500;

/**
 * Calculate Normalized Power (NP) estimate from average power
 * Real NP requires power stream data with 30-second rolling averages
 * This is an approximation based on ride characteristics
 */
export function estimateNormalizedPower(avgPower, maxPower, variability = 'moderate') {
  if (!avgPower) return null;

  // NP is typically 1.0-1.2x average power depending on variability
  // Steady rides: ~1.02-1.05x
  // Variable rides: ~1.05-1.15x
  // Highly variable (crits, MTB): ~1.15-1.25x
  const variabilityFactors = {
    steady: 1.03,
    moderate: 1.08,
    variable: 1.13,
    highly_variable: 1.20,
  };

  const factor = variabilityFactors[variability] || 1.08;

  // If we have max power, we can better estimate variability
  if (maxPower && avgPower) {
    const maxToAvgRatio = maxPower / avgPower;
    // Higher ratio = more variable ride
    const adjustedFactor = 1 + Math.min(0.25, (maxToAvgRatio - 1) * 0.1);
    return Math.round(avgPower * adjustedFactor);
  }

  return Math.round(avgPower * factor);
}

/**
 * Calculate Intensity Factor (IF)
 * IF = NP / FTP
 */
export function calculateIF(normalizedPower, ftp) {
  if (!normalizedPower || !ftp) return null;
  return Math.round((normalizedPower / ftp) * 100) / 100;
}

/**
 * Calculate Variability Index (VI)
 * VI = NP / Average Power
 * VI close to 1.0 = steady effort
 * VI > 1.1 = variable effort
 */
export function calculateVI(normalizedPower, avgPower) {
  if (!normalizedPower || !avgPower) return null;
  return Math.round((normalizedPower / avgPower) * 100) / 100;
}

/**
 * Calculate TSS from power metrics
 * TSS = (duration_seconds * NP * IF) / (FTP * 3600) * 100
 */
export function calculateTSSFromPower(durationSeconds, normalizedPower, ftp) {
  if (!durationSeconds || !normalizedPower || !ftp) return null;
  const IF = normalizedPower / ftp;
  return Math.round((durationSeconds * normalizedPower * IF) / (ftp * 3600) * 100);
}

/**
 * Get IF zone description
 */
export function getIFZone(intensityFactor) {
  if (!intensityFactor) return null;

  if (intensityFactor < 0.55) {
    return { zone: 1, name: 'Recovery', color: 'green' };
  } else if (intensityFactor < 0.75) {
    return { zone: 2, name: 'Endurance', color: 'blue' };
  } else if (intensityFactor < 0.90) {
    return { zone: 3, name: 'Tempo', color: 'yellow' };
  } else if (intensityFactor < 1.05) {
    return { zone: 4, name: 'Threshold', color: 'orange' };
  } else if (intensityFactor < 1.20) {
    return { zone: 5, name: 'VO2max', color: 'red' };
  } else {
    return { zone: 6, name: 'Anaerobic', color: 'pink' };
  }
}

/**
 * Compact Activity Metrics Badge Row
 * Shows NP, IF, VI, TSS in a compact format
 */
export function ActivityMetricsBadges({ activity, ftp }) {
  const metrics = useMemo(() => {
    if (!activity) return null;

    const avgPower = activity.average_watts;
    const rawMaxPower = activity.max_watts;
    const duration = activity.moving_time || activity.elapsed_time;

    if (!avgPower) return null;

    // Sanitize FIT sentinel values (0xFFFF = 65535)
    const maxPower = rawMaxPower > 0 && rawMaxPower < MAX_VALID_POWER_WATTS ? rawMaxPower : 0;
    const maxPowerCorrupted = rawMaxPower >= MAX_VALID_POWER_WATTS;

    // If max_power was a sentinel, stored NP/metrics are corrupted too
    const np = (!maxPowerCorrupted && activity.normalized_power) || estimateNormalizedPower(avgPower, maxPower);
    const intensityFactor = (!maxPowerCorrupted && activity.intensity_factor) || calculateIF(np, ftp);
    const vi = calculateVI(np, avgPower);
    const tss = (!maxPowerCorrupted && activity.tss) || calculateTSSFromPower(duration, np, ftp);
    const ifZone = getIFZone(intensityFactor);

    return {
      avgPower,
      np,
      intensityFactor,
      vi,
      tss,
      ifZone,
    };
  }, [activity, ftp]);

  if (!metrics) return null;

  // Visual Hierarchy: Use muted badges for metrics to avoid rainbow effect
  // Only highlight exceptional values (high IF or high TSS), not routine metrics
  return (
    <Group gap="xs" wrap="wrap">
      {/* Average Power */}
      <Tooltip label="Average Power">
        <Badge color="gray" variant="light" size="sm" leftSection={<IconBolt size={12} />}>
          {metrics.avgPower}W avg
        </Badge>
      </Tooltip>

      {/* Normalized Power */}
      {metrics.np && (
        <Tooltip label="Normalized Power - accounts for variability in effort">
          <Badge color="gray" variant="light" size="sm">
            {metrics.np}W NP
          </Badge>
        </Tooltip>
      )}

      {/* Intensity Factor - only highlight if threshold+ effort */}
      {metrics.intensityFactor && ftp && (
        <Tooltip label={`Intensity Factor (${metrics.ifZone?.name}) - NP as % of FTP`}>
          <Badge
            color={metrics.intensityFactor >= 1.0 ? 'orange' : 'gray'}
            variant="light"
            size="sm"
          >
            IF {metrics.intensityFactor.toFixed(2)}
          </Badge>
        </Tooltip>
      )}

      {/* Variability Index */}
      {metrics.vi && (
        <Tooltip
          label={
            metrics.vi <= 1.05
              ? 'Very steady effort'
              : metrics.vi <= 1.1
                ? 'Moderately variable'
                : 'Highly variable (intervals/racing)'
          }
        >
          <Badge color="gray" variant="light" size="sm">
            VI {metrics.vi.toFixed(2)}
          </Badge>
        </Tooltip>
      )}

      {/* TSS - only highlight if high training load */}
      {metrics.tss && (
        <Tooltip label="Training Stress Score - overall training load">
          <Badge
            color={metrics.tss >= 150 ? 'orange' : 'gray'}
            variant="light"
            size="sm"
            leftSection={<IconFlame size={12} />}
          >
            {metrics.tss} TSS
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

/**
 * Detailed Activity Metrics Panel
 * Full breakdown of power metrics for activity detail view
 */
export function ActivityMetricsPanel({ activity, ftp, weight }) {
  const metrics = useMemo(() => {
    if (!activity) return null;

    const avgPower = activity.average_watts;
    const rawMaxPower = activity.max_watts;
    const duration = activity.moving_time || activity.elapsed_time;
    const avgHr = activity.average_heartrate;
    const maxHr = activity.max_heartrate;

    if (!avgPower && !avgHr) return null;

    // Sanitize FIT sentinel values (0xFFFF = 65535)
    const maxPower = rawMaxPower > 0 && rawMaxPower < MAX_VALID_POWER_WATTS ? rawMaxPower : 0;
    const maxPowerCorrupted = rawMaxPower >= MAX_VALID_POWER_WATTS;

    const np = avgPower
      ? ((!maxPowerCorrupted && activity.normalized_power) || estimateNormalizedPower(avgPower, maxPower))
      : null;
    const intensityFactor = (!maxPowerCorrupted && activity.intensity_factor) || calculateIF(np, ftp);
    const vi = calculateVI(np, avgPower);
    const tss = (!maxPowerCorrupted && activity.tss) || calculateTSSFromPower(duration, np, ftp);
    const ifZone = getIFZone(intensityFactor);

    // W/kg calculations
    const avgWkg = avgPower && weight ? (avgPower / weight).toFixed(2) : null;
    const npWkg = np && weight ? (np / weight).toFixed(2) : null;
    const maxWkg = maxPower && weight ? (maxPower / weight).toFixed(2) : null;

    // Efficiency Factor (power per HR) - aerobic efficiency metric
    const ef = avgPower && avgHr ? (np || avgPower) / avgHr : null;

    return {
      avgPower,
      maxPower,
      np,
      intensityFactor,
      vi,
      tss,
      ifZone,
      avgWkg,
      npWkg,
      maxWkg,
      avgHr,
      maxHr,
      ef,
      duration,
    };
  }, [activity, ftp, weight]);

  if (!metrics) {
    return (
      <Paper p="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Text size="sm" c="dimmed" ta="center">
          No power or heart rate data available
        </Text>
      </Paper>
    );
  }

  return (
    <Paper p="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
      <Text size="sm" fw={600} mb="sm">Activity Metrics</Text>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
        {/* Power Metrics */}
        {metrics.avgPower && (
          <MetricCard
            icon={<IconBolt size={16} color={tokens.colors.zone4} />}
            label="Avg Power"
            value={`${metrics.avgPower}W`}
            subValue={metrics.avgWkg ? `${metrics.avgWkg} W/kg` : null}
          />
        )}

        {metrics.np && (
          <MetricCard
            icon={<IconActivity size={16} color={tokens.colors.zone4} />}
            label="Normalized"
            value={`${metrics.np}W`}
            subValue={metrics.npWkg ? `${metrics.npWkg} W/kg` : null}
          />
        )}

        {metrics.maxPower && (
          <MetricCard
            icon={<IconBolt size={16} color={tokens.colors.zone5} />}
            label="Max Power"
            value={`${metrics.maxPower}W`}
            subValue={metrics.maxWkg ? `${metrics.maxWkg} W/kg` : null}
          />
        )}

        {metrics.intensityFactor && (
          <MetricCard
            icon={<IconGauge size={16} color={tokens.colors.zone3} />}
            label="Intensity Factor"
            value={metrics.intensityFactor.toFixed(2)}
            subValue={metrics.ifZone?.name}
            color={metrics.ifZone?.color}
          />
        )}

        {metrics.vi && (
          <MetricCard
            icon={<IconActivity size={16} color={tokens.colors.zone6} />}
            label="Variability Index"
            value={metrics.vi.toFixed(2)}
            subValue={metrics.vi <= 1.05 ? 'Steady' : metrics.vi <= 1.1 ? 'Variable' : 'Racing'}
          />
        )}

        {metrics.tss && (
          <MetricCard
            icon={<IconFlame size={16} color={tokens.colors.zone5} />}
            label="TSS"
            value={metrics.tss.toString()}
            subValue="Training Stress"
          />
        )}

        {/* Heart Rate Metrics */}
        {metrics.avgHr && (
          <MetricCard
            icon={<IconHeart size={16} color="#C4785C" />}
            label="Avg HR"
            value={`${Math.round(metrics.avgHr)} bpm`}
            subValue={metrics.maxHr ? `Max: ${Math.round(metrics.maxHr)}` : null}
          />
        )}

        {/* Efficiency Factor */}
        {metrics.ef && (
          <MetricCard
            icon={<IconGauge size={16} color={tokens.colors.zone2} />}
            label="Efficiency"
            value={metrics.ef.toFixed(2)}
            subValue="NP/HR ratio"
          />
        )}
      </SimpleGrid>

      {/* Info text */}
      <Text size="xs" c="dimmed" mt="sm">
        NP and VI are estimated from average/max power. Actual values require power stream data.
      </Text>
    </Paper>
  );
}

/**
 * Metric Card Component
 */
function MetricCard({ icon, label, value, subValue, color }) {
  return (
    <Box>
      <Group gap="xs" mb={2}>
        {icon}
        <Text size="xs" c="dimmed">{label}</Text>
      </Group>
      <Text size="md" fw={700} c={color}>
        {value}
      </Text>
      {subValue && (
        <Text size="xs" c="dimmed">{subValue}</Text>
      )}
    </Box>
  );
}

export default {
  estimateNormalizedPower,
  calculateIF,
  calculateVI,
  calculateTSSFromPower,
  getIFZone,
  ActivityMetricsBadges,
  ActivityMetricsPanel,
};
