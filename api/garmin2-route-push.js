/**
 * Garmin Route Push — POST a Tribos route as a Course to Garmin Connect.
 * =========================================================================
 *
 * Phase 4 of the Garmin ping/pull rebuild. Lifts pushRoute from the
 * 1258-LoC api/garmin-auth.js into its own focused endpoint. The course
 * payload builder + coordinate conversion are unchanged from the original;
 * the differences are:
 *
 *   - Uses ensureValidAccessToken (mutex-aware) instead of the inline
 *     refreshGarminToken so token refresh races with the puller cron and
 *     token maintenance can't strand each other.
 *   - Filters the integration the same way every other garmin2-* reader
 *     does: provider='garmin' AND sync_enabled=true AND
 *     refresh_token_invalid=false. NEVER `.eq('status','active')` (the
 *     phantom column that made Phase 7 inert; see hotfix commit a8f3a43).
 *   - Single endpoint, single action. Frontend `garminService.pushRoute`
 *     repoints to this URL at Phase 6 cutover; the existing JSON contract
 *     is preserved.
 *
 * POST /api/garmin2-route-push
 *   Auth:  Bearer <supabase access_token> (user must be authenticated)
 *   Body:  { routeData: { name, description, coordinates: [[lng,lat,ele]...],
 *                         distance_km, elevation_gain_m, elevation_loss_m,
 *                         surfaceType } }
 *   Returns:
 *     200 { success: true, garminCourseId, message }
 *     400 { error: 'Route must have coordinates' | 'Invalid course data' }
 *     401 { error: ..., requiresReconnect: true }
 *     412 { error: ..., requiresReconnect: true } — COURSE_IMPORT permission
 *     503 { error: ..., code: 'COURSES_API_NOT_AVAILABLE' } — courses API
 *          disabled for this Garmin app; UI should fall back to TCX download
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { ensureValidAccessToken } from './utils/garmin/tokenManager.js';

const supabase = getSupabaseAdmin();

const GARMIN_COURSES_URL = 'https://apis.garmin.com/training-api/courses/v1/course';

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7));
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUser = await getUserFromAuthHeader(req);
  if (!authUser) return res.status(401).json({ error: 'Authentication required' });

  const { routeData } = req.body || {};
  if (!routeData) return res.status(400).json({ error: 'routeData required' });
  if (!Array.isArray(routeData.coordinates) || routeData.coordinates.length === 0) {
    return res.status(400).json({ error: 'Route must have coordinates' });
  }

  try {
    // Look up the user's Garmin integration. Same filter as the puller.
    const { data: integration, error: lookupErr } = await supabase
      .from('bike_computer_integrations')
      .select('id, user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, refresh_token_invalid, sync_enabled')
      .eq('user_id', authUser.id)
      .eq('provider', 'garmin')
      .eq('sync_enabled', true)
      .eq('refresh_token_invalid', false)
      .maybeSingle();

    if (lookupErr) {
      console.error('garmin2-route-push: integration lookup failed:', lookupErr);
      return res.status(500).json({ error: 'Internal error' });
    }
    if (!integration) {
      return res.status(400).json({
        error: 'Garmin not connected. Please connect your Garmin account first.',
        requiresConnection: true,
      });
    }

    let accessToken;
    try {
      accessToken = await ensureValidAccessToken(integration, supabase);
    } catch (tokenErr) {
      console.warn('garmin2-route-push: token refresh failed:', tokenErr.message);
      return res.status(401).json({
        error: 'Garmin authorization expired. Please reconnect your account.',
        requiresReconnect: true,
      });
    }

    const coursePayload = buildCoursePayload(routeData);

    const uploadRes = await fetch(GARMIN_COURSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(coursePayload),
    });

    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      return mapCourseError(res, uploadRes.status, body);
    }

    const result = await uploadRes.json();
    console.log(`✅ [ROUTE-PUSH] uploaded "${coursePayload.courseName}" (${coursePayload.geoPoints.length} points)`);

    return res.status(200).json({
      success: true,
      garminCourseId: result?.id || result?.courseId || null,
      message: 'Route uploaded to Garmin Connect',
    });
  } catch (err) {
    console.error('garmin2-route-push crashed:', err);
    return res.status(500).json({ error: 'Failed to send route to Garmin', details: err.message });
  }
}

/**
 * Map non-2xx upload responses to a structured error so the UI can branch
 * (reconnect prompt vs. fallback-to-TCX vs. retry).
 */
