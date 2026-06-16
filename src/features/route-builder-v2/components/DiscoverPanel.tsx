/**
 * DiscoverPanel — Route Builder 2.0 route discovery.
 *
 * Surfaces the rider's saved routes ranked by fit to today's prescription
 * (the next planned workout's target distance) — the coach-differentiated
 * take on discovery, not a generic popularity feed. Presentational: the page
 * supplies the routes + target and handles selection.
 */

import { Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { rankRoutesByFit, type RankableRoute, type RouteFit } from '../discover/rankRoutes';

export interface DiscoverPanelProps {
  routes: RankableRoute[];
  loading?: boolean;
  /** Target distance (km) from today's prescription; null when none scheduled. */
  targetKm: number | null;
  /** Short context line, e.g. "Endurance · ~40 km". */
  targetLabel?: string | null;
  onPick: (id: string) => void;
  isImperial?: boolean;
  isMobile?: boolean;
}

const FIT_COPY: Record<Exclude<RouteFit, null>, { label: string; color: string }> = {
  great: { label: 'Great fit', color: RB2.teal },
  good: { label: 'Good fit', color: RB2.teal },
  far: { label: 'Off target', color: RB2.textTertiary },
};

function km(value: number | null | undefined, isImperial: boolean): string {
  if (value == null) return '—';
  return isImperial ? `${Math.round(value * 0.621371)} mi` : `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

export function DiscoverPanel({
  routes,
  loading = false,
  targetKm,
  targetLabel,
  onPick,
  isImperial = false,
}: DiscoverPanelProps) {
  const ranked = rankRoutesByFit(routes, targetKm);

  return (
    <Box data-testid="rb2-discover-panel">
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 8,
        }}
      >
        {targetLabel ? `For today — ${targetLabel}` : 'Your saved routes'}
      </Text>

      {loading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : ranked.length === 0 ? (
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textTertiary }}>
          No saved routes yet — build one and save it to see it here.
        </Text>
      ) : (
        <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ranked.map((r) => {
            const fit = r.fit ? FIT_COPY[r.fit] : null;
            return (
              <UnstyledButton
                key={r.id}
                data-testid={`rb2-discover-item-${r.id}`}
                onClick={() => onPick(r.id)}
                style={{
                  padding: '10px 12px',
                  border: `1px solid ${RB2.border}`,
                  backgroundColor: RB2.cardBg,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>
                  <Text style={{ fontFamily: RB2_FONT.body, fontWeight: 600, color: RB2.textPrimary }}>
                    {r.name || 'Untitled Route'}
                  </Text>
                  {fit && (
                    <Text
                      style={{
                        fontFamily: RB2_FONT.mono,
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: fit.color,
                        flexShrink: 0,
                      }}
                    >
                      {fit.label}
                    </Text>
                  )}
                </Group>
                <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textTertiary }}>
                  {km(r.distance_km, isImperial)}
                  {r.elevation_gain_m != null
                    ? ` · ${isImperial ? `${Math.round(r.elevation_gain_m * 3.28084)} ft` : `${Math.round(r.elevation_gain_m)} m`}`
                    : ''}
                </Text>
              </UnstyledButton>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default DiscoverPanel;
