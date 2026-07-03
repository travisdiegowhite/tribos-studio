/**
 * StatsOverlay — Route Builder 2.0 route summary card.
 *
 * Shows distance, elevation gain, and estimated duration for the
 * current route. Hidden when no route exists.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { Check, FloppyDisk, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { convertDistance } from '../../../utils/units.jsx';
import {
  SURFACE_COLORS,
  SURFACE_LABELS,
  computeSurfaceDistribution,
} from '../../../utils/surfaceOverlay.js';

export interface RouteStats {
  distance_km: number;
  elevation_gain_m: number;
  duration_s: number;
}

export interface StatsOverlayProps {
  stats: RouteStats | null;
  routeName?: string;
  onClear?: () => void;
  isImperial?: boolean;
  /** Per-segment surface categories (from SurfaceLayer); shows a surface line when present. */
  surfaceSegments?: string[] | null;
  /** Quick-save action; renders a Save affordance next to Clear when set. */
  onSave?: () => void;
  saveState?: 'saved' | 'unsaved' | 'saving';
}

const SURFACE_ORDER = ['paved', 'gravel', 'unpaved', 'mixed'] as const;

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Compact distance: <10 → one decimal, else integer. Converts to miles when
// imperial, preserving the same glued "<n><unit>" style (e.g. "52km" / "33mi").
function formatDistanceCompact(km: number, isImperial: boolean): string {
  const value = isImperial ? convertDistance.kmToMiles(km) : km;
  const unit = isImperial ? 'mi' : 'km';
  if (!value || value <= 0) return `0${unit}`;
  const num = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${num}${unit}`;
}

function formatElevationCompact(m: number, isImperial: boolean): string {
  // Guard against a non-finite gain (e.g. an in-flight/failed elevation fetch
  // that left the stat undefined) so we never render "NaNft".
  const safeM = Number.isFinite(m) ? m : 0;
  const value = isImperial ? convertDistance.mToFt(safeM) : safeM;
  return `${Math.round(value)}${isImperial ? 'ft' : 'm'}`;
}

function surfaceBreakdown(segments: string[] | null | undefined) {
  if (!segments || segments.length === 0) return [];
  const dist = computeSurfaceDistribution(segments) as Record<string, number>;
  return SURFACE_ORDER.filter((k) => (dist[k] ?? 0) > 0).map((k) => ({
    key: k,
    pct: dist[k],
    color: (SURFACE_COLORS as Record<string, string>)[k],
    label: (SURFACE_LABELS as Record<string, string>)[k],
  }));
}

export function StatsOverlay({
  stats,
  routeName,
  onClear,
  isImperial = false,
  surfaceSegments,
  onSave,
  saveState = 'unsaved',
}: StatsOverlayProps) {
  if (!stats || stats.distance_km <= 0) return null;

  const surfaces = surfaceBreakdown(surfaceSegments);

  return (
    <Box
      data-testid="rb2-stats-overlay"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '12px 14px',
        boxShadow: RB2.shadowCard,
        minWidth: 260,
      }}
    >
      <Box
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: routeName ? 6 : 0,
        }}
      >
        {routeName ? (
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: RB2.textTertiary,
              lineHeight: 1.4,
            }}
          >
            {routeName}
          </Text>
        ) : (
          <span />
        )}
        <Box style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onSave && (
            <UnstyledButton
              data-testid="rb2-stats-save"
              onClick={saveState === 'saving' ? undefined : onSave}
              aria-label={saveState === 'saved' ? 'Route saved' : 'Save route'}
              disabled={saveState === 'saving'}
              style={{
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: saveState === 'unsaved' ? RB2.teal : RB2.textTertiary,
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: saveState === 'saving' ? 'default' : 'pointer',
              }}
            >
              {saveState === 'saving' ? (
                'Saving…'
              ) : saveState === 'saved' ? (
                <>
                  Saved <Check size={12} />
                </>
              ) : (
                <>
                  <span aria-hidden style={{ fontSize: 8, lineHeight: 1 }}>
                    ●
                  </span>{' '}
                  Save <FloppyDisk size={12} />
                </>
              )}
            </UnstyledButton>
          )}
          {onClear && (
            <UnstyledButton
              data-testid="rb2-stats-clear"
              onClick={onClear}
              aria-label="Clear route"
              style={{
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: RB2.textTertiary,
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Clear <X size={12} />
            </UnstyledButton>
          )}
        </Box>
      </Box>
      <Box style={{ display: 'flex', gap: 18 }}>
        <StatCell label="Distance" value={formatDistanceCompact(stats.distance_km, isImperial)} />
        <StatCell label="Elevation" value={formatElevationCompact(stats.elevation_gain_m, isImperial)} />
        <StatCell label="Duration" value={formatDuration(stats.duration_s)} />
      </Box>
      {surfaces.length > 0 && (
        <Box
          data-testid="rb2-stats-surface"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 8 }}
        >
          {surfaces.map((s) => (
            <Box key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Box style={{ width: 8, height: 8, backgroundColor: s.color, flexShrink: 0 }} />
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
      )}
    </Box>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          lineHeight: 1.2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 22,
          fontWeight: 700,
          color: RB2.textPrimary,
          lineHeight: 1.1,
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </Text>
    </Box>
  );
}

export default StatsOverlay;
