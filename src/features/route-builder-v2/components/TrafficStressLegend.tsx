/**
 * TrafficStressLegend — Route Builder 2.0 traffic-stress color key.
 *
 * Maps the TrafficStressLayer's LTS bands to their colors, with the km on
 * each band when the layer has reported a summary. Sourced from the single
 * LTS_COLORS / LTS_LABELS tables in trafficStress.ts so the legend and the
 * rendered line never drift. Shown only while the stress layer is active.
 */

import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { LTS_COLORS, LTS_LABELS, type Lts, type StressSummary } from '../../../utils/trafficStress';
import { convertDistance } from '../../../utils/units.jsx';

export interface TrafficStressLegendProps {
  summary?: StressSummary | null;
  isImperial?: boolean;
  isMobile?: boolean;
}

const BANDS: Lts[] = [1, 2, 3, 4];

function formatKm(km: number, isImperial: boolean): string {
  const value = isImperial ? (convertDistance.kmToMiles(km) as number) : km;
  const unit = isImperial ? 'mi' : 'km';
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

export function TrafficStressLegend({
  summary = null,
  isImperial = false,
  isMobile = false,
}: TrafficStressLegendProps) {
  return (
    <Box
      data-testid="rb2-stress-legend"
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
        Traffic stress
      </Text>
      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {BANDS.map((lts) => (
          <Box key={lts} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Box style={{ width: 12, height: 12, backgroundColor: LTS_COLORS[lts], flexShrink: 0 }} />
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: RB2.textSecondary,
                whiteSpace: 'nowrap',
              }}
            >
              {LTS_LABELS[lts]}
              {summary ? ` · ${formatKm(summary.kmByLts[lts], isImperial)}` : ''}
            </Text>
          </Box>
        ))}
      </Box>
      {summary && summary.unknownPct > 0 && (
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            color: RB2.textTertiary,
            marginTop: 6,
          }}
        >
          {summary.unknownPct}% unmapped
        </Text>
      )}
    </Box>
  );
}

export default TrafficStressLegend;
