/**
 * useUserLocation Hook
 *
 * Resolves the user's current location for weather + suggestions, with a
 * deliberate fallback chain:
 *
 *   1. Browser geolocation (if granted — never prompts pre-emptively)
 *   2. Most-recent activity start coordinates
 *   3. user_profiles.location (city name → coords are NOT geocoded yet;
 *      see TODO below)
 *   4. Hardcoded reasonable default (Boulder, CO — a cycling-friendly city)
 *
 * Resolved coords cache in localStorage with a 24-hour TTL. NO new DB
 * column per the spec.
 *
 * NB: this hook does not request geolocation permission unprompted. If
 * permission has not yet been granted, it skips straight to the activity
 * fallback. A separate explicit "use my location" button can call
 * `requestGeolocation()` to prompt the user.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface UserLocation {
  lat: number;
  lon: number;
  source: 'geolocation' | 'last_activity' | 'profile' | 'default';
  cachedAt: number;
}

const STORAGE_KEY = 'tribos:today:location';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCATION: UserLocation = {
  lat: 40.015,
  lon: -105.2705,
  source: 'default',
  cachedAt: 0,
};

function readCache(): UserLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(loc: UserLocation): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    // Ignore — quota exceeded or private browsing.
  }
}

async function tryGeolocation(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) {
    return null;
  }
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (permission.state !== 'granted') return null;
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { maximumAge: 5 * 60 * 1000, timeout: 5000 },
    );
  });
}

async function tryLastActivity(userId: string): Promise<{ lat: number; lon: number } | null> {
  const { data } = await supabase
    .from('activities')
    .select('start_latitude, start_longitude')
    .eq('user_id', userId)
    .not('start_latitude', 'is', null)
    .not('start_longitude', 'is', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.start_latitude == null || data?.start_longitude == null) return null;
  return { lat: data.start_latitude as number, lon: data.start_longitude as number };
}

export interface UseUserLocationReturn {
  location: UserLocation | null;
  loading: boolean;
  /** Trigger an explicit geolocation prompt (e.g. from a button click). */
  requestGeolocation: () => Promise<UserLocation | null>;
}

export function useUserLocation(userId: string | undefined | null): UseUserLocationReturn {
  const [location, setLocation] = useState<UserLocation | null>(() => readCache());
  const [loading, setLoading] = useState(!location);

  useEffect(() => {
    if (location) return;
    if (!userId) {
      setLocation(DEFAULT_LOCATION);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);

      const geo = await tryGeolocation();
      if (cancelled) return;
      if (geo) {
        const next: UserLocation = { ...geo, source: 'geolocation', cachedAt: Date.now() };
        writeCache(next);
        setLocation(next);
        setLoading(false);
        return;
      }

      const last = await tryLastActivity(userId);
      if (cancelled) return;
      if (last) {
        const next: UserLocation = { ...last, source: 'last_activity', cachedAt: Date.now() };
        writeCache(next);
        setLocation(next);
        setLoading(false);
        return;
      }

      // user_profiles.location is a city name — geocoding it is out of
      // scope for v1. Fall back to a sensible cycling default.
      const next: UserLocation = { ...DEFAULT_LOCATION, cachedAt: Date.now() };
      writeCache(next);
      setLocation(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, location]);

  const requestGeolocation = async (): Promise<UserLocation | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: UserLocation = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: 'geolocation',
            cachedAt: Date.now(),
          };
          writeCache(next);
          setLocation(next);
          resolve(next);
        },
        () => resolve(null),
        { timeout: 8000 },
      );
    });
  };

  return { location, loading, requestGeolocation };
}
