/**
 * SurfaceSummaryBar — Route Builder 2.0 surface distribution bar.
 *
 * Komoot-style proportion bar showing the paved/gravel/unpaved/etc. split
 * for the current route. Fed by the page's `useRouteSurface` result (or, for
 * older callers, bare per-segment categories), so it never fetches. Hidden
 * until data arrives.
 *
 * Provenance ("why is this gravel?"): with a full result the bar adds a
 * `tagged · inferred · unmapped` line, and each legend swatch's tooltip
 * lists the tags that decided that category with their distance.
 */

import { Box, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import {
  SURFACE_COLORS,
  SURFACE_LABELS,
  computeSurfaceDistribution,
} from '../../../utils/surfaceOverlay.js';
import type { RouteSurfaceResult } from '../../../utils/roadAttributes';

export type SurfaceStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface SurfaceSummaryBarProps {
  /** Per-segment surface categories, or null. Ignored when `result` is given. */
  segments?: string[] | null;
  /** Full analysis from useRouteSurface; enables the provenance line and tooltips. */
  result?: RouteSurfaceResult | null;
  /** Hook status; `unavailable` shows a "surface data unavailable" card. */
  status?: SurfaceStatus;
  /**
   * The geometry those segments span (length = segments + 1). When given,
   * shares are weighted by segment length rather than segment count.
   */
  coordinates?: ReadonlyArray<ReadonlyArray<number>> | null;
  isMobile?: boolean;
}

const SURFACE_ORDER = ['paved', 'gravel', 'unpaved', 'mixed'] as const;

const cardStyle = (isMobile: boolean) => ({
  backgroundColor: RB2.cardBg,
  border: `1px solid ${RB2.border}`,
  borderRadius: 0,
  padding: '10px 12px',
  boxShadow: RB2.shadowCard,
  width: isMobile ? '100%' : 320,
});

const eyebrowStyle = {
  fontFamily: RB2_FONT.mono,
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: RB2.textTertiary,
  marginBottom: 6,
};

/** `surface=gravel 8.1 km · tracktype=grade3 2.4 km` for one category. */
function evidenceTitle(result: RouteSurfaceResult | null | undefined, key: string): string | undefined {
  const bucket = result?.summary.evidenceKm[key as keyof RouteSurfaceResult['summary']['evidenceKm']];
  if (!bucket) return undefined;
  const parts = Object.entries(bucket)
    .sort((a, b) => b[1] - a[1])
    .map(([detail, km]) => `${detail} ${km.toFixed(1)} km`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function SurfaceSummaryBar({
  segments = null,
  result,
  status = 'idle',
  coordinates = null,
  isMobile = false,
}: SurfaceSummaryBarProps) {
  if (status === 'unavailable' && !result) {
    return (
      <Box data-testid="rb2-surface-summary" style={cardStyle(isMobile)}>
        <Text style={eyebrowStyle}>Surface</Text>
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.04em',
            color: RB2.textSecondary,
          }}
        >
          surface data unavailable
        </Text>
      </Box>
    );
  }

  const segs = result ? result.segments : segments;
  if (!segs || segs.length === 0) return null;

  const dist = result
    ? result.summary.distribution
    : (computeSurfaceDistribution(
        segs,
        coordinates as Array<[number, number]> | null,
      ) as Record<string, number>);
  const known = SURFACE_ORDER.filter((k) => (dist[k] ?? 0) > 0).map((k) => ({
    key: k,
    pct: dist[k],
    color: (SURFACE_COLORS as Record<string, string>)[k],
    label: (SURFACE_LABELS as Record<string, string>)[k],
    title: evidenceTitle(result, k),
  }));

  // computeSurfaceDistribution drops 'unknown'; show the remainder as an
  // "unmapped" sliver so the bar reads as a true 100% and users understand
  // coverage isn't total.
  const knownTotal = known.reduce((sum, s) => sum + s.pct, 0);
  const unmappedPct = Math.max(0, 100 - knownTotal);

  if (known.length === 0) return null;

  const provenance = result
    ? [
        `tagged ${result.summary.taggedPct}%`,
        `inferred ${result.summary.inferredPct}%`,
        `unmapped ${result.summary.unknownPct}%`,
      ].join(' · ')
    : null;

  return (
    <Box data-testid="rb2-surface-summary" style={cardStyle(isMobile)}>
      <Text style={eyebrowStyle}>Surface</Text>

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
          <Box
            key={s.key}
            title={s.title}
            data-testid={`rb2-surface-legend-${s.key}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
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

      {provenance && (
        <Text
          data-testid="rb2-surface-provenance"
          title="Tagged: OSM says so (surface=*). Inferred: deduced from tracktype or road class, drawn dashed on the map. Unmapped: no verdict."
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.04em',
            color: RB2.textTertiary,
            marginTop: 6,
          }}
        >
          {provenance}
        </Text>
      )}
    </Box>
  );
}

export default SurfaceSummaryBar;
