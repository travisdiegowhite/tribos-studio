/**
 * StatsOverlay — Route Builder 2.0 route summary card.
 *
 * Shows distance, elevation gain, and estimated duration for the
 * current route. Hidden when no route exists.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface RouteStats {
  distance_km: number;
  elevation_gain_m: number;
  duration_s: number;
}

export interface StatsOverlayProps {
  stats: RouteStats | null;
  routeName?: string;
  onClear?: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatKm(km: number): string {
  if (!km || km <= 0) return '0';
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}

export function StatsOverlay({ stats, routeName, onClear }: StatsOverlayProps) {
  if (!stats || stats.distance_km <= 0) return null;

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
      <Box style={{ display: 'flex', gap: 18 }}>
        <StatCell label="Distance" value={`${formatKm(stats.distance_km)}km`} />
        <StatCell label="Elevation" value={`${Math.round(stats.elevation_gain_m)}m`} />
        <StatCell label="Duration" value={formatDuration(stats.duration_s)} />
      </Box>
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