export function mapCourseError(res, status, body) {
  if (body.includes('ApplicationNotFound') || (status === 404 && body.includes('course-portal'))) {
    return res.status(503).json({
      error: 'Garmin Courses API is not enabled for this app. Download as TCX and import manually.',
      code: 'COURSES_API_NOT_AVAILABLE',
      details: body,
    });
  }
  if (status === 401 || status === 403) {
    return res.status(401).json({
      error: 'Garmin authorization failed. Please reconnect your account.',
      requiresReconnect: true,
      details: body,
    });
  }
  if (status === 412) {
    return res.status(412).json({
      error: 'Garmin user has not granted COURSE_IMPORT permission. Please disconnect and reconnect.',
      requiresReconnect: true,
      details: body,
    });
  }
  if (status === 400) {
    return res.status(400).json({ error: 'Invalid course data. Check the route and try again.', details: body });
  }
  return res.status(status).json({
    error: 'Failed to upload course to Garmin',
    garminStatus: status,
    details: body,
  });
}

// ============================================================================
// Pure helpers (lifted from api/garmin-auth.js#buildCoursePayload etc.)
// ============================================================================

/**
 * Build the Garmin Courses-API payload from internal routeData.
 *
 * Accepts canonical-suffixed fields (`distance_km`, `elevation_gain_m`,
 * `elevation_loss_m`) per CLAUDE.md distance-unit policy; falls back to
 * legacy unsuffixed aliases (`distanceKm`, `elevationGainM`, `elevationLossM`)
 * for callers that haven't migrated.
 *
 * Coordinates: internal canonical [lng, lat] (or [lng, lat, ele]) → Garmin's
 * { latitude, longitude, elevation }. Handled at this boundary per CLAUDE.md
 * coordinate-format policy.
 */
export function buildCoursePayload(routeData) {
  const distance_km = routeData.distance_km ?? routeData.distanceKm ?? 0;
  let distanceMeters = distance_km * 1000;
  if (distanceMeters === 0 && routeData.coordinates.length > 1) {
    distanceMeters = calculateRouteDistance(routeData.coordinates);
  }

  const geoPoints = routeData.coordinates.map((coord) => {
    const [lng, lat, ele] = coord.length === 3 ? coord : [coord[0], coord[1], 0];
    return { latitude: lat, longitude: lng, elevation: ele || 0 };
  });

  const elevation_gain_m = routeData.elevation_gain_m ?? routeData.elevationGainM ?? 0;
  const elevation_loss_m = routeData.elevation_loss_m ?? routeData.elevationLossM ?? 0;

  return {
    courseName: (routeData.name || 'Tribos Route').substring(0, 32),
    description: (routeData.description || 'Created with Tribos Studio').substring(0, 255),
    distance: Math.round(distanceMeters),
    elevationGain: Math.round(elevation_gain_m),
    elevationLoss: Math.round(elevation_loss_m),
    activityType: mapSurfaceToActivityType(routeData.surfaceType),
    coordinateSystem: 'WGS84',
    geoPoints,
  };
}

export function mapSurfaceToActivityType(surfaceType) {
  return ({
    paved: 'ROAD_CYCLING',
    gravel: 'GRAVEL_CYCLING',
    mixed: 'GRAVEL_CYCLING',
    trail: 'MOUNTAIN_BIKING',
    mountain: 'MOUNTAIN_BIKING',
  })[surfaceType?.toLowerCase()] || 'ROAD_CYCLING';
}

/**
 * Haversine distance in METERS. Mirror of haversineMeters() in
 * src/utils/distanceUnits.ts — kept inline because the Vercel serverless
 * runtime and the Vite browser bundle can't share that module without
 * additional build wiring. Keep these in sync.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRadians(degrees) { return degrees * (Math.PI / 180); }

export function calculateRouteDistance(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    total += haversineDistance(lat1, lng1, lat2, lng2);
  }
  return total;
}
