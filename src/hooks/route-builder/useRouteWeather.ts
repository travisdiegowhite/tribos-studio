/**
 * useRouteWeather — Route Builder 2.0 weather + route-wind hook.
 *
 * Lazily fetches conditions for the route and, when a line exists, analyzes
 * the wind against the route bearing per segment. Fetching is on-demand
 * (`refresh`) rather than reactive so we don't hammer the API on every drag —
 * the WeatherPanel calls refresh on open and on its button.
 *
 * With no planned start (store `rideStartAt` null) it's current conditions at
 * the start. With one (Phase 2 §3.9) it's the forecast at the start, the
 * middle and the finish, each at the time the rider gets there (start time +
 * the route's estimated duration × how far along it is), from
 * /api/weather-forecast?mode=at. The wind breakdown uses the mid-route
 * forecast. More than 5 days out there's no forecast yet (`forecastNote`).
 */

import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { getWeatherData, analyzeWindForRoute } from '../../utils/weather.js';

/** OpenWeather's 3-hour forecast covers about five days. */
export const FORECAST_HORIZON_MS = 5 * 24 * 3600 * 1000;

export interface RouteWeather {
  temperature: number;
  feelsLike: number;
  windSpeed: number; // km/h
  windDirection: string; // cardinal
  windDegrees: number;
  windGust: number | null;
  description: string;
  conditions: string;
  humidity: number;
  location: string;
}

export interface RouteWindAnalysis {
  overall: { type: string; description: string };
  percentages: {
    headwind: number;
    tailwind: number;
    crosswind: number;
    neutral: number;
  };
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface WeatherAtPoint {
  label: 'Start' | 'Midway' | 'Finish';
  at: string; // ISO time the rider is expected there
  weather: RouteWeather | null;
}

export interface UseRouteWeatherReturn {
  status: Status;
  error: string | null;
  weather: RouteWeather | null;
  wind: RouteWindAnalysis | null;
  hasRoute: boolean;
  refresh: () => Promise<void>;
  /** Start / midway / finish forecasts when a start time is planned. */
  timeline?: WeatherAtPoint[] | null;
  /** 'too_far' when the planned start is beyond the forecast window. */
  forecastNote?: 'too_far' | null;
  /** The planned start this result is for (null = now). */
  plannedStart?: string | null;
}

async function fetchForecastAt(lat: number, lng: number, atMs: number): Promise<RouteWeather | null> {
  try {
    const iso = new Date(atMs).toISOString();
    const response = await fetch(`/api/weather-forecast?mode=at&lat=${lat}&lon=${lng}&time=${encodeURIComponent(iso)}`);
    if (!response.ok) return null;
    const result = (await response.json()) as { success?: boolean; data?: RouteWeather | null };
    return result?.success && result.data ? result.data : null;
  } catch {
    return null;
  }
}

const getWeather = getWeatherData as (
  lat: number,
  lng: number,
) => Promise<RouteWeather | null>;
const analyzeWind = analyzeWindForRoute as (
  coords: Array<[number, number] | [number, number, number]>,
  windDegrees: number,
  windSpeed: number,
) => RouteWindAnalysis;

export function useRouteWeather(): UseRouteWeatherReturn {
  const geometry = useRouteBuilderStore(
    (s) => s.routeGeometry,
  ) as { coordinates?: Array<[number, number] | [number, number, number]> } | null;

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<RouteWeather | null>(null);
  const [wind, setWind] = useState<RouteWindAnalysis | null>(null);
  const [timeline, setTimeline] = useState<WeatherAtPoint[] | null>(null);
  const [forecastNote, setForecastNote] = useState<'too_far' | null>(null);
  const plannedStart = useRouteBuilderStore((s) => (s.rideStartAt as string | null) ?? null);
  const duration_s = useRouteBuilderStore((s) => (s.routeStats as { duration_s?: number } | null)?.duration_s ?? 0);

  const coords = Array.isArray(geometry?.coordinates) ? geometry!.coordinates : [];
  const hasRoute = coords.length > 0;

  const refresh = useCallback(async () => {
    const c = Array.isArray(geometry?.coordinates) ? geometry!.coordinates : [];
    if (c.length === 0) {
      setStatus('idle');
      setWeather(null);
      setWind(null);
      return;
    }
    const [lng, lat] = c[0];
    setStatus('loading');
    setError(null);
    setForecastNote(null);
    const startMs = plannedStart ? Date.parse(plannedStart) : NaN;
    const now = Date.now();
    // A planned start in the past (or right now) is just current conditions.
    if (Number.isFinite(startMs) && startMs > now + 30 * 60 * 1000) {
      if (startMs > now + FORECAST_HORIZON_MS) {
        setWeather(null);
        setWind(null);
        setTimeline(null);
        setForecastNote('too_far');
        setStatus('ready');
        return;
      }
      try {
        const ride_s = duration_s > 0 ? duration_s : 0;
        const points: Array<{ label: WeatherAtPoint['label']; idx: number; fraction: number }> = [
          { label: 'Start', idx: 0, fraction: 0 },
          { label: 'Midway', idx: Math.floor(c.length / 2), fraction: 0.5 },
          { label: 'Finish', idx: c.length - 1, fraction: 1 },
        ];
        const results = await Promise.all(
          points.map(async (p) => {
            const atMs = startMs + ride_s * 1000 * p.fraction;
            const [pLng, pLat] = c[p.idx];
            return { label: p.label, at: new Date(atMs).toISOString(), weather: await fetchForecastAt(pLat, pLng, atMs) };
          }),
        );
        const start = results[0].weather;
        if (!start) {
          setError('The forecast is unavailable right now.');
          setStatus('error');
          return;
        }
        const mid = results[1].weather ?? start;
        setWeather(start);
        setTimeline(results);
        setWind(c.length >= 2 && mid.windDegrees != null ? analyzeWind(c, mid.windDegrees, mid.windSpeed) : null);
        setStatus('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
      return;
    }
    setTimeline(null);
    try {
      const w = await getWeather(lat, lng);
      if (!w) {
        setError('Weather is unavailable right now.');
        setStatus('error');
        return;
      }
      setWeather(w);
      setWind(
        c.length >= 2 && w.windDegrees != null
          ? analyzeWind(c, w.windDegrees, w.windSpeed)
          : null,
      );
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [geometry, plannedStart, duration_s]);

  return { status, error, weather, wind, hasRoute, refresh, timeline, forecastNote, plannedStart };
}

export default useRouteWeather;
