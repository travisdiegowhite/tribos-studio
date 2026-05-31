/**
 * GradientLegend — Route Builder 2.0 grade color key.
 *
 * Static legend mapping the GradientLayer's grade bands to their colors.
 * Sourced from the single GRADE_COLORS table in routeGradient.js so the
 * legend and the rendered line never drift. Shown only while the gradient
 * layer is active.
 */

import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { GRADE_COLORS } from '../../../utils/routeGradient.js';

interface GradeBand {
  color: string;
  label: string;
}

export interface GradientLegendProps {
  isMobile?: boolean;
}

export function GradientLegend({ isMobile = false }: GradientLegendProps) {
  const bands = GRADE_COLORS as GradeBand[];
  return (
    <Box
      data-testid="rb2-gradient-legend"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '10px 12px',
        boxShadow: RB2.shadowCard,
        width: isMobile ? '100%' : 320,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 6,
        }}
      >
        Grade
      </Text>
      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {bands.map((band) => (
          <Box key={band.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Box
              style={{
                width: 12,
                height: 12,
                backgroundColor: band.color,
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: RB2.textSecondary,
                whiteSpace: 'nowrap',
              }}
            >
              {band.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default GradientLegend;
