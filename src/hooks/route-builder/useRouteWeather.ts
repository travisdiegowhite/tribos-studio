/**
 * useRouteWeather — Route Builder 2.0 weather + route-wind hook.
 *
 * Lazily fetches current conditions for the route's start point (via the
 * shared /api/weather wrapper) and, when a line exists, analyzes the wind
 * against the route bearing per segment. Fetching is on-demand (`refresh`)
 * rather than reactive so we don't hammer the API on every drag — the
 * WeatherPanel calls refresh on open and on its button.
 */

import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { getWeatherData, analyzeWindForRoute } from '../../utils/weather.js';

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

export interface UseRouteWeatherReturn {
  status: Status;
  error: string | null;
  weather: RouteWeather | null;
  wind: RouteWindAnalysis | null;
  hasRoute: boolean;
  refresh: () => Promise<void>;
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
  }, [geometry]);

  return { status, error, weather, wind, hasRoute, refresh };
}

export default useRouteWeather;
