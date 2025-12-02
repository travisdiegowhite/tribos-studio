// Check for duplicate routes
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  const userId = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

  console.log('\n🔍 CHECKING FOR DUPLICATE ROUTES...\n');

  // Check total routes
  const { data: allRoutes, error: allError, count } = await supabase
    .from('routes')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (allError) {
    console.error('Error fetching routes:', allError);
    return;
  }

  console.log(`📊 Total routes in database: ${count || 0}`);

  if (allRoutes && allRoutes.length > 0) {
    console.log('\n📋 Routes found:');
    allRoutes.slice(0, 10).forEach(route => {
      console.log(`  - ${route.name || 'Untitled'}`);
      console.log(`    strava_id: ${route.strava_id}`);
      console.log(`    imported_from: ${route.imported_from}`);
      console.log(`    recorded_at: ${route.recorded_at}`);
      console.log(`    has_gps_data: ${route.has_gps_data}`);
      console.log(`    track_points_count: ${route.track_points_count}`);
      console.log('');
    });

    if (allRoutes.length > 10) {
      console.log(`  ... and ${allRoutes.length - 10} more routes`);
    }

    // Check strava_id duplicates
    const stravaIds = allRoutes.filter(r => r.strava_id).map(r => r.strava_id);
    console.log(`\n🔢 Routes with Strava IDs: ${stravaIds.length}`);
    console.log(`   Sample IDs: ${stravaIds.slice(0, 5).join(', ')}`);

    // Check track points
    const { data: trackPointsCount } = await supabase
      .from('track_points')
      .select('route_id', { count: 'exact' });

    console.log(`\n📍 Total track points in database: ${trackPointsCount ? trackPointsCount.length : 0}`);

  } else {
    console.log('\n✅ Database is CLEAN - no routes found!');
    console.log('   You should see "imported: X" when running the import.');
  }
}

checkDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
