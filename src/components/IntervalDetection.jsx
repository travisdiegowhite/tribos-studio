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
  Table,
  Tooltip,
  Collapse,
  Button,
  Progress,
} from '@mantine/core';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  IconChartAreaLine,
  IconBolt,
  IconClock,
  IconFlame,
  IconChevronDown,
  IconChevronUp,
  IconTarget,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { getPowerZone, getZoneName, getZoneColor } from '../utils/trainingPlans';

/**
 * Automatic Interval Detection Component
 *
 * Analyzes activity data to detect interval efforts without
 * requiring the athlete to use a lap button.
 *
 * Detection methods:
 * 1. Power threshold crossing (above/below FTP percentage)
 * 2. Duration-based filtering (min interval length)
 * 3. Recovery detection between intervals
 *
 * Note: Full implementation requires power stream data.
 * This component provides estimates from average/max power.
 */

/**
 * Detect intervals from power data stream
 * @param {number[]} powerData - Array of power values (1 per second)
 * @param {number} ftp - Functional Threshold Power
 * @param {Object} options - Detection options
 */
export function detectIntervals(powerData, ftp, options = {}) {
  const {
    minIntervalDuration = 30, // Minimum 30 seconds
    minRestDuration = 15, // Minimum 15 seconds recovery
    intervalThresholdPct = 88, // Above this % of FTP = interval
    restThresholdPct = 65, // Below this % of FTP = recovery
    smoothingWindow = 10, // 10-second smoothing
  } = options;

  if (!powerData || powerData.length < minIntervalDuration || !ftp) {
    return [];
  }

  const intervalThreshold = ftp * (intervalThresholdPct / 100);
  const restThreshold = ftp * (restThresholdPct / 100);

  // Smooth power data
  const smoothedPower = [];
  for (let i = 0; i < powerData.length; i++) {
    const start = Math.max(0, i - Math.floor(smoothingWindow / 2));
    const end = Math.min(powerData.length, i + Math.floor(smoothingWindow / 2) + 1);
    const window = powerData.slice(start, end);
    smoothedPower.push(window.reduce((a, b) => a + b, 0) / window.length);
  }

  const intervals = [];
  let currentInterval = null;

  for (let i = 0; i < smoothedPower.length; i++) {
    const power = smoothedPower[i];

    if (power >= intervalThreshold) {
      // In an interval
      if (!currentInterval) {
        currentInterval = {
          startTime: i,
          endTime: i,
          powers: [power],
          type: 'work',
        };
      } else {
        currentInterval.endTime = i;
        currentInterval.powers.push(power);
      }
    } else if (currentInterval) {
      // Exited interval
      const duration = currentInterval.endTime - currentInterval.startTime + 1;

      if (duration >= minIntervalDuration) {
        // Valid interval
        const avgPower = currentInterval.powers.reduce((a, b) => a + b, 0) / currentInterval.powers.length;
        const maxPower = Math.max(...currentInterval.powers);
        const zone = getPowerZone(avgPower, ftp);

        intervals.push({
          startTime: currentInterval.startTime,
          endTime: currentInterval.endTime,
          duration,
          avgPower: Math.round(avgPower),
          maxPower: Math.round(maxPower),
          zone,
          intensityFactor: Math.round((avgPower / ftp) * 100) / 100,
          type: 'work',
        });
      }

      currentInterval = null;
    }
  }

  // Handle interval at end of ride
  if (currentInterval) {
    const duration = currentInterval.endTime - currentInterval.startTime + 1;
    if (duration >= minIntervalDuration) {
      const avgPower = currentInterval.powers.reduce((a, b) => a + b, 0) / currentInterval.powers.length;
      const maxPower = Math.max(...currentInterval.powers);
      const zone = getPowerZone(avgPower, ftp);

      intervals.push({
        startTime: currentInterval.startTime,
        endTime: currentInterval.endTime,
        duration,
        avgPower: Math.round(avgPower),
        maxPower: Math.round(maxPower),
        zone,
        intensityFactor: Math.round((avgPower / ftp) * 100) / 100,
        type: 'work',
      });
    }
  }

  return intervals;
}

/**
 * Estimate interval structure from activity summary
 * Without power stream, we estimate based on activity characteristics
 */
