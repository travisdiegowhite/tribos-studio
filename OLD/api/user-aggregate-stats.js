const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * API endpoint to calculate aggregate user statistics for onboarding "aha moment"
 * POST /api/user-aggregate-stats
 * Body: { userId: string }
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Query aggregate statistics from routes table
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select('distance_km, elevation_gain_m, duration_seconds, recorded_at, name, activity_type')
      .eq('user_id', userId)
      .not('recorded_at', 'is', null)
      .order('recorded_at', { ascending: true });

    if (routesError) {
      console.error('Error fetching routes:', routesError);
      return res.status(500).json({ error: 'Failed to fetch routes', details: routesError.message });
    }

    // Handle case with no data
    if (!routes || routes.length === 0) {
      return res.status(200).json({
        success: true,
        hasData: false,
        stats: {
          totalRides: 0,
          totalMiles: 0,
          totalElevationFeet: 0,
          totalTimeHours: 0,
          longestRide: null,
          yearsOfData: 0,
          firstRideDate: null,
          mostCommonDay: null,
          sweetSpotDistance: null,
          everestMultiple: 0,
        },
      });
    }

    // Calculate aggregates
    let totalDistanceKm = 0;
    let totalElevationM = 0;
    let totalDurationSec = 0;
    let longestRide = null;
    let maxDistanceKm = 0;
    const dayCount = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const distanceBuckets = {
      '0-10': 0,
      '10-20': 0,
      '20-30': 0,
      '30-40': 0,
      '40-50': 0,
      '50-75': 0,
      '75-100': 0,
      '100+': 0,
    };
    const activityTypes = {};

    routes.forEach(route => {
      const distanceKm = route.distance_km || 0;
      const elevationM = route.elevation_gain_m || 0;
      const durationSec = route.duration_seconds || 0;

      totalDistanceKm += distanceKm;
      totalElevationM += elevationM;
      totalDurationSec += durationSec;

      // Track longest ride
      if (distanceKm > maxDistanceKm) {
        maxDistanceKm = distanceKm;
        longestRide = {
          miles: Math.round(distanceKm * 0.621371 * 10) / 10,
          name: route.name,
          date: route.recorded_at,
        };
      }

      // Track day of week
      if (route.recorded_at) {
        const dayOfWeek = new Date(route.recorded_at).getDay();
        dayCount[dayOfWeek]++;
      }

      // Track distance distribution (in miles)
      const distanceMiles = distanceKm * 0.621371;
      if (distanceMiles < 10) distanceBuckets['0-10']++;
      else if (distanceMiles < 20) distanceBuckets['10-20']++;
      else if (distanceMiles < 30) distanceBuckets['20-30']++;
      else if (distanceMiles < 40) distanceBuckets['30-40']++;
      else if (distanceMiles < 50) distanceBuckets['40-50']++;
      else if (distanceMiles < 75) distanceBuckets['50-75']++;
      else if (distanceMiles < 100) distanceBuckets['75-100']++;
      else distanceBuckets['100+']++;

      // Track activity types
      const type = route.activity_type || 'road';
      activityTypes[type] = (activityTypes[type] || 0) + 1;
    });

    // Calculate derived stats
    const totalMiles = Math.round(totalDistanceKm * 0.621371 * 10) / 10;
    const totalElevationFeet = Math.round(totalElevationM * 3.28084);
    const totalTimeHours = Math.round(totalDurationSec / 3600 * 10) / 10;

    // Everest = 29,032 ft
    const everestMultiple = Math.round(totalElevationFeet / 29032 * 10) / 10;

    // Find most common day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let maxDayCount = 0;
    let mostCommonDayIndex = 0;
    Object.entries(dayCount).forEach(([day, count]) => {
      if (count > maxDayCount) {
        maxDayCount = count;
        mostCommonDayIndex = parseInt(day);
      }
    });

    // Find sweet spot distance (most common bucket with rides)
    let maxBucketCount = 0;
    let sweetSpotDistance = null;
    Object.entries(distanceBuckets).forEach(([bucket, count]) => {
      if (count > maxBucketCount) {
        maxBucketCount = count;
        sweetSpotDistance = bucket + ' miles';
      }
    });

    // Calculate years of data
    const firstDate = new Date(routes[0].recorded_at);
    const lastDate = new Date(routes[routes.length - 1].recorded_at);
    const yearsDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365);
    const yearsOfData = Math.max(1, Math.round(yearsDiff * 10) / 10);

    // Determine primary activity type
    let maxTypeCount = 0;
    let primaryActivityType = 'road';
    Object.entries(activityTypes).forEach(([type, count]) => {
      if (count > maxTypeCount) {
        maxTypeCount = count;
        primaryActivityType = type;
      }
    });

    const stats = {
      totalRides: routes.length,
      totalMiles,
      totalElevationFeet,
      totalTimeHours,
      longestRide,
      yearsOfData,
      firstRideDate: routes[0].recorded_at,
      lastRideDate: routes[routes.length - 1].recorded_at,
      mostCommonDay: dayNames[mostCommonDayIndex],
      sweetSpotDistance,
      everestMultiple,
      averageRideDistance: Math.round(totalMiles / routes.length * 10) / 10,
      primaryActivityType,
    };

    console.log(`✅ Calculated stats for user ${userId}:`, {
      totalRides: stats.totalRides,
      totalMiles: stats.totalMiles,
      yearsOfData: stats.yearsOfData,
    });

    res.status(200).json({
      success: true,
      hasData: true,
      stats,
    });

  } catch (error) {
    console.error('Error calculating user stats:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
