// Verify Strava import with force mode and GPS streams
// Run this after importing to verify everything worked correctly
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key to bypass RLS

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.log('URL:', supabaseUrl ? 'Present' : 'Missing');
  console.log('Service Key:', supabaseKey ? 'Present' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyImport() {
  const userId = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

  console.log('\n🔍 VERIFYING STRAVA IMPORT WITH GPS DATA...\n');

  // Get all routes
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id, name, has_gps_data, track_points_count, strava_id, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });

  if (routesError) {
    console.error('❌ Error fetching routes:', routesError);
    return;
  }

  console.log(`📊 Total routes in database: ${routes.length}\n`);

  if (routes.length === 0) {
    console.log('⚠️ NO ROUTES FOUND - Import may not have run yet');
    console.log('\nNext steps:');
    console.log('1. Go to the app and click "Import from Strava"');
    console.log('2. Wait for import to complete');
    console.log('3. Run this script again to verify');
    return;
  }

  // Analyze routes
  const withGPS = routes.filter(r => r.has_gps_data).length;
  const withTrackPoints = routes.filter(r => r.track_points_count > 0).length;
  const avgPoints = routes.reduce((sum, r) => sum + (r.track_points_count || 0), 0) / routes.length;

  console.log('📈 SUMMARY:');
  console.log(`   Total routes: ${routes.length}`);
  console.log(`   Routes marked has_gps_data: ${withGPS}`);
  console.log(`   Routes with actual track points: ${withTrackPoints}`);
  console.log(`   Average points per route: ${avgPoints.toFixed(0)}`);
  console.log('');

  // Check recent routes in detail
  console.log('🔍 DETAILED CHECK (5 most recent routes):\n');

  for (const route of routes.slice(0, 5)) {
    console.log(`📍 ${route.name || 'Untitled'}`);
    console.log(`   Route ID: ${route.id}`);
    console.log(`   Strava ID: ${route.strava_id || 'N/A'}`);
    console.log(`   has_gps_data: ${route.has_gps_data}`);
    console.log(`   track_points_count: ${route.track_points_count || 0}`);

    // Count actual track points
    const { count, error: countError } = await supabase
      .from('track_points')
      .select('*', { count: 'exact', head: true })
      .eq('route_id', route.id);

    if (countError) {
      console.log(`   ❌ Error counting track points: ${countError.message}`);
    } else {
      console.log(`   📊 Actual track points in DB: ${count}`);

      if (count > 0) {
        // Get first and last points to verify data quality
        const { data: firstPoint } = await supabase
          .from('track_points')
          .select('latitude, longitude, elevation, time_seconds, distance_m')
          .eq('route_id', route.id)
          .order('point_index', { ascending: true })
          .limit(1)
          .single();

        const { data: lastPoint } = await supabase
          .from('track_points')
          .select('latitude, longitude, elevation, time_seconds, distance_m')
          .eq('route_id', route.id)
          .order('point_index', { ascending: false })
          .limit(1)
          .single();

        if (firstPoint && lastPoint) {
          console.log(`   ✅ First point: (${firstPoint.latitude.toFixed(5)}, ${firstPoint.longitude.toFixed(5)})`);
          console.log(`      - Elevation: ${firstPoint.elevation ? firstPoint.elevation.toFixed(1) + 'm' : 'N/A'}`);
          console.log(`      - Time: ${firstPoint.time_seconds ? firstPoint.time_seconds + 's' : 'N/A'}`);
          console.log(`      - Distance: ${firstPoint.distance_m ? (firstPoint.distance_m / 1000).toFixed(2) + 'km' : 'N/A'}`);
          console.log(`   ✅ Last point: (${lastPoint.latitude.toFixed(5)}, ${lastPoint.longitude.toFixed(5)})`);
          console.log(`      - Elevation: ${lastPoint.elevation ? lastPoint.elevation.toFixed(1) + 'm' : 'N/A'}`);
          console.log(`      - Time: ${lastPoint.time_seconds ? lastPoint.time_seconds + 's' : 'N/A'}`);
          console.log(`      - Distance: ${lastPoint.distance_m ? (lastPoint.distance_m / 1000).toFixed(2) + 'km' : 'N/A'}`);
        }
      } else {
        console.log(`   ⚠️ NO TRACK POINTS FOUND!`);
        console.log(`   This route won't show a map.`);
      }
    }
    console.log('');
  }

  // Check overall track points table
  const { count: totalPoints } = await supabase
    .from('track_points')
    .select('*', { count: 'exact', head: true });

  console.log('\n📍 TRACK POINTS TABLE:');
  console.log(`   Total track points across all routes: ${totalPoints || 0}`);

  if (totalPoints === 0 && routes.length > 0) {
    console.log('\n❌ PROBLEM DETECTED:');
    console.log('   Routes exist but NO track points were imported!');
    console.log('\nPossible causes:');
    console.log('   1. Import ran BEFORE the Streams API fix was deployed');
    console.log('   2. Strava activities don\'t have GPS data (indoor/virtual rides)');
    console.log('   3. API error during streams fetch (check Vercel logs)');
    console.log('\nSolution:');
    console.log('   Run the import again with force=true (already default)');
  } else if (totalPoints > 0) {
    console.log('   ✅ Track points are being imported correctly!');
    console.log('   Maps should display in the route view modal.');
  }
}

verifyImport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
