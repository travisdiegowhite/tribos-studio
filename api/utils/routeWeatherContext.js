// Server-side weather + route-wind context for /api/route-coach (Epic 1).
//
// The browser hook src/hooks/route-builder/useRouteWeather.ts fetches the
// same conditions for the UI (WeatherPanel / WindArrowsLayer), but the
// route coach runs inside a Vercel function where the src/ weather util is
// unusable: getWeatherData() fetches a RELATIVE '/api/weather' URL and the
// wind helpers live alongside browser-coupled imports. This module fetches
// OpenWeatherMap directly (same transform as api/weather.js) and ports the
// pure wind-vs-bearing analysis from src/utils/weather.js so the coach can
// reason about wind when refining a route.
//
// Pure spatial helpers are inlined to keep this module free of src/ imports,
// matching the pattern in routeCoachContext.js.

// ── Inlined pure helpers (ports of src/utils/weather.js) ─────────────────────

const MS_TO_KMH = 3.6;
const EARTH_RADIUS_KM = 6371;

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

function windDirectionCardinal(degrees) {
  if (degrees === undefined || degrees === null || !Number.isFinite(Number(degrees))) {
    return null;
  }
  const index = Math.round(Number(degrees) / 22.5) % 16;
  return CARDINALS[index];
}

/** Bearing from point A to point B, degrees clockwise from north. */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Classify a single segment bearing against the wind into a collapsed
 * bucket: 'headwind' | 'tailwind' | 'crosswind' | 'neutral'.
 *
 * Wind direction is where the wind comes FROM; route bearing is where we
 * are heading TO. Quartering winds collapse into head/tail to match the
 * percentages produced by src/utils/weather.js analyzeWindForRoute.
 */
function classifyBearing(routeBearing, windDegrees, windSpeedKmh) {
  if (!Number.isFinite(windDegrees) || !Number.isFinite(windSpeedKmh) || windSpeedKmh < 5) {
    return 'neutral';
  }
  let angleDiff = Math.abs(routeBearing - windDegrees);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;

  if (angleDiff <= 30) return 'headwind';
  if (angleDiff >= 150) return 'tailwind';
  if (angleDiff >= 60 && angleDiff <= 120) return 'crosswind';
  // Diagonal: lean to the nearer of head/tail.
  return angleDiff < 90 ? 'headwind' : 'tailwind';
}

/**
 * Distance-weighted wind breakdown for a route. Returns rounded percentages
 * plus an `overall` descriptor, or null when the geometry is too short or
 * the wind is calm/unknown.
 */
export function analyzeRouteWind(coordinates, windDegrees, windSpeedKmh) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  if (!Number.isFinite(windDegrees) || !Number.isFinite(windSpeedKmh) || windSpeedKmh < 5) {
    return null;
  }

  let head = 0;
  let tail = 0;
  let cross = 0;
  let total = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    if (![lon1, lat1, lon2, lat2].every((n) => Number.isFinite(Number(n)))) continue;
    const distKm = haversineKm(lat1, lon1, lat2, lon2);
    if (distKm <= 0) continue;
    const bearing = calculateBearing(lat1, lon1, lat2, lon2);
    const bucket = classifyBearing(bearing, windDegrees, windSpeedKmh);
    total += distKm;
    if (bucket === 'headwind') head += distKm;
    else if (bucket === 'tailwind') tail += distKm;
    else if (bucket === 'crosswind') cross += distKm;
  }

  if (total <= 0) return null;

  const headPct = Math.round((head / total) * 100);
  const tailPct = Math.round((tail / total) * 100);
  const crossPct = Math.round((cross / total) * 100);
  const neutralPct = Math.max(0, 100 - headPct - tailPct - crossPct);

  let overall;
  if (headPct > 40) overall = `${headPct}% headwind`;
  else if (tailPct > 40) overall = `${tailPct}% tailwind`;
  else if (crossPct > 40) overall = `${crossPct}% crosswind`;
  else overall = 'mixed wind';

  return {
    headwind: headPct,
    tailwind: tailPct,
    crosswind: crossPct,
    neutral: neutralPct,
    overall,
  };
}

/** Normalize a start location to canonical [lng, lat], or null. */
function toLngLat(startLocation, fallbackCoords) {
  let lngLat = startLocation;
  if (!Array.isArray(lngLat) && lngLat && typeof lngLat === 'object') {
    const lng = lngLat.lng ?? lngLat.longitude ?? lngLat.lon;
    const lat = lngLat.lat ?? lngLat.latitude;
    if (lng !== undefined && lat !== undefined) lngLat = [lng, lat];
  }
  if (
    !Array.isArray(lngLat) ||
    lngLat.length < 2 ||
    !Number.isFinite(Number(lngLat[0])) ||
    !Number.isFinite(Number(lngLat[1]))
  ) {
    // Fall back to the first route vertex.
    if (Array.isArray(fallbackCoords) && fallbackCoords.length > 0) {
      const [lng, lat] = fallbackCoords[0];
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
        return [Number(lng), Number(lat)];
      }
    }
    return null;
  }
  return [Number(lngLat[0]), Number(lngLat[1])];
}

// ── OpenWeatherMap fetch (service-side; no mock fallback) ────────────────────

/**
 * Fetch current conditions for a point. Returns a compact descriptor or
 * null. Unlike api/weather.js this NEVER returns mock data — feeding the
 * coach fabricated wind would produce confidently wrong advice, so when the
 * key is missing or the call fails we omit the weather block entirely.
 */
let warnedNoKey = false;

export async function fetchWeatherAt(lat, lon) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        '[route-coach] OPENWEATHER_API_KEY not configured — the coach will not reason about wind/weather.',
      );
    }
    return null;
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.main || !data?.wind) return null;

    const windDegrees = Number.isFinite(Number(data.wind.deg)) ? Number(data.wind.deg) : null;
    return {
      temperatureC: Math.round(data.main.temp),
      feelsLikeC: Math.round(data.main.feels_like),
      windSpeedKmh: Math.round((Number(data.wind.speed) || 0) * MS_TO_KMH),
      windGustKmh:
        data.wind.gust != null ? Math.round(Number(data.wind.gust) * MS_TO_KMH) : null,
      windDegrees,
      windDirection: windDirectionCardinal(windDegrees),
      conditions: (data.weather?.[0]?.main || '').toLowerCase(),
      description: data.weather?.[0]?.description || null,
    };
  } catch {
    return null;
  }
}

/**
 * Assemble the route-weather descriptor for the coach prompt: current
 * conditions at the start point plus the head/tail/cross-wind breakdown
 * against the actual route geometry. Returns null on any miss so the
 * prompt block stays silent (graceful degradation, same as the other
 * context fetchers).
 */
export async function getRouteWeather(startLocation, coordinates) {
  try {
    if (!process.env.OPENWEATHER_API_KEY) return null;
    const lngLat = toLngLat(startLocation, coordinates);
    if (!lngLat) return null;

    const [lng, lat] = lngLat;
    const weather = await fetchWeatherAt(lat, lng);
    if (!weather) return null;

    const wind =
      weather.windDegrees != null
        ? analyzeRouteWind(coordinates, weather.windDegrees, weather.windSpeedKmh)
        : null;

    return { ...weather, wind };
  } catch {
    return null;
  }
}

export default { getRouteWeather, fetchWeatherAt, analyzeRouteWind };
