/**
 * EditReviewCard — Keep/Revert decision card after a chat edit applies.
 *
 * The edit is already on the map (chat stays fast); the previous route
 * stays visible as a dashed ghost line until the rider decides. Keep
 * dismisses the card (the checkpoint stays available for a later
 * "go back"); Revert restores the previous route. Doubles as the surface
 * for partially-applied compound edits.
 */
import { Box, Button, Group, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { formatDistance, formatElevation } from '../../../utils/units';

export interface EditReviewStats {
  distance_km: number;
  elevation_gain_m: number;
}

export interface EditReviewCardProps {
  previous: EditReviewStats;
  next: EditReviewStats;
  /** Some of a compound edit's changes failed (the rest were applied). */
  partial: boolean;
  isImperial: boolean;
  busy: boolean;
  onKeep: () => void;
  onRevert: () => void;
}

/** Signed delta chip text, e.g. "+4.2 km" / "-350 ft". */
function deltaText(
  prev: number,
  next: number,
  format: (v: number, imperial: boolean) => string,
  isImperial: boolean,
): string | null {
  const delta = next - prev;
  if (Math.abs(delta) < 0.05) return null;
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${format(Math.abs(delta), isImperial)}`;
}

export function EditReviewCard({
  previous,
  next,
  partial,
  isImperial,
  busy,
  onKeep,
  onRevert,
}: EditReviewCardProps) {
  const distDelta = deltaText(previous.distance_km, next.distance_km, formatDistance, isImperial);
  const elevDelta = deltaText(
    previous.elevation_gain_m,
    next.elevation_gain_m,
    formatElevation,
    isImperial,
  );

  return (
    <Box
      data-testid="rb2-edit-review-card"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        boxShadow: RB2.shadowOverlay,
        padding: '10px 12px',
        maxWidth: 320,
      }}
    >
      {partial && (
        <Text
          data-testid="rb2-edit-review-partial"
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: RB2.coral,
            marginBottom: 2,
          }}
        >
          Partial — some changes failed
        </Text>
      )}
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: RB2.textPrimary,
        }}
      >
        Route updated
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 11,
          color: RB2.textSecondary,
          marginTop: 2,
        }}
      >
        {formatDistance(previous.distance_km, isImperial)} →{' '}
        {formatDistance(next.distance_km, isImperial)}
        {distDelta ? ` (${distDelta})` : ''}
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 11,
          color: RB2.textSecondary,
        }}
      >
        {formatElevation(previous.elevation_gain_m, isImperial)} →{' '}
        {formatElevation(next.elevation_gain_m, isImperial)} climbing
        {elevDelta ? ` (${elevDelta})` : ''}
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.body,
          fontSize: 10,
          fontStyle: 'italic',
          color: RB2.textTertiary,
          marginTop: 4,
        }}
      >
        dashed line = previous route
      </Text>
      <Group gap={8} mt={8} justify="flex-end">
        <Button
          data-testid="rb2-edit-revert"
          variant="subtle"
          color="gray"
          size="xs"
          radius={0}
          onClick={onRevert}
          disabled={busy}
          styles={{ label: { color: RB2.coral } }}
        >
          Revert
        </Button>
        <Button
          data-testid="rb2-edit-keep"
          size="xs"
          radius={0}
          onClick={onKeep}
          disabled={busy}
          styles={{ root: { backgroundColor: RB2.teal } }}
        >
          Keep
        </Button>
      </Group>
    </Box>
  );
}

export default EditReviewCard;
