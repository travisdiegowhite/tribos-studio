import { Box, Text } from '@mantine/core';

export interface FitnessSparklinePoint {
  date: string;
  tfi: number;
}

interface FitnessSparklineProps {
  /** 28 points (or close to it), ordered by date ascending, forward-filled. */
  history: FitnessSparklinePoint[];
  /**
   * When true, draw a dashed baseline + "BUILDING HISTORY" label instead of
   * a populated path. Used when fewer than 14 days of data exist.
   */
  empty?: boolean;
  height?: number;
}

const STROKE = '#2A8C82';
const FILL = '#2A8C82';
const BASELINE = '#EBEBE8';
const PADDING_FRAC = 0.1; // 10% top/bottom padding per spec

/**
 * 28-day TFI sparkline for the FITNESS cell. Y-scale fits the local range
 * (not a global comparison) so the shape communicates direction +
 * magnitude. The rightmost point is highlighted with a small dot.
 */
export function FitnessSparkline({
  history,
  empty = false,
  height = 32,
}: FitnessSparklineProps) {
  if (empty || history.length < 2) {
    return (
      <Box
        style={{
          position: 'relative',
          width: '100%',
          height,
        }}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1={0}
            x2={100}
            y1={height - 4}
            y2={height - 4}
            stroke={BASELINE}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        </svg>
        <Text
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: '#7A7970',
          }}
        >
          BUILDING HISTORY
        </Text>
      </Box>
    );
  }

  const values = history.map((p) => p.tfi);
  const localMin = Math.min(...values);
  const localMax = Math.max(...values);
  const span = localMax - localMin;
  const pad = span > 0 ? span * PADDING_FRAC : 1;
  const yMin = localMin - pad;
  const yMax = localMax + pad;
  const yRange = yMax - yMin;

  // viewBox is normalized 0–100 horizontally, 0–height vertically.
  const stepX = 100 / (history.length - 1);

  const yFor = (tfi: number): number => {
    const norm = (tfi - yMin) / yRange;
    // Flip — SVG y grows downward, but visually higher TFI = higher pixel.
    return height - norm * height;
  };

  const points = history.map((p, idx) => ({
    x: idx * stepX,
    y: yFor(p.tfi),
  }));

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
    .join(' ');

  const areaPath =
    `${linePath} ` +
    `L ${points[points.length - 1].x} ${height} ` +
    `L ${points[0].x} ${height} Z`;

  const tail = points[points.length - 1];

  return (
    <Box style={{ position: 'relative', width: '100%', height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Baseline reference */}
        <line
          x1={0}
          x2={100}
          y1={height - 1}
          y2={height - 1}
          stroke={BASELINE}
          strokeWidth={1}
        />
        {/* Area fill */}
        <path d={areaPath} fill={FILL} opacity={0.08} stroke="none" />
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={STROKE}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Tail dot — separate SVG so the marker keeps a fixed pixel size
          even though the path is non-uniformly stretched. */}
      <svg
        width="100%"
        height={height}
        style={{ position: 'absolute', top: 0, left: 0 }}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <circle cx={tail.x} cy={tail.y} r={2.5} fill={STROKE} vectorEffect="non-scaling-stroke" />
      </svg>
    </Box>
  );
}
