/**
 * SegmentEffortCompare
 *
 * "Familiar Segments" panel for the ride analysis modal. Compares this ride's
 * traversals of known training segments against the rider's own history on the
 * same segments — holistically (effort, speed, efficiency, pacing), not just
 * elapsed time. Renders nothing when the ride has no matched segments with
 * comparable history.
 */

import { Badge, Box, Divider, Group, Loader, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { Lightning, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useSegmentEffortComparison } from '../hooks/useSegmentEffortComparison';
import type { MetricComparison, SegmentComparison } from '../utils/segmentEffortComparison';

// ============================================================================
// FORMATTING
// ============================================================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatMetricValue(m: MetricComparison, formatSpeed?: (kmh: number) => string): string {
  switch (m.key) {
    case 'duration':
      return formatDuration(m.current);
    case 'speed':
      return formatSpeed ? formatSpeed(m.current) : `${m.current.toFixed(1)} km/h`;
    case 'power':
      return `${Math.round(m.current)} W`;
    case 'hr':
      return `${Math.round(m.current)} bpm`;
    case 'ef':
      return `${m.current.toFixed(2)} W/bpm`;
    case 'speed_per_watt':
      // Scale to a readable magnitude: km/h produced per 100 W.
      return `${(m.current * 100).toFixed(1)} km/h·100W`;
    case 'speed_per_beat':
      return `${(m.current * 10).toFixed(2)} km/h·10bpm`;
    case 'vi':
      return m.current.toFixed(2);
    case 'cadence':
      return `${Math.round(m.current)} rpm`;
    default:
      return String(m.current);
  }
}

/**
 * Badge color for a delta. Outcome metrics get judged (teal = better,
 * orange = worse); effort metrics (power, HR, cadence) are context, not a
 * judgement, so they stay neutral.
 */
function deltaColor(m: MetricComparison): string {
  if (m.trend === 'flat') return 'gray';
  if (m.kind === 'effort') return 'gray';
  const isBetter = m.kind === 'outcome' ? m.trend === 'up' : m.trend === 'down';
  return isBetter ? 'teal' : 'orange';
}

function deltaLabel(m: MetricComparison): string {
  const sign = m.deltaPct > 0 ? '+' : '';
  return `${sign}${m.deltaPct.toFixed(1)}%`;
}

const TERRAIN_COLORS: Record<string, string> = {
  climb: 'orange',
  descent: 'blue',
  rolling: 'grape',
  flat: 'teal',
};

// Metrics shown in the grid, in display order. speed_per_beat only matters
// for HR-only rides, where speed_per_watt/ef won't be present anyway.
const DISPLAY_ORDER: MetricComparison['key'][] = [
  'duration',
  'speed',
  'power',
  'hr',
  'ef',
  'speed_per_watt',
  'speed_per_beat',
  'vi',
];

const METRIC_TOOLTIPS: Partial<Record<MetricComparison['key'], string>> = {
  ef: 'Efficiency Factor — power produced per heartbeat. Higher means the same output cost you less.',
  speed_per_watt: 'Speed each watt bought you — sensitive to wind, position, and surface.',
  speed_per_beat: 'Speed per heartbeat — aerobic efficiency when no power meter is present.',
  vi: 'Variability Index (NP ÷ avg power) — lower means steadier pacing.',
  duration: 'Compared to your median time across past efforts on this segment.',
};

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function MetricCell({ metric, formatSpeed }: { metric: MetricComparison; formatSpeed?: (kmh: number) => string }) {
  const tooltip = METRIC_TOOLTIPS[metric.key];
  const cell = (
    <Box>
      <Text size="xs" c="dimmed">{metric.label}</Text>
      <Group gap={6} align="baseline" wrap="nowrap">
        <Text size="sm" fw={600}>{formatMetricValue(metric, formatSpeed)}</Text>
        <Badge size="xs" variant="light" color={deltaColor(metric)}>
          {deltaLabel(metric)}
        </Badge>
      </Group>
    </Box>
  );
  return tooltip ? <Tooltip label={tooltip} withArrow multiline w={240}>{cell}</Tooltip> : cell;
}

function SegmentCard({ comparison, formatSpeed }: { comparison: SegmentComparison; formatSpeed?: (kmh: number) => string }) {
  const { segment, metrics, verdict, historyCount, isFastest, isBestEfficiency, effort } = comparison;

  const shownMetrics = DISPLAY_ORDER
    .map((key) => metrics.find((m) => m.key === key))
    .filter((m): m is MetricComparison => !!m);

  const distKm = (segment.distance_meters / 1000).toFixed(1);
  const terrainColor = TERRAIN_COLORS[segment.terrain_type] || 'gray';

  return (
    <Paper p="sm" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Box style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600} lineClamp={1}>
                {segment.display_name || 'Unnamed segment'}
              </Text>
              {effort === 'harder' && <TrendUp size={14} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />}
              {effort === 'easier' && <TrendDown size={14} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />}
            </Group>
            <Text size="xs" c="dimmed">
              {distKm} km {segment.terrain_type}
              {segment.avg_gradient ? ` · ${segment.avg_gradient > 0 ? '+' : ''}${Number(segment.avg_gradient).toFixed(1)}%` : ''}
              {' · '}vs {historyCount} past effort{historyCount === 1 ? '' : 's'}
            </Text>
          </Box>
          <Group gap={4} style={{ flexShrink: 0 }}>
            <Badge size="xs" variant="light" color={terrainColor}>{segment.terrain_type}</Badge>
            {isFastest && (
              <Badge size="xs" color="yellow" variant="filled" leftSection={<Lightning size={10} weight="fill" />}>
                Fastest yet
              </Badge>
            )}
            {isBestEfficiency && !isFastest && (
              <Badge size="xs" color="teal" variant="filled">Best efficiency</Badge>
            )}
          </Group>
        </Group>

        <Text size="sm">{verdict}</Text>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" verticalSpacing="xs">
          {shownMetrics.map((m) => (
            <MetricCell key={m.key} metric={m} formatSpeed={formatSpeed} />
          ))}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SegmentEffortCompareProps {
  ride: {
    id: string;
    user_id?: string;
    activity_streams?: unknown;
    training_segments_analyzed_at?: string | null;
  } | null;
  enabled: boolean;
  formatSpeed?: (kmh: number) => string;
}

export default function SegmentEffortCompare({ ride, enabled, formatSpeed }: SegmentEffortCompareProps) {
  const { status, comparisons, summary } = useSegmentEffortComparison(ride, enabled);

  // Nothing to say: no matched segments, error, or not started. Stay silent —
  // this panel should only appear when it has something useful to show.
  if (status === 'idle' || status === 'empty' || status === 'error') return null;

  if (status === 'loading' || status === 'analyzing') {
    return (
      <>
        <Divider label="Familiar Segments" labelPosition="center" />
        <Group gap="xs" justify="center" py="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {status === 'analyzing'
              ? 'Matching this ride against your segment library…'
              : 'Loading segment history…'}
          </Text>
        </Group>
      </>
    );
  }

  if (comparisons.length === 0) return null;

  return (
    <>
      <Divider label="Familiar Segments" labelPosition="center" />
      <Stack gap="sm">
        {summary?.headline && (
          <Text size="sm" c="dimmed">{summary.headline}</Text>
        )}
        {comparisons.map((c) => (
          <SegmentCard key={c.segment.id} comparison={c} formatSpeed={formatSpeed} />
        ))}
      </Stack>
    </>
  );
}
