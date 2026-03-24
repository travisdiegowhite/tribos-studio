/**
 * useWeatherForecast hook
 * Fetches 5-day weather forecast and returns data keyed by date (YYYY-MM-DD)
 */

import { useState, useEffect } from 'react';
import type { DailyForecast } from '../types/weather';

// Module-level cache to avoid re-fetching on re-renders
let cachedForecast: Record<string, DailyForecast> | null = null;
let cachedKey: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface UseWeatherForecastResult {
  forecast: Record<string, DailyForecast> | null;
  loading: boolean;
}

export function useWeatherForecast(
  lat: number | null,
  lon: number | null
): UseWeatherForecastResult {
  const [forecast, setForecast] = useState<Record<string, DailyForecast> | null>(cachedForecast);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lon == null) return;

    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

    // Return cached data if still fresh
    if (cachedKey === key && cachedForecast && Date.now() - cachedAt < CACHE_TTL_MS) {
      setForecast(cachedForecast);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/weather-forecast?lat=${lat}&lon=${lon}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success && json.data) {
          cachedForecast = json.data;
          cachedKey = key;
          cachedAt = Date.now();
          setForecast(json.data);
        }
      })
      .catch(() => {
        // Silently fail — weather is a nice-to-have
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lat, lon]);

  return { forecast, loading };
}
