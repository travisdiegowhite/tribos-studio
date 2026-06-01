/**
 * WindLegend — color key for the map wind-arrows overlay.
 *
 * Shown alongside the layer toggles when the Wind overlay is on, so the
 * arrow colors (head/tail/cross) are interpretable. Surfaces the shared
 * weather hook's load state since the arrows depend on it.
 */

import { Box, Group, Loader, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import type { UseRouteWeatherReturn } from '../../../hooks/route-builder';

export interface WindLegendProps {
  weather: UseRouteWeatherReturn;
  isMobile?: boolean;
}

const KEYS: Array<{ color: string; label: string }> = [
  { color: '#C43C2A', label: 'Headwind' },
  { color: '#2A8C82', label: 'Tailwind' },
  { color: '#C49A0A', label: 'Crosswind' },
];

export function WindLegend({ weather, isMobile = false }: WindLegendProps) {
  const { status, error, weather: data, wind } = weather;

  return (
    <Box
      data-testid="rb2-wind-legend"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        padding: '10px 12px',
        boxShadow: RB2.shadowCard,
        width: isMobile ? '100%' : undefined,
      }}
    >
      <Group justify="space-between" align="center" mb={6}>
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
          }}
        >
          Wind
        </Text>
        {data && (
          <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textSecondary }}>
            {data.windSpeed} km/h from {data.windDirection}
          </Text>
        )}
      </Group>

      {status === 'loading' && (
        <Group gap={6}>
          <Loader size="xs" />
          <Text style={{ fontFamily: RB2_FONT.body, fontSize: 11, color: RB2.textTertiary }}>
            Loading conditions…
          </Text>
        </Group>
      )}

      {status === 'error' && (
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 11, color: RB2.coral }}>
          {error ?? 'Weather unavailable.'}
        </Text>
      )}

      {status === 'ready' && (
        <>
          <Group gap={12}>
            {KEYS.map((k) => (
              <Group gap={4} key={k.label}>
                <Box style={{ width: 9, height: 9, backgroundColor: k.color }} />
                <Text
                  style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}
                >
                  {k.label}
                </Text>
              </Group>
            ))}
          </Group>
          {wind && (
            <Text
              style={{
                fontFamily: RB2_FONT.body,
                fontSize: 11,
                color: RB2.textSecondary,
                marginTop: 6,
              }}
            >
              {wind.overall.description} along route
            </Text>
          )}
        </>
      )}
    </Box>
  );
}

export default WindLegend;
