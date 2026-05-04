import { Box } from '@mantine/core';
import type { FitnessTrend } from '../../../utils/todayVocabulary';

interface TrendVisualProps {
  direction: FitnessTrend;
}

const ARROW_SIZE = 14;

function ArrowIcon({ direction }: { direction: FitnessTrend }) {
  const transform =
    direction === 'up' ? 'rotate(-45deg)' : direction === 'down' ? 'rotate(45deg)' : 'rotate(0deg)';
  // Simple SVG arrow head + line. Color is teal for up/flat, orange for down.
  const color = direction === 'down' ? '#D4600A' : '#2A8C82';
  return (
    <svg
      width={ARROW_SIZE}
      height={ARROW_SIZE}
      viewBox="0 0 14 14"
      style={{ transform, transition: 'transform 200ms ease' }}
      aria-hidden="true"
    >
      <path
        d="M2 7H12M12 7L8 3M12 7L8 11"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function TrendVisual({ direction }: TrendVisualProps) {
  return (
    <Box style={{ display: 'flex', alignItems: 'center', gap: 8, height: 16 }}>
      <ArrowIcon direction={direction} />
      <Box
        style={{
          flex: 1,
          height: 2,
          background: 'linear-gradient(to right, #B4B2A9 0%, #2A8C82 100%)',
        }}
      />
    </Box>
  );
}
