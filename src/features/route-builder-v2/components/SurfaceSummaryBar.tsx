/**
 * SurfaceSummaryBar — Route Builder 2.0 surface distribution bar.
 *
 * Komoot-style proportion bar showing the paved/gravel/unpaved/etc. split
 * for the current route. Fed by the per-segment surface categories the
 * SurfaceLayer already fetched (passed up via its onSegments callback), so
 * this never triggers a second Overpass request. Hidden until segments
 * arrive.
 */

import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import {
  SURFACE_COLORS,
  SURFACE_LABELS,
  computeSurfaceDistribution,
} from '../../../utils/surfaceOverlay.js';

export interface SurfaceSummaryBarProps {
  /** Per-segment surface categories from fetchRouteSurfaceData, or null. */
  segments: string[] | null;
  isMobile?: boolean;
}

const SURFACE_ORDER = ['paved', 'gravel', 'unpaved', 'mixed'] as const;

export function SurfaceSummaryBar({ segments, isMobile = false }: SurfaceSummaryBarProps) {
  if (!segments || segments.length === 0) return null;

  const dist = computeSurfaceDistribution(segments) as Record<string, number>;
  const known = SURFACE_ORDER.filter((k) => (dist[k] ?? 0) > 0).map((k) => ({
    key: k,
    pct: dist[k],
    color: (SURFACE_COLORS as Record<string, string>)[k],
    label: (SURFACE_LABELS as Record<string, string>)[k],
  }));

  // computeSurfaceDistribution drops 'unknown'; show the remainder as an
  // "unmapped" sliver so the bar reads as a true 100% and users understand
  // coverage isn't total.
  const knownTotal = known.reduce((sum, s) => sum + s.pct, 0);
  const unmappedPct = Math.max(0, 100 - knownTotal);

  if (known.length === 0) return null;

  return (
    <Box
      data-testid="rb2-surface-summary"
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
        Surface
      </Text>

      <Box
        style={{
          display: 'flex',
          width: '100%',
          height: 10,
          overflow: 'hidden',
          marginBottom: 8,
          border: `1px solid ${RB2.border}`,
        }}
      >
        {known.map((s) => (
          <Box
            key={s.key}
            style={{ width: `${s.pct}%`, backgroundColor: s.color, height: '100%' }}
            title={`${s.label} ${s.pct}%`}
          />
        ))}
        {unmappedPct > 0 && (
          <Box
            style={{
              width: `${unmappedPct}%`,
              backgroundColor: SURFACE_COLORS.unknown as string,
              height: '100%',
            }}
            title={`Unmapped ${unmappedPct}%`}
          />
        )}
      </Box>

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {known.map((s) => (
          <Box key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Box style={{ width: 10, height: 10, backgroundColor: s.color, flexShrink: 0 }} />
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: RB2.textSecondary,
                whiteSpace: 'nowrap',
              }}
            >
              {s.pct}% {s.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default SurfaceSummaryBar;