export function estimateIntervalStructure(activity, ftp) {
  if (!activity || !activity.average_watts || !ftp) {
    return null;
  }

  const avgPower = activity.average_watts;
  const maxPower = activity.max_watts || avgPower * 1.5;
  const duration = activity.moving_time || 0;
  const avgHR = activity.average_heartrate;
  const maxHR = activity.max_heartrate;

  // Calculate variability indicators
  const powerVariability = maxPower / avgPower;
  const hrVariability = maxHR && avgHR ? maxHR / avgHR : 1;

  // Estimate workout type based on variability and intensity
  const intensityFactor = avgPower / ftp;

  let structure = {
    type: 'steady',
    estimatedIntervals: 0,
    intervalDuration: 0,
    restDuration: 0,
    description: '',
    confidence: 'low',
  };

  if (powerVariability > 1.6 || hrVariability > 1.25) {
    // Likely intervals
    structure.type = 'intervals';

    // Estimate interval count based on duration and variability
    if (intensityFactor > 0.95) {
      // High intensity - shorter intervals
      structure.estimatedIntervals = Math.round(duration / 600); // ~10 min cycles
      structure.intervalDuration = 180; // ~3 min intervals
      structure.restDuration = 180;
      structure.description = 'Appears to be threshold/VO2 intervals';
    } else if (intensityFactor > 0.85) {
      // Sweet spot intervals
      structure.estimatedIntervals = Math.round(duration / 900); // ~15 min cycles
      structure.intervalDuration = 600; // ~10 min intervals
      structure.restDuration = 300;
      structure.description = 'Appears to be sweet spot intervals';
    } else {
      // Tempo intervals or surges
      structure.estimatedIntervals = Math.round(duration / 1200);
      structure.intervalDuration = 900;
      structure.restDuration = 300;
      structure.description = 'Appears to be tempo efforts with recovery';
    }

    structure.confidence = powerVariability > 1.8 ? 'medium' : 'low';
  } else if (intensityFactor > 0.85) {
    structure.type = 'steady_hard';
    structure.description = 'Steady hard effort (tempo/sweet spot)';
    structure.confidence = 'medium';
  } else if (intensityFactor > 0.65) {
    structure.type = 'steady_endurance';
    structure.description = 'Steady endurance ride';
    structure.confidence = 'high';
  } else {
    structure.type = 'recovery';
    structure.description = 'Recovery or easy ride';
    structure.confidence = 'high';
  }

  // Calculate work breakdown estimate
  if (structure.type === 'intervals' && structure.estimatedIntervals > 0) {
    const totalIntervalTime = structure.estimatedIntervals * structure.intervalDuration;
    const totalRestTime = structure.estimatedIntervals * structure.restDuration;
    const warmupCooldown = duration - totalIntervalTime - totalRestTime;

    structure.breakdown = {
      warmup: Math.max(0, warmupCooldown / 2),
      intervals: totalIntervalTime,
      recovery: totalRestTime,
      cooldown: Math.max(0, warmupCooldown / 2),
    };
  }

  return structure;
}

/**
 * Interval Detection Analysis Card
 */
