/**
 * Polyline Stream Builder
 *
 * Converts a Strava summary polyline + elevation API data into a synthetic
 * activity_streams object suitable for segment detection. The resulting streams
 * contain coords and elevation only — no speed, power, HR, or cadence.
 *
 * This enables terrain-based segment detection (gradient, terrain type,
 * distance, elevation gain) for activities that lack full per-second streams
 * (i.e. Strava activities without Garmin FIT data).
 *
 * Pipeline:
 *   1. Decode Google encoded polyline → [lat, lng] pairs
 *   2. Convert to [lng, lat] format (activity_streams convention)
 *   3. Fetch elevation from OpenTopoData (100 pts/request, SRTM 30m)
 *   4. Interpolate elevation for any un-sampled points
 *   5. Return { coords, elevation } in activity_streams format
 */

import { decodePolyline, haversineDistance } from './polylineDecode.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ELEVATION_API_URL = 'https://api.opentopodata.org/v1/srtm30m';
const MAX_POINTS_PER_REQUEST = 100;
const BATCH_DELAY_MS = 250; // delay between elevation API batches
const MIN_POINTS_FOR_ANALYSIS = 10;

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Build synthetic activity_streams from an encoded polyline.
 *
 * @param {string} encodedPolyline - Google encoded polyline string
 * @returns {Promise<{coords: Array<[number,number]>, elevation: number[]}|null>}
 *   Activity streams with coords ([lng, lat]) and elevation arrays, or null on failure
 */
export async function buildStreamsFromPolyline(encodedPolyline) {
  if (!encodedPolyline || typeof encodedPolyline !== 'string') {
    console.warn('[PolylineStreamBuilder] No polyline provided');
    return null;
  }

  // Step 1: Decode polyline → [lat, lng] pairs
  const latLngPoints = decodePolyline(encodedPolyline);
  if (latLngPoints.length < MIN_POINTS_FOR_ANALYSIS) {
    console.warn(`[PolylineStreamBuilder] Too few points: ${latLngPoints.length}`);
    return null;
  }

  // Step 2: Convert to [lng, lat] (activity_streams convention)
  const coords = latLngPoints.map(([lat, lng]) => [lng, lat]);

  // Step 3: Fetch elevation
  const elevation = await fetchElevationForCoords(latLngPoints);
  if (!elevation) {
    console.warn('[PolylineStreamBuilder] Failed to fetch elevation data');
    return null;
  }

  console.log(`[PolylineStreamBuilder] Built streams: ${coords.length} points with elevation`);

  return { coords, elevation };
}

// ============================================================================
// ELEVATION FETCHING
// ============================================================================

/**
 * Fetch elevation data from OpenTopoData for an array of [lat, lng] points.
 * Handles batching (100 points per request) and interpolation for
 * large point sets.
 *
 * @param {Array<[number, number]>} latLngPoints - Array of [lat, lng] pairs
 * @returns {Promise<number[]|null>} Elevation array (same length as input), or null
 */
async function fetchElevationForCoords(latLngPoints) {
  const totalPoints = latLngPoints.length;

  // If we have more than MAX_POINTS_PER_REQUEST * 3 points, downsample + interpolate
  // (Polylines are typically 50-300 points, so this handles edge cases)
  if (totalPoints > MAX_POINTS_PER_REQUEST * 3) {
    return await fetchWithDownsampling(latLngPoints);
  }

  // Otherwise, fetch in batches directly
  return await fetchInBatches(latLngPoints);
}

/**
 * Fetch elevation in batches of 100, directly for all points.
 */
