// Strava Activity Streams — Fetch, Convert & Store
// Fetches per-point GPS/power/HR/elevation data from Strava's Streams API
// and converts it to our standard activity_streams JSONB format
// (same parallel-array format used by Garmin FIT pipeline)

import { simplifyTrack } from './fitParser.js';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const VIRTUAL_TYPES = ['VirtualRide', 'VirtualRun'];

/**
 * Get a valid Strava access token for a user, refreshing if expired.
 * Shared utility so any serverless function can get a fresh token without
 * duplicating the refresh logic.
 *
 * @param {Object} supabase - Supabase client (service role)
 * @param {string} userId - User UUID
 * @returns {Promise<string|null>} Access token, or null if no integration / refresh fails
 */
export async function getValidStravaToken(supabase, userId) {
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .maybeSingle();

  if (error || !integration) {
    return null;
  }

  // If token is still valid (with 5-min buffer), use it
  const expiresAt = new Date(integration.token_expires_at);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (expiresAt > fiveMinFromNow) {
    return integration.access_token;
  }

  // Refresh the token
  console.log('🔄 Refreshing Strava access token for stream backfill...');

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Strava token refresh failed:', response.status);
      return null;
    }

    const tokenData = await response.json();
    const newExpiresAt = new Date(tokenData.expires_at * 1000).toISOString();

    await supabase
      .from('bike_computer_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    console.log('✅ Strava token refreshed for stream backfill');
    return tokenData.access_token;

  } catch (err) {
    console.error('⚠️ Strava token refresh error:', err.message);
    return null;
  }
}

/**
 * Fetch raw stream data from Strava Streams API.
 * Returns normalized stream map { latlng, altitude, watts, heartrate, cadence, distance, time }
 * or null on error / no data.
 */
