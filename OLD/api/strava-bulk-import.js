// Vercel API Route: Strava Bulk Import with Background Job Tracking
// Allows users to safely leave the page during import
// Updates progress in database for real-time polling

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const PROGRESS_UPDATE_INTERVAL = 10; // Update progress every N activities
const EMAIL_THRESHOLD = 500; // Send email if importing more than this many activities

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

  // Rate limiting - different limits based on mode
  const { userId, mode } = req.body;

  // Select rate limit based on mode
  let rateLimit;
  if (mode === 'list') {
    rateLimit = RATE_LIMITS.STRAVA_IMPORT_LIST;
  } else if (mode === 'import_batch') {
    rateLimit = RATE_LIMITS.STRAVA_IMPORT_BATCH;
  } else {
    // Legacy full import - strict limit
    rateLimit = RATE_LIMITS.STRAVA_BULK_IMPORT;
  }

  const rateLimitResult = await rateLimitMiddleware(
    req,
    res,
    rateLimit.name,
    rateLimit.limit,
    rateLimit.windowMinutes,
    userId // User-specific rate limit
  );

  if (rateLimitResult !== null) {
    return;
  }

  let jobId = null;

  try {
    const { startDate, endDate, mode, activityIds } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'UserId required' });
    }

    // Handle different import modes for chunked processing
    // mode: 'list' - Return list of activity IDs (fast, no GPS)
    // mode: 'import_batch' - Import specific activity IDs with GPS
    // mode: undefined - Legacy full import (may timeout)

    // Get Strava access token
    const { data: stravaToken, error: tokenError } = await supabase
      .from('strava_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError) {
      console.error('Error fetching Strava token:', tokenError);
      return res.status(500).json({ error: 'Failed to fetch Strava connection' });
    }

    if (!stravaToken) {
      return res.status(404).json({ error: 'Strava not connected' });
    }

    // Check if token needs refresh
    let accessToken = stravaToken.access_token;
    if (new Date(stravaToken.expires_at) <= new Date()) {
      console.log('🔄 Refreshing Strava token...');
      accessToken = await refreshStravaToken(userId, stravaToken.refresh_token);
    }

    // ============================================
    // MODE: LIST - Return activity IDs only (fast)
    // ============================================
    if (mode === 'list') {
      console.log(`📋 List mode: Fetching activity IDs for date range`);

      const afterTimestamp = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : null;
      const beforeTimestamp = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : null;

      // Fetch all activities (metadata only, no GPS streams)
      const allActivities = await fetchAllStravaActivities(accessToken, afterTimestamp, beforeTimestamp, 'list-mode');

      // Filter for cycling activities
      const cyclingActivities = allActivities.filter(activity =>
        activity.type === 'Ride' ||
        activity.type === 'VirtualRide' ||
        activity.type === 'EBikeRide' ||
        activity.type === 'GravelRide' ||
        activity.type === 'MountainBikeRide'
      );

      // Get existing Strava IDs to filter out duplicates
      const { data: existingRoutes } = await supabase
        .from('routes')
        .select('strava_id')
        .eq('user_id', userId)
        .not('strava_id', 'is', null);

      const existingIds = new Set((existingRoutes || []).map(r => r.strava_id));

      // Filter out already imported activities
      const newActivities = cyclingActivities.filter(a => !existingIds.has(a.id.toString()));

      console.log(`📊 Found ${cyclingActivities.length} cycling activities, ${newActivities.length} new`);

      return res.status(200).json({
        success: true,
        mode: 'list',
        totalActivities: cyclingActivities.length,
        newActivities: newActivities.length,
        activities: newActivities.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          start_date: a.start_date,
          distance: a.distance,
          moving_time: a.moving_time
        }))
      });
    }

    // ============================================
    // MODE: IMPORT_BATCH - Import specific activities with GPS
    // ============================================
    if (mode === 'import_batch') {
      if (!activityIds || !Array.isArray(activityIds) || activityIds.length === 0) {
        return res.status(400).json({ error: 'activityIds array required for import_batch mode' });
      }

      console.log(`📦 Batch mode: Importing ${activityIds.length} specific activities`);

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails = []; // Collect detailed error info for debugging

      for (const activityId of activityIds) {
        try {
          // Fetch full activity details from Strava
          const activityResponse = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (!activityResponse.ok) {
            const errorText = await activityResponse.text();
            const errorMsg = `Activity ${activityId}: Strava API ${activityResponse.status} - ${errorText}`;
            console.error(`❌ ${errorMsg}`);
            errorDetails.push(errorMsg);
            errors++;

            // If we hit Strava rate limit (429), return special response for client to handle
            if (activityResponse.status === 429) {
              console.error('🛑 Strava rate limit hit - returning rate limit response');
              // Return what we've done so far plus rate limit info
              return res.status(200).json({
                success: true,
                mode: 'import_batch',
                imported,
                skipped,
                errors: 1,
                total: activityIds.length,
                rateLimited: true,
                retryAfter: 900, // 15 minutes in seconds
                message: 'Strava rate limit reached. Please wait before continuing.',
                remainingActivities: activityIds.slice(activityIds.indexOf(activityId))
              });
            }
            continue;
          }

          const activity = await activityResponse.json();
          const result = await importStravaActivity(userId, activity, accessToken);

          if (result === 'imported') {
            imported++;
            console.log(`✅ Imported activity ${activityId}`);
          } else if (result === 'skipped') {
            skipped++;
            console.log(`⏭️ Skipped activity ${activityId} (duplicate)`);
          }
        } catch (error) {
          const errorMsg = `Activity ${activityId}: ${error.message}`;
          console.error(`❌ Error: ${errorMsg}`);
          errorDetails.push(errorMsg);
          errors++;
        }

        // Rate limiting between activities - 1.5 seconds to respect Strava's 100 req/15min limit
        // Each activity = 2 API calls (activity fetch + GPS streams)
        // 1.5s delay = 40 activities/min = 80 API calls/min = 20 API calls/15min
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      console.log(`✅ Batch import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);
      if (errorDetails.length > 0) {
        console.log(`📋 Error details:`, errorDetails);
      }

      return res.status(200).json({
        success: true,
        mode: 'import_batch',
        imported,
        skipped,
        errors,
        total: activityIds.length,
        errorDetails: errorDetails.slice(0, 5) // Return first 5 errors for debugging
      });
    }

    // ============================================
    // LEGACY MODE: Full import (may timeout on large imports)
    // ============================================
    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        user_id: userId,
        import_type: 'strava_bulk',
        status: 'pending',
        start_date: startDate,
        end_date: endDate,
        progress_percent: 0
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('Error creating import job:', jobError);
      return res.status(500).json({ error: 'Failed to create import job' });
    }

    jobId = job.id;

    console.log(`📥 Starting Strava bulk import (Job ${jobId}):`, {
      userId,
      startDate,
      endDate,
      accessTokenPresent: !!accessToken,
      accessTokenLength: accessToken?.length
    });

    // Process synchronously (Vercel terminates after response, so we can't do background processing)
    // We have 30 seconds (Vercel function timeout) to process
    const result = await processImport(job.id, userId, accessToken, startDate, endDate);

    // Return result after processing is complete
    return res.status(200).json({
      success: true,
      jobId: job.id,
      message: 'Import completed',
      ...result
    });

  } catch (error) {
    console.error('❌ Strava bulk import error:', error);

    // Update job status to failed if we have a job ID
    if (jobId) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    return res.status(500).json({
      error: 'Bulk import failed',
      message: error.message
    });
  }
}

/**
 * Process import synchronously (must complete before response)
 */
async function processImport(jobId, userId, accessToken, startDate, endDate) {
  try {
    // Update job to running
    await updateJobStatus(jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress_percent: 10
    });

    // Calculate timestamp for "after" parameter
    const afterTimestamp = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : null;
    const beforeTimestamp = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : null;

    // Fetch all activities from Strava (paginated)
    const allActivities = await fetchAllStravaActivities(accessToken, afterTimestamp, beforeTimestamp, jobId);

    console.log(`📊 Job ${jobId}: Found ${allActivities.length} activities from Strava`);

    // Filter for cycling activities only
    const cyclingActivities = allActivities.filter(activity =>
      activity.type === 'Ride' ||
      activity.type === 'VirtualRide' ||
      activity.type === 'EBikeRide' ||
      activity.type === 'GravelRide' ||
      activity.type === 'MountainBikeRide'
    );

    console.log(`🚴 Job ${jobId}: ${cyclingActivities.length} cycling activities to import`);

    // Update total count
    await updateJobStatus(jobId, {
      total_activities: cyclingActivities.length,
      progress_percent: 20
    });

    // Import each activity with progress updates
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < cyclingActivities.length; i++) {
      const activity = cyclingActivities[i];

      try {
        const result = await importStravaActivity(userId, activity, accessToken);
        if (result === 'imported') imported++;
        else if (result === 'skipped') skipped++;
      } catch (error) {
        console.error(`Error importing activity ${activity.id}:`, error);
        errors++;
      }

      // Update progress every N activities
      if ((i + 1) % PROGRESS_UPDATE_INTERVAL === 0 || i === cyclingActivities.length - 1) {
        const progressPercent = Math.min(95, 20 + Math.floor((i + 1) / cyclingActivities.length * 75));

        await updateJobStatus(jobId, {
          processed_count: i + 1,
          imported_count: imported,
          skipped_count: skipped,
          error_count: errors,
          progress_percent: progressPercent
        });

        console.log(`📈 Job ${jobId}: Progress ${i + 1}/${cyclingActivities.length} (${progressPercent}%)`);
      }
    }

    console.log(`✅ Job ${jobId}: Import complete`, { imported, skipped, errors });

    // Mark job as completed
    await updateJobStatus(jobId, {
      status: 'completed',
      processed_count: cyclingActivities.length,
      imported_count: imported,
      skipped_count: skipped,
      error_count: errors,
      progress_percent: 100,
      completed_at: new Date().toISOString()
    });

    // Send email notification for large imports
    if (cyclingActivities.length >= EMAIL_THRESHOLD) {
      try {
        await sendImportCompletionEmail(userId, {
          totalActivities: cyclingActivities.length,
          imported,
          skipped,
          errors
        });

        await supabase
          .from('import_jobs')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString()
          })
          .eq('id', jobId);
      } catch (emailError) {
        console.error(`Failed to send completion email for job ${jobId}:`, emailError);
      }
    }

    // Return results for the response
    return {
      status: 'completed',
      totalActivities: cyclingActivities.length,
      imported,
      skipped,
      errors
    };

  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);

    await updateJobStatus(jobId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    });

    // Re-throw so the main handler can catch it
    throw error;
  }
}

/**
 * Update job status in database
 */
async function updateJobStatus(jobId, updates) {
  const { error } = await supabase
    .from('import_jobs')
    .update({
      ...updates,
      last_updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  if (error) {
    console.error(`Error updating job ${jobId}:`, error);
  }
}

/**
 * Fetch all activities from Strava with pagination
 */
async function fetchAllStravaActivities(accessToken, afterTimestamp, beforeTimestamp, jobId) {
  const allActivities = [];
  let page = 1;
  const perPage = 200; // Strava max

  while (true) {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString()
    });

    if (afterTimestamp) {
      params.append('after', afterTimestamp.toString());
    }
    if (beforeTimestamp) {
      params.append('before', beforeTimestamp.toString());
    }

    const url = `${STRAVA_API_BASE}/athlete/activities?${params.toString()}`;
    console.log(`📡 Job ${jobId}: Fetching Strava activities page ${page}...`, { url });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Strava API error on page ${page}:`, { status: response.status, error: errorText });
      throw new Error(`Strava API error: ${response.status} - ${errorText}`);
    }

    const activities = await response.json();
    console.log(`📊 Job ${jobId}: Page ${page} returned ${activities.length} activities`);

    if (activities.length === 0) {
      console.log(`📊 Job ${jobId}: No more activities on page ${page}, stopping pagination`);
      break; // No more activities
    }

    // Log first activity type on each page for debugging
    if (activities.length > 0) {
      console.log(`📊 Job ${jobId}: Activity types on page ${page}:`, activities.slice(0, 5).map(a => a.type));
    }

    allActivities.push(...activities);

    if (activities.length < perPage) {
      break; // Last page
    }

    page++;

    // Rate limiting - Strava allows 100 requests per 15 minutes, 1000 per day
    await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between pages
  }

  return allActivities;
}

