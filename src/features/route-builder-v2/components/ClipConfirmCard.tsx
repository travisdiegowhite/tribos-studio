/**
 * ClipConfirmCard — confirm/cancel card for the manual "clip tangent" tool.
 *
 * Shown when the rider clicks a spur in clip mode. Reports how much distance
 * removing the spur would save and offers Confirm / Cancel. Distance is
 * formatted in the rider's units.
 */
import { Box, Button, Group, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import type { ClipRemovalStats } from '../clip/detectClipSelection';

export interface ClipConfirmCardProps {
  stats: ClipRemovalStats | null;
  isImperial: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Metres → "X.X mi" / "X.X km" matching StatsOverlay's rounding. */
function formatMeters(m: number, isImperial: boolean): string {
  const km = m / 1000;
  return isImperial ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`;
}

export function ClipConfirmCard({ stats, isImperial, busy, onConfirm, onCancel }: ClipConfirmCardProps) {
  if (!stats) return null;
  const saved = formatMeters(stats.distanceSaved, isImperial);
  const spur = formatMeters(stats.segmentLength, isImperial);
  const pct =
    typeof stats.percentOfRoute === 'number'
      ? stats.percentOfRoute.toFixed(0)
      : stats.percentOfRoute;

  return (
    <Box
      data-testid="rb2-clip-confirm-card"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        boxShadow: RB2.shadowOverlay,
        padding: '10px 12px',
        maxWidth: 320,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: RB2.textPrimary,
        }}
      >
        Remove ~{spur} spur?
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 11,
          color: RB2.textSecondary,
          marginTop: 2,
        }}
      >
        saves {saved}
        {pct ? ` · ${pct}% of route` : ''}
      </Text>
      <Group gap={8} mt={8} justify="flex-end">
        <Button
          data-testid="rb2-clip-cancel"
          variant="subtle"
          color="gray"
          size="xs"
          radius={0}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          data-testid="rb2-clip-confirm"
          size="xs"
          radius={0}
          onClick={onConfirm}
          loading={busy}
          styles={{ root: { backgroundColor: RB2.coral } }}
        >
          Remove &amp; reroute
        </Button>
      </Group>
    </Box>
  );
}

export default ClipConfirmCard;