export async function fetchStravaStreams(activityId, accessToken) {
  try {
    const streamKeys = 'latlng,altitude,heartrate,watts,cadence,distance,time';
    const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${streamKeys}&key_by_type=true`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No streams available (manual entry, missing GPS)
        return null;
      }
      if (response.status === 429) {
        console.warn(`⚠️ Strava rate limited while fetching streams for activity ${activityId}`);
        return { rateLimited: true };
      }
      console.warn(`⚠️ Strava streams API error for activity ${activityId}: ${response.status}`);
      return null;
    }

    const streams = await response.json();

    // Strava returns an array of { type, data, series_type, original_size, resolution }
    const streamMap = {};
    if (Array.isArray(streams)) {
      for (const s of streams) {
        streamMap[s.type] = s.data;
      }
    }

    return streamMap;

  } catch (error) {
    console.error(`⚠️ Error fetching Strava streams for activity ${activityId}:`, error.message);
    return null;
  }
}

/**
 * Convert raw Strava stream data to our standard activity_streams format.
 * Steps: raw arrays → point objects → RDP simplification → parallel arrays.
 *
 * @param {Object} streamMap - { latlng: [[lat,lng],...], altitude: [...], watts: [...], ... }
 * @returns {{ coords, elevation?, power?, speed?, heartRate? } | null}
 */
export function convertStravaStreams(streamMap) {
  if (!streamMap) return null;

  const latlng = streamMap.latlng;
  if (!latlng || latlng.length < 2) return null;

  const altitudeData = streamMap.altitude;
  const wattsData = streamMap.watts;
  const hrData = streamMap.heartrate;
  const cadenceData = streamMap.cadence;
  const distanceData = streamMap.distance;
  const timeData = streamMap.time;

  // Step 1: Build point objects for RDP simplification
  // simplifyTrack expects { latitude, longitude, ... } with additional metric fields
  const points = [];
  for (let i = 0; i < latlng.length; i++) {
    const [lat, lng] = latlng[i];
    if (lat == null || lng == null) continue;

    // Derive instantaneous speed from distance/time deltas
    let speed = null;
    if (distanceData && timeData && i > 0) {
      const dt = timeData[i] - timeData[i - 1];
      const dd = distanceData[i] - distanceData[i - 1];
      speed = dt > 0 ? dd / dt : null; // m/s
    }

    points.push({
      latitude: lat,
      longitude: lng,
      elevation: altitudeData?.[i] ?? null,
      power: wattsData?.[i] ?? null,
      speed,
      heartRate: hrData?.[i] ?? null,
      cadence: cadenceData?.[i] ?? null,
    });
  }

  if (points.length < 2) return null;

  // Step 2: RDP simplification (same as Garmin FIT pipeline)
  // tolerance 0.0001 degrees ≈ 11m — keeps ~10% of points
  const simplified = simplifyTrack(points, 0.0001);

  if (!simplified || simplified.length < 2) return null;

  // Step 3: Convert simplified points → parallel arrays
  const coords = [];
  const elevation = [];
  const power = [];
  const speed = [];
  const heartRate = [];
  const cadence = [];

  let hasElevation = false;
  let hasPower = false;
  let hasSpeed = false;
  let hasHeartRate = false;

  for (const pt of simplified) {
    coords.push([pt.longitude, pt.latitude]); // [lng, lat] for GeoJSON/Mapbox
    elevation.push(pt.elevation ?? null);
    power.push(pt.power ?? null);
    speed.push(pt.speed ?? null);
    heartRate.push(pt.heartRate ?? null);
    cadence.push(pt.cadence ?? null);

    if (pt.elevation != null) hasElevation = true;
    if (pt.power != null) hasPower = true;
    if (pt.speed != null) hasSpeed = true;
    if (pt.heartRate != null) hasHeartRate = true;
  }

  // Only include streams that have actual data (matching fitParser.buildActivityStreams)
  const result = { coords };
  if (hasElevation) result.elevation = elevation;
  if (hasPower) result.power = power;
  if (hasSpeed) result.speed = speed;
  if (hasHeartRate) result.heartRate = heartRate;

  return result;
}

/**
 * Fetch Strava streams and store them in the activity_streams column.
 * Non-throwing — catches all errors and returns a result object.
 *
 * @param {Object} supabase - Supabase client (service role)
 * @param {string} dbActivityId - Our internal activity UUID
 * @param {string|number} stravaActivityId - Strava's numeric activity ID
 * @param {string} accessToken - Valid Strava access token
 * @param {string} activityType - Strava activity type (e.g. 'Ride', 'VirtualRide')
 * @returns {Promise<{success: boolean, pointCount?: number, reason?: string, rateLimited?: boolean}>}
 */
export async function fetchAndStoreStravaStreams(supabase, dbActivityId, stravaActivityId, accessToken, activityType) {
  try {
    // Skip virtual activities (no GPS streams)
    if (VIRTUAL_TYPES.includes(activityType)) {
      return { success: false, reason: 'virtual_activity' };
    }

    const streamMap = await fetchStravaStreams(stravaActivityId, accessToken);

    if (!streamMap) {
      return { success: false, reason: 'no_streams_available' };
    }

    if (streamMap.rateLimited) {
      return { success: false, reason: 'rate_limited', rateLimited: true };
    }

    const activityStreams = convertStravaStreams(streamMap);

    if (!activityStreams) {
      return { success: false, reason: 'insufficient_data' };
    }

    // Store in database
    const { error } = await supabase
      .from('activities')
      .update({ activity_streams: activityStreams })
      .eq('id', dbActivityId);

    if (error) {
      console.error(`❌ Failed to store streams for activity ${dbActivityId}:`, error.message);
      return { success: false, reason: 'db_error' };
    }

    console.log(`✅ Strava streams stored for activity ${dbActivityId}: ${activityStreams.coords.length} points`);
    return { success: true, pointCount: activityStreams.coords.length };

  } catch (error) {
    console.error(`⚠️ fetchAndStoreStravaStreams error for ${dbActivityId}:`, error.message);
    return { success: false, reason: error.message };
  }
}
