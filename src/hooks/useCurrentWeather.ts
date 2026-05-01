/**
 * useCurrentWeather Hook
 *
 * Calls /api/weather (current conditions, not the 5-day forecast) and
 * caches the result in localStorage with a 30-minute TTL.
 *
 * No-op while lat/lon are null. Silently fails — weather is never
 * critical enough to block the rest of the Today view.
 */

import { useEffect, useState } from 'react';

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  windSpeed: number;        // km/h
  windDirection: string;
  windGust: number | null;
  description: string;
  icon: string;
  conditions: string;        // 'rain', 'clouds', 'clear', etc.
  humidity: number;
  pressure: number;
  visibility: number;        // km
  cloudCover: number;
  sunrise: number;
  sunset: number;
  location: string;
}

interface CachedWeather {
  data: CurrentWeather;
  fetchedAt: number;
  key: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'tribos:today:weather';

function readCache(): CachedWeather | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (!parsed.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(value: CachedWeather): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore — quota exceeded or private browsing.
  }
}

export interface UseCurrentWeatherReturn {
  weather: CurrentWeather | null;
  loading: boolean;
}

export function useCurrentWeather(
  lat: number | null,
  lon: number | null,
): UseCurrentWeatherReturn {
  const [weather, setWeather] = useState<CurrentWeather | null>(() => readCache()?.data ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lon == null) return;

    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = readCache();
    if (cached?.key === key) {
      setWeather(cached.data);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) {
          setWeather(json.data as CurrentWeather);
          writeCache({ data: json.data as CurrentWeather, fetchedAt: Date.now(), key });
        }
      })
      .catch(() => {
        // Silent fail — non-critical.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return { weather, loading };
}
