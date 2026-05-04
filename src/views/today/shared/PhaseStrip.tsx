import { Box } from '@mantine/core';
import type { PlanPhaseSegment } from '../useTodayData';

interface PhaseStripProps {
  phases: PlanPhaseSegment[];
  /** Current week within the plan (1-indexed). */
  currentWeek: number;
  /** Total weeks across the plan (sum of phase lengths). */
  totalWeeks: number;
  height?: number;
}

const MARKER_COLOR = '#141410';

export function PhaseStrip({
  phases,
  currentWeek,
  totalWeeks,
  height = 10,
}: PhaseStripProps) {
  // Empty plan: render a flat gray track.
  if (!phases.length || totalWeeks <= 0) {
    return (
      <Box
        style={{
          width: '100%',
          height,
          backgroundColor: '#EBEBE8',
        }}
      />
    );
  }

  const markerPos = Math.min(1, Math.max(0, (currentWeek - 0.5) / totalWeeks));

  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        height,
        display: 'flex',
      }}
    >
      {phases.map((p, idx) => (
        <Box
          key={`${p.name}-${idx}`}
          style={{
            flexGrow: p.weeks,
            backgroundColor: p.color,
            opacity: 0.85,
          }}
        />
      ))}
      <Box
        style={{
          position: 'absolute',
          top: -2,
          bottom: -2,
          left: `calc(${markerPos * 100}% - 1.5px)`,
          width: 3,
          backgroundColor: MARKER_COLOR,
        }}
      />
    </Box>
  );
}
