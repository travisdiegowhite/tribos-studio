/** The zones a session actually uses, in its sport's own names. */
import { Box, Group, Text } from '@mantine/core';
import { zoneColor, zonesFor } from '../../../lib/training/session/zones';
import type { SessionStep } from '../../../lib/training/session/steps';

export function ZoneLegend({ steps, sport }: { steps: SessionStep[]; sport: string | null }) {
  const zones = zonesFor(sport);
  const used = [...new Set(steps.map((s) => s.zone).filter((z): z is NonNullable<typeof z> => z != null))].sort((a, b) => a - b);
  if (used.length === 0) return null;
  return (
    <Group gap="sm" justify="center" data-testid="zone-legend">
      {used.map((z) => (
        <Group key={z} gap={4} wrap="nowrap">
          <Box style={{ width: 10, height: 10, background: zoneColor(z) }} />
          <Text size="xs" c="dimmed">
            {zones[z]?.short} {zones[z]?.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export default ZoneLegend;
