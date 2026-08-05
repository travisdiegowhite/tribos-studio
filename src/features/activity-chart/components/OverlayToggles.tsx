/**
 * Overlay toggles (Elevation / W'Balance / Speed) — independent on/off
 * chips, right-aligned in the chart header like the reference design.
 */

import { Chip, Group } from '@mantine/core';

export type OverlayKey = 'elevation' | 'wbal' | 'speed';

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  elevation: 'Elevation',
  wbal: "W'Balance",
  speed: 'Speed',
};

const OVERLAY_CHIP_COLORS: Record<OverlayKey, string> = {
  elevation: 'gray',
  wbal: 'grape',
  speed: 'orange',
};

interface OverlayTogglesProps {
  available: OverlayKey[];
  active: Set<OverlayKey>;
  onToggle: (key: OverlayKey) => void;
}

export function OverlayToggles({ available, active, onToggle }: OverlayTogglesProps) {
  if (available.length === 0) return null;
  return (
    <Group gap={6} wrap="wrap">
      {available.map((key) => (
        <Chip
          key={key}
          checked={active.has(key)}
          onChange={() => onToggle(key)}
          size="xs"
          variant="outline"
          color={OVERLAY_CHIP_COLORS[key]}
          styles={{ label: { cursor: 'pointer' } }}
        >
          {OVERLAY_LABELS[key]}
        </Chip>
      ))}
    </Group>
  );
}