const IntervalDetection = ({ activity, ftp }) => {
  const [showDetails, setShowDetails] = useState(false);

  const analysis = useMemo(() => {
    return estimateIntervalStructure(activity, ftp);
  }, [activity, ftp]);

  if (!analysis) {
    return (
      <Card withBorder p="md">
        <Text size="sm" c="dimmed" ta="center">
          No power data available for interval detection
        </Text>
      </Card>
    );
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'intervals': return 'orange';
      case 'steady_hard': return 'red';
      case 'steady_endurance': return 'blue';
      case 'recovery': return 'green';
      default: return 'gray';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'intervals': return IconBolt;
      case 'steady_hard': return IconFlame;
      case 'steady_endurance': return IconClock;
      case 'recovery': return IconTarget;
      default: return IconChartAreaLine;
    }
  };

  const TypeIcon = getTypeIcon(analysis.type);

  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <IconChartAreaLine size={20} color={tokens.colors.electricLime} />
          <Text size="sm" fw={600}>Workout Structure Analysis</Text>
        </Group>
        <Badge color={getTypeColor(analysis.type)} variant="light">
          {analysis.type.replace('_', ' ')}
        </Badge>
      </Group>

      {/* Main Summary */}
      <Paper
        p="md"
        mb="md"
        style={{
          backgroundColor: tokens.colors.bgTertiary,
          border: `1px solid var(--mantine-color-${getTypeColor(analysis.type)}-7)`,
        }}
      >
        <Group gap="sm" mb="sm">
          <TypeIcon size={24} color={`var(--mantine-color-${getTypeColor(analysis.type)}-5)`} />
          <Box>
            <Text fw={600}>{analysis.description}</Text>
            <Text size="xs" c="dimmed">
              Confidence: {analysis.confidence}
            </Text>
          </Box>
        </Group>

        {analysis.type === 'intervals' && (
          <SimpleGrid cols={{ base: 3 }} spacing="sm">
            <Box>
              <Text size="xs" c="dimmed">Est. Intervals</Text>
              <Text size="lg" fw={700}>{analysis.estimatedIntervals}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Work Duration</Text>
              <Text size="lg" fw={700}>{Math.round(analysis.intervalDuration / 60)}m</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Rest Duration</Text>
              <Text size="lg" fw={700}>{Math.round(analysis.restDuration / 60)}m</Text>
            </Box>
          </SimpleGrid>
        )}
      </Paper>

      {/* Breakdown visualization */}
      {analysis.breakdown && (
        <Box mb="md">
          <Text size="xs" fw={500} mb="xs">Estimated Workout Breakdown</Text>
          <Progress.Root size="xl" radius="xl">
            <Tooltip label={`Warmup: ${Math.round(analysis.breakdown.warmup / 60)}m`}>
              <Progress.Section
                value={(analysis.breakdown.warmup / activity.moving_time) * 100}
                color="blue"
              />
            </Tooltip>
            <Tooltip label={`Intervals: ${Math.round(analysis.breakdown.intervals / 60)}m`}>
              <Progress.Section
                value={(analysis.breakdown.intervals / activity.moving_time) * 100}
                color="orange"
              />
            </Tooltip>
            <Tooltip label={`Recovery: ${Math.round(analysis.breakdown.recovery / 60)}m`}>
              <Progress.Section
                value={(analysis.breakdown.recovery / activity.moving_time) * 100}
                color="green"
              />
            </Tooltip>
            <Tooltip label={`Cooldown: ${Math.round(analysis.breakdown.cooldown / 60)}m`}>
              <Progress.Section
                value={(analysis.breakdown.cooldown / activity.moving_time) * 100}
                color="cyan"
              />
            </Tooltip>
          </Progress.Root>
          <Group justify="space-between" mt="xs">
            <Group gap="xs">
              <Box w={12} h={12} bg="blue" style={{ borderRadius: 2 }} />
              <Text size="xs">Warmup</Text>
            </Group>
            <Group gap="xs">
              <Box w={12} h={12} bg="orange" style={{ borderRadius: 2 }} />
              <Text size="xs">Intervals</Text>
            </Group>
            <Group gap="xs">
              <Box w={12} h={12} bg="green" style={{ borderRadius: 2 }} />
              <Text size="xs">Recovery</Text>
            </Group>
            <Group gap="xs">
              <Box w={12} h={12} bg="cyan" style={{ borderRadius: 2 }} />
              <Text size="xs">Cooldown</Text>
            </Group>
          </Group>
        </Box>
      )}

      {/* Activity Stats */}
      <Button
        variant="subtle"
        color="gray"
        size="xs"
        fullWidth
        onClick={() => setShowDetails(!showDetails)}
        rightSection={showDetails ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      >
        {showDetails ? 'Hide' : 'Show'} Activity Details
      </Button>

      <Collapse in={showDetails}>
        <Paper p="sm" mt="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <SimpleGrid cols={{ base: 2 }} spacing="sm">
            <Box>
              <Text size="xs" c="dimmed">Avg Power</Text>
              <Text size="sm" fw={500}>{activity.average_watts}W</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Max Power</Text>
              <Text size="sm" fw={500}>{activity.max_watts || '--'}W</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Duration</Text>
              <Text size="sm" fw={500}>{Math.round(activity.moving_time / 60)}m</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Intensity Factor</Text>
              <Text size="sm" fw={500}>
                {ftp ? (activity.average_watts / ftp).toFixed(2) : '--'}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Variability</Text>
              <Text size="sm" fw={500}>
                {activity.max_watts ? (activity.max_watts / activity.average_watts).toFixed(2) : '--'}x
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Zone</Text>
              <Badge size="sm" color={getZoneColor(getPowerZone(activity.average_watts, ftp))}>
                {getZoneName(getPowerZone(activity.average_watts, ftp))}
              </Badge>
            </Box>
          </SimpleGrid>
        </Paper>
      </Collapse>

      <Text size="xs" c="dimmed" mt="md">
        Structure estimated from activity metrics. For precise interval detection, power stream data is required.
      </Text>
    </Card>
  );
};

/**
 * Compact workout type badge
 */
export function WorkoutTypeBadge({ activity, ftp }) {
  const analysis = estimateIntervalStructure(activity, ftp);
  if (!analysis) return null;

  const getTypeColor = (type) => {
    switch (type) {
      case 'intervals': return 'orange';
      case 'steady_hard': return 'red';
      case 'steady_endurance': return 'blue';
      case 'recovery': return 'green';
      default: return 'gray';
    }
  };

  return (
    <Tooltip label={analysis.description}>
      <Badge color={getTypeColor(analysis.type)} variant="light" size="sm">
        {analysis.type === 'intervals'
          ? `~${analysis.estimatedIntervals} intervals`
          : analysis.type.replace('_', ' ')}
      </Badge>
    </Tooltip>
  );
}

export default IntervalDetection;
