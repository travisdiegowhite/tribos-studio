// Elevation data service with multiple provider support
// Provides accurate elevation data for cycling routes

import { haversineKm } from './distanceUnits';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// OpenTopoData's public API allows ~1 request/second. Space multi-batch routes
// out accordingly; bursting batches 200ms apart was reliably returning 429.
const INTER_BATCH_DELAY_MS = 1100;

// ── In-flight dedup + short-lived result cache ──────────────────────────────
// Several RB2 consumers (useRouteManipulation, useRouteAnalysis, GradientLayer,
// elevationEnrichment) each fetch elevation for the *same* route. Without
// coordination that's N concurrent identical calls → OpenTopoData 429s. The
// cache collapses concurrent identical requests into one and reuses the result
// for a short window (also conserving the API's 1000/day quota).
const _elevCache = new Map(); // key -> { ts, data }
const _elevInflight = new Map(); // key -> Promise<data>
const ELEV_CACHE_TTL_MS = 60_000;
const ELEV_CACHE_MAX = 16;

function _elevCacheKey(coordinates) {
  // Full-content (rounded) key: only an identical geometry reuses a result, so
  // we never serve stale elevation for a route that was actually edited.
  let k = `${coordinates.length}`;
  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i] || [];
    k += `|${(Number(c[0]) || 0).toFixed(5)},${(Number(c[1]) || 0).toFixed(5)}`;
  }
  return k;
}

/** Test/maintenance helper — drops cached + in-flight elevation requests. */
export function clearElevationCache() {
  _elevCache.clear();
  _elevInflight.clear();
}

/**
 * Fetch elevation data via our API proxy (avoids CORS issues)
 * Uses OpenTopoData SRTM 30m resolution data
 */
/**
 * Fetch a single ≤100-point batch, retrying on a 429 with backoff so a
 * transient rate-limit doesn't silently drop part of the route's profile.
 * Returns the batch's results array, or null if it ultimately failed.
 */
async function fetchElevationBatch(batch, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch('/api/elevation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: batch }),
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      console.error('Elevation API failed:', error);
      return null;
    }

    if (response.ok) {
      const data = await response.json();
      return data.success && data.results ? data.results : [];
    }

    // Back off and retry on rate-limit; give up on any other error.
    if (response.status === 429 && attempt < maxRetries) {
      await sleep(1000 * (attempt + 1)); // 1s, then 2s
      continue;
    }

    console.error('Elevation API error:', response.status);
    return null;
  }
  return null;
}

async function fetchElevationFromAPI(coordinates) {
  try {
    // API has a limit of 100 locations per request
    const maxBatchSize = 100;
    const results = [];

    for (let i = 0; i < coordinates.length; i += maxBatchSize) {
      const batch = coordinates.slice(i, i + maxBatchSize);
      const batchResults = await fetchElevationBatch(batch);
      if (batchResults && batchResults.length > 0) {
        results.push(...batchResults);
      }

      // Respect OpenTopoData's ~1 req/sec limit between batches.
      if (i + maxBatchSize < coordinates.length) {
        await sleep(INTER_BATCH_DELAY_MS);
      }
    }

    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Elevation API failed:', error);
    return null;
  }
}

/**
 * Downsample coordinates to reduce API calls while maintaining profile accuracy
 */
function downsampleCoordinates(coordinates, maxPoints = 150) {
  if (coordinates.length <= maxPoints) {
    return coordinates.map((coord, i) => ({ coord, originalIndex: i }));
  }

  const downsampled = [];
  const step = (coordinates.length - 1) / (maxPoints - 1);

  // Always include first point
  downsampled.push({ coord: coordinates[0], originalIndex: 0 });

  // Sample points at regular intervals
  for (let i = 1; i < maxPoints - 1; i++) {
    const index = Math.round(i * step);
    downsampled.push({ coord: coordinates[index], originalIndex: index });
  }

  // Always include last point
  const lastIndex = coordinates.length - 1;
  downsampled.push({ coord: coordinates[lastIndex], originalIndex: lastIndex });

  return downsampled;
}

/**
 * Interpolate elevation for all points based on sampled points
 */
function interpolateElevations(sampledElevations, totalPoints) {
  const fullElevation = new Array(totalPoints);

  // Fill in the sampled points
  sampledElevations.forEach(point => {
    fullElevation[point.originalIndex] = point.elevation;
  });

  // Interpolate missing points
  let lastKnownIndex = 0;
  for (let i = 1; i < totalPoints; i++) {
    if (fullElevation[i] === undefined) {
      // Find next known point
      let nextKnownIndex = i + 1;
      while (nextKnownIndex < totalPoints && fullElevation[nextKnownIndex] === undefined) {
        nextKnownIndex++;
      }

      if (nextKnownIndex < totalPoints) {
        // Linear interpolation
        const startElev = fullElevation[lastKnownIndex];
        const endElev = fullElevation[nextKnownIndex];
        const range = nextKnownIndex - lastKnownIndex;
        const position = i - lastKnownIndex;
        fullElevation[i] = startElev + (endElev - startElev) * (position / range);
      } else {
        // Use last known elevation
        fullElevation[i] = fullElevation[lastKnownIndex];
      }
    } else {
      lastKnownIndex = i;
    }
  }

  return fullElevation;
}

/**
 * Calculate cumulative distances along a route, in KILOMETERS.
 *
 * @param {Array<[number, number]>} coordinates - [lng, lat] pairs
 * @returns {Array<number>} cumulative distance_km values, one per coordinate
 */
