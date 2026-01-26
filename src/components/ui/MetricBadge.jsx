import { Badge, Group, Text, Box } from '@mantine/core';
import { tokens } from '../../theme';

/**
 * MetricBadge - Tier 2/3 metric display component
 *
 * Visual Hierarchy: Muted styling for displaying metrics without
 * competing with Tier 1 elements like status badges.
 *
 * Use cases:
 * - Distance, elevation, time in route cards
 * - TSS, power values in activity rows
 * - Any numeric metric that's informational
 *
 * @param {ReactNode} icon - Optional icon to display
 * @param {string} value - The metric value to display
 * @param {string} label - Optional label for the metric
 * @param {string} size - Badge size (xs, sm, md)
 * @param {boolean} highlighted - If true, uses Tier 1 styling (use sparingly)
 */
function MetricBadge({
  icon,
  value,
  label,
  size = 'sm',
  highlighted = false,
}) {
  const color = highlighted ? 'var(--tribos-lime)' : 'var(--tribos-text-muted)';
  const bgColor = highlighted ? `${'var(--tribos-lime)'}15` : `${'var(--tribos-text-muted)'}10`;

  return (
    <Box
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: bgColor,
        padding: size === 'xs' ? '2px 8px' : '4px 10px',
        borderRadius: tokens.radius.full,
      }}
    >
      {icon && (
        <Box style={{ color, display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
      )}
      <Text
        size={size}
        fw={600}
        style={{ color }}
      >
        {value}
      </Text>
      {label && (
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      )}
    </Box>
  );
}

/**
 * MetricText - Even simpler metric display for tables and lists
 *
 * Visual Hierarchy: Tier 3 - plain text with optional unit
 */
export function MetricText({ value, unit, size = 'sm' }) {
  return (
    <Text size={size} c="dimmed">
      <Text span fw={500}>{value}</Text>
      {unit && <Text span size="xs"> {unit}</Text>}
    </Text>
  );
}

/**
 * MetricGroup - Group of related metrics in a row
 */
export function MetricGroup({ children, gap = 'xs' }) {
  return (
    <Group gap={gap} wrap="wrap">
      {children}
    </Group>
  );
}

export default MetricBadge;
