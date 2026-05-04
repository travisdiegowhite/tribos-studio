import { Box } from '@mantine/core';

export interface BarZone {
  /** Fraction of the bar (0–1) this zone occupies. Zones must sum to 1. */
  fraction: number;
  color: string;
}

interface MetricBarProps {
  zones: BarZone[];
  /**
   * Marker position as a 0–1 fraction of the bar's width. Set null to render
   * the empty bar without a marker (e.g. when data is missing).
   */
  markerPos: number | null;
  height?: number;
}

const MARKER_COLOR = '#141410';

export function MetricBar({ zones, markerPos, height = 10 }: MetricBarProps) {
  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        height,
        display: 'flex',
        backgroundColor: '#EBEBE8',
      }}
    >
      {zones.map((z, idx) => (
        <Box
          key={idx}
          style={{
            flexGrow: z.fraction,
            backgroundColor: z.color,
            opacity: 0.85,
          }}
        />
      ))}
      {markerPos !== null && (
        <Box
          style={{
            position: 'absolute',
            top: -2,
            bottom: -2,
            left: `calc(${Math.min(100, Math.max(0, markerPos * 100))}% - 1.5px)`,
            width: 3,
            backgroundColor: MARKER_COLOR,
          }}
        />
      )}
    </Box>
  );
}
