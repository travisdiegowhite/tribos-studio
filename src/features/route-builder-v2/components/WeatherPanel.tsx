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

import { useEffect, useState } from 'react';
import { Box, Group, Loader, SegmentedControl, Select, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { ArrowUp, ArrowClockwise, Wind, Drop } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import {
  WEATHER_TOLERANCE_PRESETS,
  DEFAULT_WEATHER_PRESET,
  getWeatherSeverity,
} from '../../../utils/weather.js';
import type { UseRouteWeatherReturn } from '../../../hooks/route-builder';

export interface WeatherPanelProps {
  weather: UseRouteWeatherReturn;
  isImperial?: boolean;
}

/** Tomorrow at 08:00 local, as an ISO string: a sensible first planned start. */
function defaultPlannedStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** ISO → the value a datetime-local input wants (local "YYYY-MM-DDTHH:mm"). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

const PRESET_OPTIONS = Object.values(
  WEATHER_TOLERANCE_PRESETS as Record<string, { id: string; name: string }>,
).map((p) => ({ value: p.id, label: p.name }));

const SEVERITY_COLOR: Record<string, string> = {
  green: RB2.teal,
  terracotta: RB2.gold,
  yellow: RB2.gold,
  orange: RB2.coral,
  red: RB2.coral,
  gray: RB2.textTertiary,
};

function readSavedPreset(): string {
  try {
    const raw = localStorage.getItem('routePreferences');
    const pref = raw ? JSON.parse(raw)?.weatherTolerance : null;
    if (typeof pref === 'string' && (WEATHER_TOLERANCE_PRESETS as Record<string, unknown>)[pref]) {
      return pref;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WEATHER_PRESET as string;
}

function savePreset(id: string): void {
  try {
    const raw = localStorage.getItem('routePreferences');
    const prefs = raw ? JSON.parse(raw) : {};
    localStorage.setItem('routePreferences', JSON.stringify({ ...prefs, weatherTolerance: id }));
  } catch {
    /* ignore */
  }
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

const WIND_BAR_COLORS: Record<string, string> = {
  headwind: RB2.coral,
  tailwind: RB2.teal,
  crosswind: RB2.gold,
};

export function WeatherPanel({ weather, isImperial = false }: WeatherPanelProps) {
  const { status, error, weather: data, wind, hasRoute, refresh, timeline, forecastNote } = weather;
  // Planned start (store rideStartAt): null = now. Changing it re-fetches.
  const rideStartAt = useRouteBuilderStore((s) => (s.rideStartAt as string | null) ?? null);
  const setRideStartAt = useRouteBuilderStore((s) => s.setRideStartAt as (iso: string | null) => void);
  useEffect(() => {
    if (hasRoute && status !== 'idle') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideStartAt]);
  const [presetId, setPresetId] = useState<string>(readSavedPreset);

  const severity =
    data
      ? (getWeatherSeverity(
          data,
          (WEATHER_TOLERANCE_PRESETS as Record<string, object>)[presetId],
          isImperial,
        ) as { level: string; color: string; message: string })
      : null;

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

      <SegmentedControl
        data-testid="rb2-weather-start-mode"
        value={rideStartAt ? 'planned' : 'now'}
        onChange={(v) => setRideStartAt(v === 'planned' ? defaultPlannedStart() : null)}
        data={[
          { value: 'now', label: 'Now' },
          { value: 'planned', label: 'Planned start' },
        ]}
        fullWidth
        size="xs"
        radius={0}
        mb={6}
      />
      {rideStartAt && (
        <TextInput
          data-testid="rb2-weather-start-time"
          type="datetime-local"
          aria-label="Start time"
          value={toLocalInput(rideStartAt)}
          onChange={(e) => {
            const ms = Date.parse(e.currentTarget.value);
            if (Number.isFinite(ms)) setRideStartAt(new Date(ms).toISOString());
          }}
          size="xs"
          radius={0}
          mb={8}
        />
      )}

      {forecastNote === 'too_far' && status === 'ready' && (
        <Text data-testid="rb2-weather-too-far" style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textSecondary }}>
          Forecasts reach about five days ahead. Check back closer to the day.
        </Text>
      )}

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
                {isImperial ? `${cToF(data.temperature)}°F` : `${data.temperature}°C`}
              </Text>
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
                {isImperial
                  ? `${data.temperature}°C · feels ${cToF(data.feelsLike)}°F`
                  : `${cToF(data.temperature)}°F · feels ${data.feelsLike}°C`}
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
                {isImperial ? `${kmhToMph(data.windSpeed)} mph` : `${data.windSpeed} km/h`}
              </Text>
              <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
                from {data.windDirection}
                {data.windGust ? ` · gust ${isImperial ? kmhToMph(data.windGust) : data.windGust}` : ''}
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

          {timeline && timeline.length > 0 && (
            <Box mt={10} data-testid="rb2-weather-timeline" style={{ display: 'flex', gap: 6 }}>
              {timeline.map((p) => (
                <Box key={p.label} style={{ flex: 1, border: `1px solid ${RB2.border}`, padding: '4px 6px' }}>
                  <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: RB2.textTertiary }}>
                    {p.label} · {formatClock(p.at)}
                  </Text>
                  {p.weather ? (
                    <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textPrimary }}>
                      {isImperial ? `${cToF(p.weather.temperature)}°F` : `${p.weather.temperature}°C`} ·{' '}
                      {isImperial ? `${kmhToMph(p.weather.windSpeed)} mph` : `${p.weather.windSpeed} km/h`} {p.weather.windDirection}
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textTertiary }}>—</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}

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

          {/* Rider-tolerance verdict + preset selector */}
          {severity && (
            <Group gap={6} mt={10} data-testid="rb2-weather-verdict">
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: SEVERITY_COLOR[severity.color] ?? RB2.textTertiary,
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textSecondary }}>
                {severity.message}
              </Text>
            </Group>
          )}
          <Select
            mt={8}
            size="xs"
            label="Your weather tolerance"
            data={PRESET_OPTIONS}
            value={presetId}
            allowDeselect={false}
            onChange={(v) => {
              if (!v) return;
              setPresetId(v);
              savePreset(v);
            }}
            data-testid="rb2-weather-preset"
            styles={{
              input: { borderRadius: 0 },
              label: {
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: RB2.textTertiary,
              },
            }}
          />
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
