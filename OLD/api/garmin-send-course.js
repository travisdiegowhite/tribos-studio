/**
 * Vercel API Route: Send Route to Garmin Connect as Course
 *
 * Uploads routes created in the app to Garmin Connect using the Garmin Course API.
 * Routes will sync to all connected Garmin devices (Edge, Fenix, Forerunner, etc.).
 *
 * Documentation: https://developer.garmin.com/gc-developer-program/course-api/
 */

import { createClient } from '@supabase/supabase-js';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Garmin API endpoints
const GARMIN_COURSE_API_BASE = 'https://apis.garmin.com/course-api/course';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';

// CORS configuration
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Main API handler
 */
export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, routeId, uploadFormat = 'json' } = req.body;

    // Validate inputs
    if (!userId || !routeId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'userId and routeId are required'
      });
    }

    if (!['json', 'gpx', 'fit'].includes(uploadFormat)) {
      return res.status(400).json({
        error: 'Invalid upload format',
        message: 'uploadFormat must be json, gpx, or fit'
      });
    }

    console.log(`📤 [Garmin Course Upload] User: ${userId}, Route: ${routeId}, Format: ${uploadFormat}`);

    // 1. Get Garmin integration and verify connection
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single();

    if (integrationError || !integration) {
      console.error('❌ Garmin integration not found:', integrationError);
      return res.status(404).json({
        error: 'Garmin not connected',
        message: 'Please connect your Garmin account first'
      });
    }

    if (!integration.sync_enabled) {
      return res.status(400).json({
        error: 'Sync disabled',
        message: 'Garmin sync is currently disabled'
      });
    }

    // 2. Verify Course API scope is granted (if scope info is available)
    // Note: Scope verification depends on OAuth implementation
    const scopes = integration.provider_user_data?.scope || '';
    if (scopes && !scopes.includes('COURSE')) {
      console.warn('⚠️ User may not have COURSE scope');
      // Don't block upload - let Garmin API return error if scope is missing
    }

    // 3. Get route data with track points
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('*')
      .eq('id', routeId)
      .eq('user_id', userId)
      .single();

    if (routeError || !route) {
      console.error('❌ Route not found:', routeError);
      return res.status(404).json({
        error: 'Route not found',
        message: 'The requested route does not exist or you do not have access to it'
      });
    }

    // 4. Get track points
    const { data: trackPoints, error: trackPointsError } = await supabase
      .from('track_points')
      .select('*')
      .eq('route_id', routeId)
      .order('point_index', { ascending: true });

    if (trackPointsError || !trackPoints || trackPoints.length === 0) {
      console.error('❌ No track points found:', trackPointsError);
      return res.status(400).json({
        error: 'No GPS data',
        message: 'This route has no GPS track data to send to Garmin'
      });
    }

    console.log(`✅ Found route "${route.name}" with ${trackPoints.length} GPS points`);

    // 5. Check if token needs refresh
    let accessToken = integration.access_token;
    if (new Date(integration.token_expires_at) < new Date()) {
      console.log('🔄 Access token expired, refreshing...');
      accessToken = await refreshAccessToken(integration);
    }

    // 6. Mark route as pending sync
    await supabase
      .from('routes')
      .update({
        garmin_sync_status: 'pending',
        garmin_sync_error: null
      })
      .eq('id', routeId);

    // 7. Upload to Garmin based on selected format
    let garminResponse;
    try {
      if (uploadFormat === 'json') {
        garminResponse = await uploadCourseJSON(accessToken, route, trackPoints);
      } else if (uploadFormat === 'gpx') {
        garminResponse = await uploadCourseGPX(accessToken, route, trackPoints);
      } else if (uploadFormat === 'fit') {
        garminResponse = await uploadCourseFIT(accessToken, route, trackPoints);
      }
    } catch (uploadError) {
      console.error('❌ Garmin upload failed:', uploadError);

      // Update route with error status
      await supabase
        .from('routes')
        .update({
          garmin_sync_status: 'error',
          garmin_sync_error: uploadError.message
        })
        .eq('id', routeId);

      throw uploadError;
    }

    console.log('✅ Route uploaded to Garmin successfully:', garminResponse);

    // 8. Update route record with Garmin course ID
    const { error: updateError } = await supabase
      .from('routes')
      .update({
        garmin_course_id: garminResponse.courseId?.toString() || null,
        garmin_synced_at: new Date().toISOString(),
        garmin_sync_status: 'success',
        garmin_sync_error: null
      })
      .eq('id', routeId);

    if (updateError) {
      console.error('⚠️ Failed to update route with Garmin course ID:', updateError);
    }

    // 9. Log sync history
    await supabase
      .from('bike_computer_sync_history')
      .insert({
        integration_id: integration.id,
        user_id: userId,
        provider: 'garmin',
        activity_id: garminResponse.courseId?.toString() || routeId,
        route_id: routeId,
        sync_status: 'success',
        sync_direction: 'export',
        activity_data: garminResponse,
        synced_at: new Date().toISOString()
      });

    return res.status(200).json({
      success: true,
      message: 'Route sent to Garmin successfully',
      courseId: garminResponse.courseId,
      courseName: route.name,
      format: uploadFormat
    });

  } catch (error) {
    console.error('❌ Garmin course upload error:', error);

    // Log error to sync history if we have user/route info
    if (req.body.routeId && req.body.userId) {
      try {
        await supabase
          .from('routes')
          .update({
            garmin_sync_status: 'error',
            garmin_sync_error: error.message
          })
          .eq('id', req.body.routeId);
      } catch (dbError) {
        console.error('Failed to log error:', dbError);
      }
    }

    return res.status(500).json({
      error: 'Upload failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Upload course as JSON (Garmin Course API native format)
 */
async function uploadCourseJSON(accessToken, route, trackPoints) {
  const courseData = {
    courseName: route.name || 'Unnamed Route',
    description: route.description || '',
    distance: Math.round((route.distance_km || 0) * 1000), // Convert km to meters
    elevationGain: Math.round(route.elevation_gain_m || 0),
    elevationLoss: Math.round(route.elevation_loss_m || 0),
    activityType: mapActivityTypeToGarmin(route.activity_type),
    coordinateSystem: 'WGS84',
    geoPoints: trackPoints.map(point => ({
      latitude: point.latitude,
      longitude: point.longitude,
      elevation: point.elevation || 0
    }))
  };

  console.log(`📡 Uploading course via JSON: ${courseData.courseName} (${courseData.geoPoints.length} points)`);

  const response = await fetch(GARMIN_COURSE_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(courseData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garmin API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Upload course as GPX file
 */
async function uploadCourseGPX(accessToken, route, trackPoints) {
  // Dynamically import GPX utility (ES modules)
  const { pointsToGPX } = await import('../src/utils/gpx.js');

  // Convert track points to [lon, lat] format for GPX
  const points = trackPoints.map(p => [p.longitude, p.latitude]);
  const gpxContent = pointsToGPX(points, {
    name: route.name || 'Unnamed Route',
    creator: 'Cycling AI App'
  });

  console.log(`📡 Uploading course via GPX: ${route.name} (${points.length} points)`);

  const formData = new FormData();
  formData.append('file', Buffer.from(gpxContent), {
    filename: `${route.name || 'route'}.gpx`,
    contentType: 'application/gpx+xml'
  });

  const response = await fetch(`${GARMIN_COURSE_API_BASE}/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garmin GPX upload error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Upload course as FIT file
 */
async function uploadCourseFIT(accessToken, route, trackPoints) {
  // Dynamically import FIT utility
  const { generateFitCourse } = await import('../src/utils/fitCourse.js');

  console.log(`📡 Uploading course via FIT: ${route.name} (${trackPoints.length} points)`);

  const fitBuffer = generateFitCourse(route, trackPoints);

  const formData = new FormData();
  formData.append('file', fitBuffer, {
    filename: `${route.name || 'route'}.fit`,
    contentType: 'application/octet-stream'
  });

  const response = await fetch(`${GARMIN_COURSE_API_BASE}/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garmin FIT upload error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Map app activity types to Garmin activity type enums
 */
function mapActivityTypeToGarmin(activityType) {
  const mapping = {
    'ride': 'ROAD_CYCLING',
    'road_ride': 'ROAD_CYCLING',
    'road_biking': 'ROAD_CYCLING',
    'gravel_ride': 'GRAVEL_CYCLING',
    'gravel_cycling': 'GRAVEL_CYCLING',
    'mountain_bike': 'MOUNTAIN_BIKING',
    'mountain_biking': 'MOUNTAIN_BIKING',
    'cyclocross': 'CYCLOCROSS',
    'indoor_cycling': 'CYCLING',
    'virtual_ride': 'CYCLING',
    'run': 'RUNNING',
    'walk': 'WALKING',
    'hike': 'HIKING'
  };

  const normalized = activityType?.toLowerCase() || 'ride';
  return mapping[normalized] || 'ROAD_CYCLING';
}

/**
 * Refresh expired access token
 */
async function refreshAccessToken(integration) {
  console.log('🔄 Refreshing Garmin access token...');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GARMIN_CONSUMER_KEY,
    client_secret: process.env.GARMIN_CONSUMER_SECRET,
    refresh_token: integration.refresh_token
  });

  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Garmin access token: ${errorText}`);
  }

  const tokenData = await response.json();

  // Update token in database
  const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: expiresAt
    })
    .eq('id', integration.id);

  console.log('✅ Token refreshed successfully');
  return tokenData.access_token;
}
