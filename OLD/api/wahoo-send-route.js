/**
 * Vercel API Route: Send Route to Wahoo ELEMNT
 *
 * Uploads routes created in the app to Wahoo Cloud API.
 * Routes will sync to connected Wahoo ELEMNT devices (BOLT, ROAM, etc.).
 *
 * Documentation: https://cloud-api.wahooligan.com/
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Wahoo API endpoints
const WAHOO_API_BASE = 'https://api.wahooligan.com/v1';
const WAHOO_TOKEN_URL = 'https://api.wahooligan.com/oauth/token';

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
    const { userId, routeId } = req.body;

    // Validate inputs
    if (!userId || !routeId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'userId and routeId are required'
      });
    }

    console.log(`📤 [Wahoo Route Upload] User: ${userId}, Route: ${routeId}`);

    // 1. Get Wahoo integration and verify connection
    const { data: integration, error: integrationError } = await supabase
      .from('bike_computer_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'wahoo')
      .single();

    if (integrationError || !integration) {
      console.error('❌ Wahoo integration not found:', integrationError);
      return res.status(404).json({
        error: 'Wahoo not connected',
        message: 'Please connect your Wahoo account first'
      });
    }

    if (!integration.sync_enabled) {
      return res.status(400).json({
        error: 'Sync disabled',
        message: 'Wahoo sync is currently disabled'
      });
    }

    // 2. Get route data with track points
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

    // 3. Get track points
    const { data: trackPoints, error: trackPointsError } = await supabase
      .from('track_points')
      .select('*')
      .eq('route_id', routeId)
      .order('point_index', { ascending: true });

    if (trackPointsError || !trackPoints || trackPoints.length === 0) {
      console.error('❌ No track points found:', trackPointsError);
      return res.status(400).json({
        error: 'No GPS data',
        message: 'This route has no GPS track data to send to Wahoo'
      });
    }

    console.log(`✅ Found route "${route.name}" with ${trackPoints.length} GPS points`);

    // 4. Check if token needs refresh
    let accessToken = integration.access_token;
    if (new Date(integration.token_expires_at) < new Date()) {
      console.log('🔄 Access token expired, refreshing...');
      accessToken = await refreshAccessToken(integration);
    }

    // 5. Mark route as pending sync
    await supabase
      .from('routes')
      .update({
        wahoo_sync_status: 'pending',
        wahoo_sync_error: null
      })
      .eq('id', routeId);

    // 6. Upload route to Wahoo
    let wahooResponse;
    try {
      wahooResponse = await uploadRouteToWahoo(accessToken, route, trackPoints);
    } catch (uploadError) {
      console.error('❌ Wahoo upload failed:', uploadError);

      // Update route with error status
      await supabase
        .from('routes')
        .update({
          wahoo_sync_status: 'error',
          wahoo_sync_error: uploadError.message
        })
        .eq('id', routeId);

      throw uploadError;
    }

    console.log('✅ Route uploaded to Wahoo successfully:', wahooResponse);

    // 7. Update route record with Wahoo route ID
    const { error: updateError } = await supabase
      .from('routes')
      .update({
        wahoo_route_id: wahooResponse.id?.toString() || null,
        wahoo_synced_at: new Date().toISOString(),
        wahoo_sync_status: 'success',
        wahoo_sync_error: null
      })
      .eq('id', routeId);

    if (updateError) {
      console.error('⚠️ Failed to update route with Wahoo route ID:', updateError);
    }

    // 8. Log sync history
    await supabase
      .from('bike_computer_sync_history')
      .insert({
        integration_id: integration.id,
        user_id: userId,
        provider: 'wahoo',
        activity_id: wahooResponse.id?.toString() || routeId,
        route_id: routeId,
        sync_status: 'success',
        sync_direction: 'export',
        activity_data: wahooResponse,
        synced_at: new Date().toISOString()
      });

    return res.status(200).json({
      success: true,
      message: 'Route sent to Wahoo successfully',
      routeId: wahooResponse.id,
      routeName: route.name
    });

  } catch (error) {
    console.error('❌ Wahoo route upload error:', error);

    // Log error to sync history if we have user/route info
    if (req.body.routeId && req.body.userId) {
      try {
        await supabase
          .from('routes')
          .update({
            wahoo_sync_status: 'error',
            wahoo_sync_error: error.message
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
 * Upload route to Wahoo Cloud API
 * Uses GPX format for route upload
 */
async function uploadRouteToWahoo(accessToken, route, trackPoints) {
  // Build GPX content
  const gpxContent = buildGPX(route, trackPoints);

  console.log(`📡 Uploading route to Wahoo: ${route.name} (${trackPoints.length} points)`);

  // Wahoo accepts routes via their routes endpoint
  // POST /v1/routes with GPX data
  const response = await fetch(`${WAHOO_API_BASE}/routes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/gpx+xml',
      'Accept': 'application/json'
    },
    body: gpxContent
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Check for specific error cases
    if (response.status === 401) {
      throw new Error('Wahoo authentication expired. Please reconnect your account.');
    }
    if (response.status === 403) {
      throw new Error('Wahoo access denied. Your account may not have route upload permissions.');
    }

    throw new Error(`Wahoo API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Build GPX content from route and track points
 */
function buildGPX(route, trackPoints) {
  const name = escapeXml(route.name || 'Unnamed Route');
  const desc = escapeXml(route.description || '');
  const timestamp = new Date().toISOString();

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="tribos.studio"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <desc>${desc}</desc>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
`;

  // Add track points
  for (const point of trackPoints) {
    const lat = point.latitude;
    const lon = point.longitude;
    const ele = point.elevation || 0;

    gpx += `      <trkpt lat="${lat}" lon="${lon}">
        <ele>${ele}</ele>
      </trkpt>
`;
  }

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Refresh expired access token
 */
async function refreshAccessToken(integration) {
  console.log('🔄 Refreshing Wahoo access token...');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.WAHOO_CLIENT_ID,
    client_secret: process.env.WAHOO_CLIENT_SECRET,
    refresh_token: integration.refresh_token
  });

  const response = await fetch(WAHOO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Wahoo access token: ${errorText}`);
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