async function fetchInBatches(latLngPoints) {
  const allElevations = [];

  for (let i = 0; i < latLngPoints.length; i += MAX_POINTS_PER_REQUEST) {
    const batch = latLngPoints.slice(i, i + MAX_POINTS_PER_REQUEST);

    const elevations = await fetchElevationBatch(batch);
    if (!elevations) {
      console.error(`[PolylineStreamBuilder] Elevation batch ${Math.floor(i / MAX_POINTS_PER_REQUEST) + 1} failed`);
      return null;
    }

    allElevations.push(...elevations);

    // Delay between batches to respect rate limits
    if (i + MAX_POINTS_PER_REQUEST < latLngPoints.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return allElevations;
}

/**
 * Fetch elevation with downsampling and interpolation for large point sets.
 * Samples up to 200 points, fetches their elevation, then linearly
 * interpolates to fill the full array.
 */
async function fetchWithDownsampling(latLngPoints) {
  const totalPoints = latLngPoints.length;
  const maxSamples = 200;

  // Build sample indices (always include first and last)
  const sampleIndices = [0];
  const step = (totalPoints - 1) / (maxSamples - 1);
  for (let i = 1; i < maxSamples - 1; i++) {
    sampleIndices.push(Math.round(i * step));
  }
  sampleIndices.push(totalPoints - 1);

  // Fetch sampled points
  const sampledPoints = sampleIndices.map(idx => latLngPoints[idx]);
  const sampledElevations = await fetchInBatches(sampledPoints);
  if (!sampledElevations) return null;

  // Interpolate to full resolution
  const fullElevation = new Array(totalPoints);

  // Place sampled values
  for (let i = 0; i < sampleIndices.length; i++) {
    fullElevation[sampleIndices[i]] = sampledElevations[i];
  }

  // Linear interpolation between known points
  let prevKnownIdx = 0;
  for (let i = 1; i < totalPoints; i++) {
    if (fullElevation[i] !== undefined) {
      prevKnownIdx = i;
      continue;
    }

    // Find next known point
    let nextKnownIdx = i + 1;
    while (nextKnownIdx < totalPoints && fullElevation[nextKnownIdx] === undefined) {
      nextKnownIdx++;
    }

    if (nextKnownIdx < totalPoints) {
      const startElev = fullElevation[prevKnownIdx];
      const endElev = fullElevation[nextKnownIdx];
      const range = nextKnownIdx - prevKnownIdx;
      const position = i - prevKnownIdx;
      fullElevation[i] = startElev + (endElev - startElev) * (position / range);
    } else {
      fullElevation[i] = fullElevation[prevKnownIdx];
    }
  }

  return fullElevation;
}

/**
 * Fetch elevation for a single batch of up to 100 [lat, lng] points
 * from OpenTopoData.
 *
 * @param {Array<[number, number]>} batch - Up to 100 [lat, lng] pairs
 * @returns {Promise<number[]|null>} Elevation values or null on failure
 */
async function fetchElevationBatch(batch) {
  try {
    // Format: lat,lon|lat,lon|...
    const locations = batch
      .map(([lat, lng]) => `${lat},${lng}`)
      .join('|');

    const url = `${ELEVATION_API_URL}?locations=${locations}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error(`[PolylineStreamBuilder] Elevation API HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.status !== 'OK' || !data.results) {
      console.error('[PolylineStreamBuilder] Elevation API returned non-OK:', data.status);
      return null;
    }

    return data.results.map(r => r.elevation ?? 0);
  } catch (error) {
    console.error('[PolylineStreamBuilder] Elevation fetch error:', error.message);
    return null;
  }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Calculate total distance of a polyline in meters.
 * Useful for validation before processing.
 *
 * @param {Array<[number, number]>} latLngPoints - [lat, lng] pairs
 * @returns {number} Total distance in meters
 */
export function calculatePolylineDistance(latLngPoints) {
  let totalKm = 0;
  for (let i = 1; i < latLngPoints.length; i++) {
    totalKm += haversineDistance(
      latLngPoints[i - 1][0], latLngPoints[i - 1][1],
      latLngPoints[i][0], latLngPoints[i][1]
    );
  }
  return totalKm * 1000; // convert to meters
}
