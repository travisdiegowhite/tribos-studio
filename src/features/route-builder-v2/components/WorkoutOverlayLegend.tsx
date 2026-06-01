/**
 * WorkoutOverlayLegend — compact key for the interval overlay.
 *
 * Shows the attached workout's name and a swatch per distinct training zone
 * present in the route's interval cues, so the colored bands (elevation) and
 * colored line (map) are readable. Hidden when no workout is attached.
 */

import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { ZONE_NAMES } from '../../../components/ui/zoneColors';
import { cueColor, type WorkoutCue } from '../overlay/intervalOverlay';

export interface WorkoutOverlayLegendProps {
  workoutName: string | null;
  cues: WorkoutCue[] | null;
  isMobile?: boolean;
}

export function WorkoutOverlayLegend({ workoutName, cues, isMobile = false }: WorkoutOverlayLegendProps) {
  if (!workoutName) return null;

  // Distinct zones present, in ascending order.
  const zones = Array.from(
    new Set((cues ?? []).map((c) => c.zone).filter((z): z is number => z != null)),
  ).sort((a, b) => a - b);

  return (
    <Box
      data-testid="rb2-workout-legend"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '8px 12px',
        boxShadow: RB2.shadowCard,
        width: isMobile ? '100%' : undefined,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: zones.length ? 6 : 0,
        }}
      >
        Workout · {workoutName}
      </Text>
      {zones.length > 0 && (
        <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {zones.map((z) => (
            <Box key={z} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Box
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: cueColor(z),
                  border: `1px solid ${RB2.border}`,
                }}
              />
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textSecondary }}>
                Z{z} {ZONE_NAMES[z as keyof typeof ZONE_NAMES] ?? ''}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default WorkoutOverlayLegend;
