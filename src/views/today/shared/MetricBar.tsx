import { Box } from '@mantine/core';
import { MetricMarker } from './MetricMarker';

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

export function MetricBar({ zones, markerPos, height = 8 }: MetricBarProps) {
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
      {markerPos !== null && <MetricMarker pct={markerPos} trackHeight={height} />}
    </Box>
  );
}