export function calculateCumulativeDistances(coordinates) {
  const distances_km = [0];
  let totalDistance_km = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    totalDistance_km += haversineKm(lat1, lng1, lat2, lng2);
    distances_km.push(totalDistance_km);
  }

  return distances_km;
}

/**
 * Interpolate the [lng, lat] coordinate at a given cumulative distance (km)
 * along a polyline. Reuses calculateCumulativeDistances so the distance basis
 * matches getElevationData's profile. Clamps to the route endpoints.
 *
 * @param {Array<[number, number]>} coordinates - [lng, lat] pairs
 * @param {number} distanceKm - distance along the route, in km
 * @returns {[number, number] | null} interpolated [lng, lat], or null on bad input
 */
export function coordinateAtDistanceKm(coordinates, distanceKm) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0];
  if (!Number.isFinite(distanceKm)) return null;

  const cum = calculateCumulativeDistances(coordinates); // one cumulative km per coord
  const total = cum[cum.length - 1];

  if (distanceKm <= 0 || total === 0) return coordinates[0];
  if (distanceKm >= total) return coordinates[coordinates.length - 1];

  // First index whose cumulative distance >= target (binary search).
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < distanceKm) lo = mid + 1;
    else hi = mid;
  }

  // Interpolate between coord[lo-1] and coord[lo].
  const segStart = cum[lo - 1];
  const segEnd = cum[lo];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (distanceKm - segStart) / segLen : 0;
  const [lng0, lat0] = coordinates[lo - 1];
  const [lng1, lat1] = coordinates[lo];
  return [lng0 + (lng1 - lng0) * t, lat0 + (lat1 - lat0) * t];
}

/**
 * Main function to get elevation data for a route
 * Returns array of { distance_km, elevation, lat, lon } objects
 */
export async function getElevationData(coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const key = _elevCacheKey(coordinates);

  // Serve a fresh cached result if we have one.
  const cached = _elevCache.get(key);
  if (cached && Date.now() - cached.ts < ELEV_CACHE_TTL_MS) {
    return cached.data;
  }

  // Collapse concurrent identical requests into a single in-flight fetch — the
  // main driver of the /api/elevation 429s was several hooks fetching the same
  // route at the same moment.
  const inflight = _elevInflight.get(key);
  if (inflight) return inflight;

  const promise = _getElevationDataUncached(coordinates)
    .then((data) => {
      if (data) {
        _elevCache.set(key, { ts: Date.now(), data });
        if (_elevCache.size > ELEV_CACHE_MAX) {
          _elevCache.delete(_elevCache.keys().next().value);
        }
      }
      return data;
    })
    .finally(() => _elevInflight.delete(key));

  _elevInflight.set(key, promise);
  return promise;
}

async function _getElevationDataUncached(coordinates) {
  console.log(`📍 Fetching elevation for ${coordinates.length} points...`);

  // Downsample for API efficiency
  const maxSamplePoints = 150;
  const needsDownsampling = coordinates.length > maxSamplePoints;

  let sampledCoords = coordinates;
  let downsampledData = null;

  if (needsDownsampling) {
    downsampledData = downsampleCoordinates(coordinates, maxSamplePoints);
    sampledCoords = downsampledData.map(d => d.coord);
    console.log(`📉 Downsampled from ${coordinates.length} to ${sampledCoords.length} points`);
  }

  // Fetch elevation via API proxy
  console.log('🏔️ Fetching elevation data...');
  const elevationData = await fetchElevationFromAPI(sampledCoords);

  if (!elevationData || elevationData.length === 0) {
    console.warn('⚠️ Failed to fetch elevation data');
    return null;
  }

  console.log(`✅ Got elevation data for ${elevationData.length} points`);

  // Calculate distances (KILOMETERS along the route)
  const distances_km = calculateCumulativeDistances(coordinates);

  // If we downsampled, interpolate to get full resolution
  if (needsDownsampling && downsampledData) {
    const sampledWithIndices = elevationData.map((data, i) => ({
      ...data,
      originalIndex: downsampledData[i].originalIndex
    }));

    const fullElevation = interpolateElevations(
      sampledWithIndices.map(d => ({ elevation: d.elevation, originalIndex: d.originalIndex })),
      coordinates.length
    );

    return coordinates.map(([lon, lat], i) => ({
      distance_km: distances_km[i],
      // T1.1 transition: `distance` alias kept for one PR cycle. Consumers
      // should migrate to `distance_km`; the alias can be removed after.
      distance: distances_km[i],
      elevation: fullElevation[i],
      lat,
      lon
    }));
  }

  // No downsampling needed
  return elevationData.map((data, i) => ({
    distance_km: distances_km[i],
    distance: distances_km[i],
    elevation: data.elevation,
    lat: data.lat,
    lon: data.lon
  }));
}

/**
 * Calculate elevation statistics from elevation profile
 */
export function calculateElevationStats(elevationProfile) {
  if (!elevationProfile || elevationProfile.length < 2) {
    return { gain: 0, loss: 0, min: 0, max: 0 };
  }

  const elevations = elevationProfile.map(p => p.elevation);

  let gain = 0;
  let loss = 0;
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);

  // Calculate gain/loss with smoothing threshold (3m to filter noise)
  const smoothingThreshold = 3;
  let lastSignificantElevation = elevations[0];

  for (let i = 1; i < elevations.length; i++) {
    const elevationChange = elevations[i] - lastSignificantElevation;

    if (Math.abs(elevationChange) >= smoothingThreshold) {
      if (elevationChange > 0) {
        gain += elevationChange;
      } else {
        loss += Math.abs(elevationChange);
      }
      lastSignificantElevation = elevations[i];
    }
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    min: Math.round(min),
    max: Math.round(max)
  };
}
