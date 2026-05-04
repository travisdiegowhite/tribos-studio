import { Box } from '@mantine/core';
import { MetricMarker } from './MetricMarker';
import type { PlanPhaseSegment } from '../useTodayData';

interface PhaseStripProps {
  phases: PlanPhaseSegment[];
  /** Current week within the plan (1-indexed). */
  currentWeek: number;
  /** Total weeks across the plan (sum of phase lengths). */
  totalWeeks: number;
  /** When true, render the empty striped pattern with no marker. */
  empty?: boolean;
  height?: number;
}

const STRIPE_PATTERN =
  'repeating-linear-gradient(90deg, #EBEBE8 0, #EBEBE8 4px, #DDDDD8 4px, #DDDDD8 8px)';

export function PhaseStrip({
  phases,
  currentWeek,
  totalWeeks,
  empty = false,
  height = 8,
}: PhaseStripProps) {
  if (empty || !phases.length || totalWeeks <= 0) {
    return (
      <Box
        style={{
          position: 'relative',
          width: '100%',
          height,
          background: STRIPE_PATTERN,
        }}
      />
    );
  }

  // Marker centers on the current week. Week 1 should land mid-first-segment.
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
      <MetricMarker pct={markerPos} trackHeight={height} />
    </Box>
  );
}