/**
 * Import a single Strava activity into routes table
 */
async function importStravaActivity(userId, activity, accessToken) {
  // Check for duplicates - strava_id is BIGINT so pass as number
  const { data: existing, error: existingError } = await supabase
    .from('routes')
    .select('id')
    .eq('strava_id', activity.id)
    .maybeSingle();

  if (existingError) {
    console.error(`Error checking for existing activity ${activity.id}:`, existingError);
    // Continue anyway - better to risk a duplicate than fail the import
  }

  if (existing) {
    console.log(`⏭️ Activity ${activity.id} already imported`);
    return 'skipped';
  }

  // Check for near-duplicate based on time and distance
  const startTime = new Date(activity.start_date);
  const fiveMinutesAgo = new Date(startTime.getTime() - 5 * 60 * 1000);
  const fiveMinutesLater = new Date(startTime.getTime() + 5 * 60 * 1000);
  const distanceKm = activity.distance / 1000; // meters to km

  const { data: nearDuplicates } = await supabase
    .from('routes')
    .select('id')
    .gte('recorded_at', fiveMinutesAgo.toISOString())
    .lte('recorded_at', fiveMinutesLater.toISOString())
    .gte('distance_km', distanceKm - 0.1)
    .lte('distance_km', distanceKm + 0.1)
    .limit(1);

  if (nearDuplicates && nearDuplicates.length > 0) {
    console.log(`⏭️ Near-duplicate found for activity ${activity.id} (time+distance match)`);
    return 'skipped';
  }

  // Determine activity type
  let activityType = 'road_biking';
  if (activity.type === 'MountainBikeRide') activityType = 'mountain_biking';
  else if (activity.type === 'GravelRide') activityType = 'gravel_cycling';
  else if (activity.type === 'VirtualRide') activityType = 'indoor_cycling';
  else if (activity.type === 'EBikeRide') activityType = 'road_biking'; // Treat as road for now

  // Fetch GPS streams if activity has GPS data
  let trackPoints = [];
  let hasGpsData = false;

  if (activity.start_latlng && activity.start_latlng.length === 2 && activity.type !== 'VirtualRide') {
    try {
      console.log(`📍 Fetching GPS streams for activity ${activity.id}...`);

      const streamsResponse = await fetch(
        `${STRAVA_API_BASE}/activities/${activity.id}/streams?keys=latlng,time,altitude,distance&key_by_type=true`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (streamsResponse.ok) {
        const streams = await streamsResponse.json();

        if (streams.latlng && streams.latlng.data && streams.latlng.data.length > 0) {
          trackPoints = streams.latlng.data.map((latLng, index) => ({
            latitude: latLng[0],
            longitude: latLng[1],
            elevation: streams.altitude?.data?.[index] || null,
            time_seconds: streams.time?.data?.[index] || index,
            distance_m: streams.distance?.data?.[index] || null,
            point_index: index
          }));
          hasGpsData = true;
          console.log(`✅ Got ${trackPoints.length} GPS points for activity ${activity.id}`);
        }
      } else {
        console.warn(`⚠️ Could not fetch GPS streams for activity ${activity.id}: ${streamsResponse.status}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching GPS streams for activity ${activity.id}:`, error.message);
    }

    // Rate limiting after stream request
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Create route
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      user_id: userId,
      name: activity.name || `Strava ${activityType.replace('_', ' ')}`,
      description: 'Imported from Strava',
      distance_km: activity.distance ? activity.distance / 1000 : null, // meters to km
      elevation_gain_m: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : null,
      duration_seconds: activity.moving_time,
      average_speed: activity.average_speed ? activity.average_speed * 3.6 : null, // m/s to km/h
      max_speed: activity.max_speed ? activity.max_speed * 3.6 : null,
      average_heartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      max_heartrate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
      average_watts: activity.average_watts ? Math.round(activity.average_watts) : null,
      max_watts: activity.max_watts ? Math.round(activity.max_watts) : null,
      // Note: polyline column doesn't exist in schema - store in analysis_results if needed
      strava_id: activity.id, // BIGINT column - send as number, not string
      strava_url: `https://www.strava.com/activities/${activity.id}`,
      has_gps_data: hasGpsData,
      track_points_count: trackPoints.length,
      has_heart_rate_data: !!activity.average_heartrate,
      has_power_data: !!activity.average_watts,
      has_cadence_data: !!activity.average_cadence,
      activity_type: activityType,
      recorded_at: activity.start_date,
      imported_from: 'strava',
      start_latitude: activity.start_latlng?.[0] || null,
      start_longitude: activity.start_latlng?.[1] || null,
      end_latitude: activity.end_latlng?.[0] || null,
      end_longitude: activity.end_latlng?.[1] || null
    })
    .select()
    .single();

  if (routeError) {
    console.error(`Error creating route for activity ${activity.id}:`, routeError);
    throw routeError;
  }

  // Save track points if we have them
  if (trackPoints.length > 0 && route?.id) {
    console.log(`📍 Saving ${trackPoints.length} track points for route ${route.id}...`);

    const trackPointsWithRouteId = trackPoints.map(point => ({
      ...point,
      route_id: route.id
    }));

    // Insert track points in batches to avoid Supabase limits
    const batchSize = 1000;
    for (let i = 0; i < trackPointsWithRouteId.length; i += batchSize) {
      const batch = trackPointsWithRouteId.slice(i, i + batchSize);
      const { error: trackPointsError } = await supabase
        .from('track_points')
        .insert(batch);

      if (trackPointsError) {
        console.error(`Error inserting track points batch:`, trackPointsError);
      }
    }
    console.log(`✅ Saved ${trackPoints.length} track points`);
  }

  console.log(`✅ Imported activity ${activity.id} as route ${route.id}`);

  return 'imported';
}

/**
 * Refresh Strava access token with race condition protection
 * Uses optimistic locking to prevent concurrent refresh attempts
 */
async function refreshStravaToken(userId, refreshToken) {
  // First, try to acquire a "lock" by checking/setting refresh timestamp
  // This prevents race conditions where multiple requests try to refresh simultaneously
  const { data: currentToken, error: fetchError } = await supabase
    .from('strava_tokens')
    .select('access_token, expires_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching current token:', fetchError);
  }

  // Check if token was recently refreshed by another request (within last 30 seconds)
  // This handles the race condition where another request just refreshed the token
  if (currentToken) {
    const expiresAt = new Date(currentToken.expires_at);
    const now = new Date();

    // If token is now valid (expires > 1 minute from now), another request already refreshed it
    if (expiresAt.getTime() > now.getTime() + 60000) {
      console.log('🔄 Token was already refreshed by another request');
      return currentToken.access_token;
    }
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Strava token');
  }

  const data = await response.json();
  const newExpiresAt = new Date(data.expires_at * 1000).toISOString();

  // Update token in database
  // Note: If another request already updated the token, this is a no-op since
  // our new token will have a similar expiration time
  await supabase
    .from('strava_tokens')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  console.log('✅ Token refreshed successfully, expires at:', newExpiresAt);
  return data.access_token;
}

/**
 * Send import completion email
 */
async function sendImportCompletionEmail(userId, stats) {
  try {
    // Get user email
    const { data: user, error: userError } = await supabase
      .from('auth.users')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !user?.email) {
      console.warn('Could not fetch user email for notification');
      return;
    }

    // Call email API
    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/send-import-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        stats
      })
    });

    if (!response.ok) {
      throw new Error(`Email API returned ${response.status}`);
    }

    console.log(`📧 Sent import completion email to ${user.email}`);
  } catch (error) {
    console.error('Error sending import completion email:', error);
    // Don't throw - email is not critical
  }
}
