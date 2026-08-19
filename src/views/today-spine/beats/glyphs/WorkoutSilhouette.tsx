/**
 * WorkoutSilhouette — the shape of the session being endorsed.
 *
 * v1 draws one block: width from the session's duration, height from its
 * intensity. That is less than the design calls for — real interval bars need
 * workout structure, which the planned-workouts read does not carry (spec §7)
 * — but both dimensions are real data, so the glyph still says something true
 * and different for every session rather than decorating the card.
 *
 * It redraws when Beat 2 changes the session. That redraw is the whole point
 * of the felt-response tap, so nothing here may be async.
 */

import { Box } from '@mantine/core';
import { C } from '../../tokens';
import type { SessionShape } from '../types';

/** Duration that fills the full width. Longer sessions clamp rather than shrink the rest. */
const FULL_WIDTH_MIN = 180;
const HEIGHT = 52;

export function WorkoutSilhouette({ session }: { session: SessionShape | null }) {
  if (!session) return null;

  const widthPct = Math.max(12, Math.min(100, (session.durationMin / FULL_WIDTH_MIN) * 100));
  const barHeight = Math.max(6, Math.round(session.intensity * (HEIGHT - 8)));
  const color = session.intensity >= 0.6 ? C.orange : C.teal;

  return (
    <Box
      data-testid="workout-silhouette"
      role="img"
      aria-label={`Shape of today's session: ${session.durationMin} minutes`}
      style={{
        height: HEIGHT,
        width: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <Box style={{ width: `${widthPct}%`, height: barHeight, backgroundColor: color }} />
    </Box>
  );
}
