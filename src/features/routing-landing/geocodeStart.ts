/**
 * Start-point search for the landing form: Mapbox forward geocoding with
 * addresses included (geocoding.js's `geocodeWaypoint` is tuned for named
 * waypoints and leaves addresses out), and reverse geocoding for "use my
 * location".
 */

import type { Coordinate } from '../../types/geo';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export interface StartSuggestion {
  label: string;
  coordinates: Coordinate;
}

interface MapboxFeature {
  place_name?: string;
  center?: [number, number];
}

export async function searchStart(query: string, proximity: Coordinate | null, signal?: AbortSignal): Promise<StartSuggestion[]> {
  const q = query.trim();
  if (!q || !MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'US',
    types: 'address,poi,neighborhood,locality,place,postcode',
    limit: '5',
    autocomplete: 'true',
  });
  if (proximity) params.set('proximity', `${proximity[0]},${proximity[1]}`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return [];
  const data = (await resp.json()) as { features?: MapboxFeature[] };
  return (data.features ?? [])
    .filter((f): f is Required<Pick<MapboxFeature, 'place_name' | 'center'>> => !!f.place_name && Array.isArray(f.center))
    .map((f) => ({ label: f.place_name, coordinates: [f.center[0], f.center[1]] as Coordinate }));
}

export async function reverseGeocodeStart(coord: Coordinate): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, types: 'address,poi,neighborhood,place', limit: '1' });
  try {
    const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${coord[0]},${coord[1]}.json?${params}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { features?: MapboxFeature[] };
    return data.features?.[0]?.place_name ?? null;
  } catch {
    return null;
  }
}

/** The browser's location as a canonical coordinate. */
export function currentLocation(timeoutMs = 10_000): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was declined.' : 'Couldn’t find your location.')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}
