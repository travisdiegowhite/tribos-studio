// Check if track points were imported
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkImport() {
  const userId = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

  console.log('\n📊 CHECKING IMPORT STATUS...\n');

  // Check routes
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id, name, has_gps_data, track_points_count, start_latitude, start_longitude, imported_from, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(10);

  if (routesError) {
    console.error('Error fetching routes:', routesError);
    return;
  }

  console.log(`Found ${routes.length} recent routes:\n`);

  for (const route of routes) {
    console.log(`📍 ${route.name || 'Untitled'}`);
    console.log(`   ID: ${route.id}`);
    console.log(`   has_gps_data: ${route.has_gps_data}`);
    console.log(`   track_points_count: ${route.track_points_count}`);
    console.log(`   start_coords: ${route.start_latitude}, ${route.start_longitude}`);
    console.log(`   imported_from: ${route.imported_from}`);
    console.log(`   recorded_at: ${route.recorded_at}`);

    // Check actual track points for this route
    const { data: points, error: pointsError } = await supabase
      .from('track_points')
      .select('id, latitude, longitude, elevation, time_seconds')
      .eq('route_id', route.id)
      .limit(3);

    if (pointsError) {
      console.log(`   ❌ Error fetching track points: ${pointsError.message}`);
    } else if (points && points.length > 0) {
      console.log(`   ✅ Has ${points.length} track points (showing first 3):`);
      points.forEach((p, i) => {
        console.log(`      Point ${i + 1}: (${p.latitude}, ${p.longitude}), elev: ${p.elevation}, time: ${p.time_seconds}`);
      });
    } else {
      console.log(`   ❌ NO TRACK POINTS IN DATABASE`);
    }
    console.log('');
  }

  // Summary stats
  const { data: stats } = await supabase
    .from('routes')
    .select('id, track_points_count')
    .eq('user_id', userId);

  const withGPS = stats.filter(r => r.track_points_count > 0).length;
  const withoutGPS = stats.filter(r => !r.track_points_count || r.track_points_count === 0).length;
  const avgPoints = stats.reduce((sum, r) => sum + (r.track_points_count || 0), 0) / stats.length;

  console.log('\n📈 SUMMARY:');
  console.log(`   Total routes: ${stats.length}`);
  console.log(`   With GPS track points: ${withGPS}`);
  console.log(`   Without GPS track points: ${withoutGPS}`);
  console.log(`   Average points per route: ${avgPoints.toFixed(0)}`);
}

checkImport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
