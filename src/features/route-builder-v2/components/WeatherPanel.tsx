/**
 * WeatherPanel — Route Builder 2.0 weather + route-wind annotation.
 *
 * Surfaced behind the rail's Weather icon. Shows current conditions at the
 * route start plus, when a line exists, how the wind sits against the route:
 * a compass arrow pointing the direction the wind blows TOWARD, and a
 * head/tail/cross breakdown so the rider knows where the work is.
 *
 * Conditions are fetched lazily (on open + manual refresh) via
 * useRouteWeather; the panel owns no fetching logic itself.
 */

import { useEffect } from 'react';
import { Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { ArrowUp, ArrowClockwise, Wind, Drop } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import type { UseRouteWeatherReturn } from '../../../hooks/route-builder';

export interface WeatherPanelProps {
  weather: UseRouteWeatherReturn;
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

const WIND_BAR_COLORS: Record<string, string> = {
  headwind: RB2.coral,
  tailwind: RB2.teal,
  crosswind: RB2.gold,
};

export function WeatherPanel({ weather }: WeatherPanelProps) {
  const { status, error, weather: data, wind, hasRoute, refresh } = weather;

  // Fetch on open if we have a route and nothing loaded yet.
  useEffect(() => {
    if (hasRoute && status === 'idle') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute]);

  if (!hasRoute) {
    return (
      <Box data-testid="rb2-weather-panel">
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textTertiary }}>
          Build or generate a route to see weather and wind along it.
        </Text>
      </Box>
    );
  }

  return (
    <Box data-testid="rb2-weather-panel">
      <Group justify="space-between" align="center" mb={8}>
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
          }}
        >
          Weather {data?.location ? `· ${data.location}` : ''}
        </Text>
        <UnstyledButton
          onClick={() => void refresh()}
          aria-label="Refresh weather"
          data-testid="rb2-weather-refresh"
          style={{ padding: 2, color: RB2.textTertiary }}
        >
          <ArrowClockwise size={14} />
        </UnstyledButton>
      </Group>

      {status === 'loading' && (
        <Group gap={8} py={4}>
          <Loader size="xs" />
          <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary }}>
            Fetching conditions…
          </Text>
        </Group>
      )}

      {status === 'error' && (
        <Text
          data-testid="rb2-weather-error"
          style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.coral }}
        >
          {error}
        </Text>
      )}

      {status === 'ready' && data && (
        <>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box>
              <Text
                style={{
                  fontFamily: RB2_FONT.heading,
                  fontSize: 26,
                  lineHeight: 1,
                  color: RB2.textPrimary,
                }}
              >
                {data.temperature}°C
              </Text>
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
                {cToF(data.temperature)}°F · feels {data.feelsLike}°C
              </Text>
              <Text
                style={{
                  fontFamily: RB2_FONT.body,
                  fontSize: 12,
                  color: RB2.textSecondary,
                  textTransform: 'capitalize',
                  marginTop: 2,
                }}
              >
                {data.description}
              </Text>
            </Box>

            {/* Wind compass — arrow points the way the wind blows toward. */}
            <Box style={{ textAlign: 'center' }}>
              <Box
                data-testid="rb2-weather-wind-compass"
                style={{
                  width: 44,
                  height: 44,
                  border: `1px solid ${RB2.border}`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                <ArrowUp
                  size={22}
                  weight="bold"
                  color={RB2.teal}
                  // windDegrees is where wind comes FROM; +180 points toward.
                  style={{ transform: `rotate(${(data.windDegrees + 180) % 360}deg)` }}
                />
              </Box>
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textPrimary, marginTop: 4 }}>
                {data.windSpeed} km/h
              </Text>
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
                from {data.windDirection}
                {data.windGust ? ` · gust ${data.windGust}` : ''}
              </Text>
            </Box>
          </Group>

          <Group gap={14} mt={8}>
            <Group gap={4}>
              <Drop size={13} color={RB2.textTertiary} />
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textSecondary }}>
                {data.humidity}% humidity
              </Text>
            </Group>
          </Group>

          {wind && (
            <Box mt={10} data-testid="rb2-weather-wind-breakdown">
              <Group gap={6} mb={4}>
                <Wind size={13} color={RB2.textTertiary} />
                <Text
                  style={{
                    fontFamily: RB2_FONT.mono,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: RB2.textTertiary,
                  }}
                >
                  Along route · {wind.overall.description}
                </Text>
              </Group>
              <Box style={{ display: 'flex', height: 8, overflow: 'hidden' }}>
                {(['headwind', 'crosswind', 'tailwind'] as const).map((k) => {
                  const pct = wind.percentages[k];
                  if (!pct) return null;
                  return (
                    <Box
                      key={k}
                      style={{ width: `${pct}%`, backgroundColor: WIND_BAR_COLORS[k] }}
                      title={`${k}: ${pct}%`}
                    />
                  );
                })}
              </Box>
              <Group gap={12} mt={4}>
                <Legend color={WIND_BAR_COLORS.headwind} label={`Head ${wind.percentages.headwind}%`} />
                <Legend color={WIND_BAR_COLORS.tailwind} label={`Tail ${wind.percentages.tailwind}%`} />
                <Legend color={WIND_BAR_COLORS.crosswind} label={`Cross ${wind.percentages.crosswind}%`} />
              </Group>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={4}>
      <Box style={{ width: 8, height: 8, backgroundColor: color }} />
      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
        {label}
      </Text>
    </Group>
  );
}

export default WeatherPanel;
