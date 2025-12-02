// Vercel API Route: Wahoo Activity Sync
// Fetches workouts from Wahoo and imports them to the database

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WAHOO_API_BASE = 'https://api.wahooligan.com/v1';

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
    return res.status(200).json({}).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, since, perPage = 50, page = 1 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'UserId required' });
    }

    // Get access token from database
    const { data: integration, error: tokenError } = await supabase
      .from('bike_computer_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'wahoo')
      .single();

    if (tokenError || !integration) {
      return res.status(404).json({ error: 'Wahoo not connected' });
    }

    if (!integration.sync_enabled) {
      return res.status(400).json({ error: 'Sync is disabled' });
    }

    // Check if token needs refresh
    const tokenExpiresAt = new Date(integration.token_expires_at);
    const now = new Date();

    if (tokenExpiresAt < now && integration.refresh_token) {
      // TODO: Implement token refresh for Wahoo
      // Wahoo tokens typically last a long time, but refresh logic would go here
      console.log('Wahoo token might be expired, refresh not yet implemented');
    }

    // Fetch workouts from Wahoo
    const workouts = await fetchWahooWorkouts(
      integration.access_token,
      { perPage, page, since }
    );

    console.log(`Fetched ${workouts.length} workouts from Wahoo`);

    // Filter for cycling workouts
    const cyclingWorkouts = workouts.filter(workout =>
      workout.workout_type_id === 1 || // Cycling
      workout.workout_type_id === 2 || // Indoor cycling
      workout.workout_type_id === 5    // Mountain biking
    );

    console.log(`Found ${cyclingWorkouts.length} cycling workouts`);

    // Get existing Wahoo workout IDs to avoid duplicates
    const { data: existingRoutes } = await supabase
      .from('routes')
      .select('wahoo_id')
      .eq('user_id', userId)
      .not('wahoo_id', 'is', null);

    const existingWahooIds = new Set(
      (existingRoutes || []).map(r => r.wahoo_id.toString())
    );

    // Import new workouts
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const workout of cyclingWorkouts) {
      try {
        // Skip if already imported
        if (existingWahooIds.has(workout.id.toString())) {
          console.log(`Skipping existing workout ${workout.id}`);
          skipped++;
          continue;
        }

        // Convert Wahoo workout to our route format
        const route = await convertWahooWorkout(workout, userId, integration.access_token);

        if (route) {
          // Insert route
          const { data: insertedRoute, error: routeError } = await supabase
            .from('routes')
            .insert([route])
            .select('id')
            .single();

          if (routeError) {
            console.error('Error inserting route:', routeError);
            errors.push({
              workoutId: workout.id,
              error: routeError.message
            });
            continue;
          }

          // Fetch and insert track points if available
          if (workout.has_gps && insertedRoute?.id) {
            try {
              const trackPoints = await fetchWahooTrackPoints(
                workout.id,
                integration.access_token
              );

              if (trackPoints && trackPoints.length > 0) {
                const trackPointsWithRouteId = trackPoints.map((point, index) => ({
                  route_id: insertedRoute.id,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  elevation: point.elevation || null,
                  time_seconds: point.time || index,
                  distance_m: point.distance || null,
                  point_index: index
                }));

                // Insert track points in batches
                const batchSize = 1000;
                for (let i = 0; i < trackPointsWithRouteId.length; i += batchSize) {
                  const batch = trackPointsWithRouteId.slice(i, i + batchSize);
                  const { error: trackError } = await supabase
                    .from('track_points')
                    .insert(batch);

                  if (trackError) {
                    console.error('Error inserting track points:', trackError);
                  }
                }

                console.log(`Imported ${trackPointsWithRouteId.length} track points for workout ${workout.id}`);
              }
            } catch (trackError) {
              console.error('Error fetching track points:', trackError);
              // Continue anyway - route is still imported
            }
          }

          imported++;
          console.log(`Successfully imported workout ${workout.id}`);
        }

      } catch (error) {
        console.error(`Error processing workout ${workout.id}:`, error);
        errors.push({
          workoutId: workout.id,
          error: error.message
        });
      }
    }

    // Record sync history
    const { error: historyError } = await supabase
      .from('bike_computer_sync_history')
      .insert([{
        user_id: userId,
        provider: 'wahoo',
        activities_fetched: cyclingWorkouts.length,
        activities_imported: imported,
        activities_skipped: skipped,
        sync_errors: errors.length > 0 ? errors : null,
        synced_at: new Date().toISOString()
      }]);

    if (historyError) {
      console.error('Error recording sync history:', historyError);
    }

    // Update last sync time
    await supabase
      .from('bike_computer_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'wahoo');

    return res.status(200).json({
      success: true,
      imported,
      skipped,
      total: cyclingWorkouts.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Wahoo sync error:', error);

    // Record sync error
    try {
      await supabase
        .from('bike_computer_integrations')
        .update({
          sync_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', req.body.userId)
        .eq('provider', 'wahoo');
    } catch (dbError) {
      console.error('Error recording sync error:', dbError);
    }

    return res.status(500).json({
      error: 'Sync failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Fetch workouts from Wahoo API
async function fetchWahooWorkouts(accessToken, options = {}) {
  const { perPage = 50, page = 1, since } = options;

  const params = new URLSearchParams({
    per_page: perPage.toString(),
    page: page.toString(),
    order: 'created_at'
  });

  if (since) {
    // Convert to ISO string if Date object
    const sinceDate = since instanceof Date ? since.toISOString() : since;
    params.append('since', sinceDate);
  }

  const response = await fetch(`${WAHOO_API_BASE}/workouts?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Wahoo workouts: ${error}`);
  }

  const data = await response.json();
  return data.workouts || [];
}

// Convert Wahoo workout to our route format
async function convertWahooWorkout(workout, userId, accessToken) {
  try {
    // Fetch detailed workout info if needed
    let detailedWorkout = workout;

    if (!workout.ascent && !workout.descent) {
      // Fetch full workout details
      const response = await fetch(`${WAHOO_API_BASE}/workouts/${workout.id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        detailedWorkout = await response.json();
      }
    }

    const route = {
      user_id: userId,
      name: detailedWorkout.name || `Wahoo Ride ${new Date(detailedWorkout.created_at).toLocaleDateString()}`,
      description: detailedWorkout.description || null,
      activity_type: 'ride',

      // Wahoo integration
      wahoo_id: detailedWorkout.id.toString(),
      imported_from: 'wahoo',

      // Core metrics
      distance_km: detailedWorkout.distance_meters ? detailedWorkout.distance_meters / 1000 : 0,
      duration_seconds: detailedWorkout.duration_seconds || 0,
      elevation_gain_m: detailedWorkout.ascent || 0,
      elevation_loss_m: detailedWorkout.descent || 0,

      // Performance metrics
      average_speed: detailedWorkout.distance_meters && detailedWorkout.duration_seconds
        ? (detailedWorkout.distance_meters / 1000) / (detailedWorkout.duration_seconds / 3600)
        : null,
      max_speed: detailedWorkout.speed_max ? detailedWorkout.speed_max * 3.6 : null, // m/s to km/h
      average_pace: null, // Calculate if needed

      // Heart rate data
      average_heartrate: detailedWorkout.heart_rate_avg || null,
      max_heartrate: detailedWorkout.heart_rate_max || null,

      // Power data
      average_watts: detailedWorkout.power_avg || null,
      max_watts: detailedWorkout.power_max || null,
      kilojoules: detailedWorkout.work ? detailedWorkout.work / 1000 : null,

      // Location data (if available)
      start_latitude: detailedWorkout.start_lat || null,
      start_longitude: detailedWorkout.start_lon || null,

      // Data availability flags
      has_gps_data: !!detailedWorkout.has_gps,
      track_points_count: 0, // Will be updated when track points are inserted
      has_heart_rate_data: !!detailedWorkout.heart_rate_avg,
      has_power_data: !!detailedWorkout.power_avg,

      // Timing
      recorded_at: detailedWorkout.created_at,
      uploaded_at: detailedWorkout.updated_at || detailedWorkout.created_at,

      // File info
      filename: `wahoo_${detailedWorkout.id}.json`,

      // External links
      wahoo_url: `https://www.wahoofitness.com/workouts/${detailedWorkout.id}`
    };

    return route;

  } catch (error) {
    console.error('Error converting Wahoo workout:', error);
    throw error;
  }
}

// Fetch GPS track points for a workout
async function fetchWahooTrackPoints(workoutId, accessToken) {
  try {
    // Wahoo provides workout file download
    const response = await fetch(`${WAHOO_API_BASE}/workouts/${workoutId}/file`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch workout file: ${response.statusText}`);
    }

    // The response should be a FIT file or similar
    // For now, we'll try to parse the response
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      // Some endpoints might return JSON with track data
      const data = await response.json();

      if (data.track_points) {
        return data.track_points;
      }
    }

    // If FIT file, we'd need a FIT parser here
    // For now, return empty array - this can be enhanced later
    console.log('Workout file parsing not yet implemented for format:', contentType);
    return [];

  } catch (error) {
    console.error('Error fetching Wahoo track points:', error);
    return [];
  }
}
