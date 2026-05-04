import { Box } from '@mantine/core';

interface MetricMarkerProps {
  /** Position along the bar as a 0–1 fraction. Clamped on render. */
  pct: number;
  /** Height of the bar track this marker sits on. Defaults to 8px (the
   *  standard zone-bar height). The tick body extends ±4px outside it. */
  trackHeight?: number;
}

const MARKER_COLOR = '#141410';
const TICK_WIDTH = 3;
const TICK_HEIGHT = 16;
const CAP_WIDTH = 8;
const CAP_HEIGHT = 4;

/**
 * Shared marker for every zone bar in the Today view's metric cells.
 *
 * Renders a 3px × 16px black tick body, vertically centered on the 8px bar
 * track (so it extends 4px above and 4px below), with an 8px × 4px cap
 * sitting directly above the tick. The cap makes the marker read as a
 * deliberate indicator rather than a stripe.
 *
 * Position is set via `left: calc(${pct}% - 1.5px)` so the 3px tick centers
 * on the value's percentage point, not left-aligns to it.
 *
 * The parent must be `position: relative`. The marker positions itself
 * absolutely.
 */
export function MetricMarker({ pct, trackHeight = 8 }: MetricMarkerProps) {
  const clamped = Math.min(1, Math.max(0, pct));
  const overhang = (TICK_HEIGHT - trackHeight) / 2;

  return (
    <Box
      style={{
        position: 'absolute',
        top: -overhang,
        left: `calc(${clamped * 100}% - ${TICK_WIDTH / 2}px)`,
        width: TICK_WIDTH,
        height: TICK_HEIGHT,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      {/* Cap */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: -(CAP_WIDTH - TICK_WIDTH) / 2,
          width: CAP_WIDTH,
          height: CAP_HEIGHT,
          backgroundColor: MARKER_COLOR,
        }}
      />
      {/* Tick body */}
      <Box
        style={{
          position: 'absolute',
          top: CAP_HEIGHT,
          left: 0,
          width: TICK_WIDTH,
          height: TICK_HEIGHT - CAP_HEIGHT,
          backgroundColor: MARKER_COLOR,
        }}
      />
    </Box>
  );
}
