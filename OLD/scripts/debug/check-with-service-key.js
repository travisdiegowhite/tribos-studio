// Check track points using SERVICE KEY (bypasses RLS)
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use SERVICE_KEY to bypass RLS
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // SERVICE KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.log('URL:', supabaseUrl ? 'Present' : 'Missing');
  console.log('Service Key:', supabaseKey ? 'Present' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTrackPoints() {
  const userId = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

  console.log('\n🔍 CHECKING TRACK POINTS (with service key)...\n');

  // Get routes
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id, name, has_gps_data, track_points_count, imported_from')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (routesError) {
    console.error('Error:', routesError);
    return;
  }

  console.log(`Found ${routes.length} routes\n`);

  for (const route of routes) {
    console.log(`📍 ${route.name}`);
    console.log(`   has_gps_data: ${route.has_gps_data}`);
    console.log(`   track_points_count: ${route.track_points_count}`);

    // Count actual track points
    const { count, error: countError } = await supabase
      .from('track_points')
      .select('*', { count: 'exact', head: true })
      .eq('route_id', route.id);

    if (countError) {
      console.log(`   ❌ Error: ${countError.message}`);
    } else {
      console.log(`   📊 Actual track points in DB: ${count}`);

      if (count > 0) {
        // Get a sample point
        const { data: sample } = await supabase
          .from('track_points')
          .select('latitude, longitude, elevation, time_seconds')
          .eq('route_id', route.id)
          .limit(1)
          .single();

        if (sample) {
          console.log(`   ✅ Sample: (${sample.latitude}, ${sample.longitude}), elev: ${sample.elevation}, time: ${sample.time_seconds}`);
        }
      } else {
        console.log(`   ⚠️ NO TRACK POINTS!`);
      }
    }
    console.log('');
  }

  // Overall stats
  const { count: totalRoutes } = await supabase
    .from('routes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: totalPoints } = await supabase
    .from('track_points')
    .select('*', { count: 'exact', head: true });

  console.log('\n📈 SUMMARY:');
  console.log(`   Total routes: ${totalRoutes}`);
  console.log(`   Total track points across all routes: ${totalPoints}`);
}

checkTrackPoints()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
