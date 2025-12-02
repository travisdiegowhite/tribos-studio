// Quick diagnostic script to check routes data
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkRoutes() {
  const userId = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

  // Check total routes
  const { data: allRoutes, error: allError } = await supabase
    .from('routes')
    .select('id, name, recorded_at, created_at, imported_from, has_gps_data, track_points_count')
    .eq('user_id', userId);

  if (allError) {
    console.error('Error fetching routes:', allError);
    return;
  }

  console.log('\n📊 ROUTES ANALYSIS:');
  console.log(`Total routes: ${allRoutes.length}`);

  const withRecordedAt = allRoutes.filter(r => r.recorded_at);
  const withoutRecordedAt = allRoutes.filter(r => !r.recorded_at);

  console.log(`With recorded_at: ${withRecordedAt.length}`);
  console.log(`Without recorded_at (NULL): ${withoutRecordedAt.length}`);

  const withGPS = allRoutes.filter(r => r.has_gps_data);
  const withTrackPoints = allRoutes.filter(r => r.track_points_count > 0);

  console.log(`\nGPS Data:`);
  console.log(`  has_gps_data=true: ${withGPS.length}`);
  console.log(`  track_points_count>0: ${withTrackPoints.length}`);
  console.log(`  Need GPS backfill: ${withGPS.length - withTrackPoints.length}`);

  // Check recent routes (90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentRoutes = allRoutes.filter(r => {
    if (!r.recorded_at) return false;
    return new Date(r.recorded_at) >= ninetyDaysAgo;
  });

  console.log(`\nRecent routes (last 90 days with recorded_at): ${recentRoutes.length}`);

  // Sample data
  console.log(`\n📋 SAMPLE ROUTES (first 3):`);
  allRoutes.slice(0, 3).forEach(r => {
    console.log(`  - ${r.name || 'Untitled'}`);
    console.log(`    recorded_at: ${r.recorded_at || 'NULL'}`);
    console.log(`    created_at: ${r.created_at}`);
    console.log(`    imported_from: ${r.imported_from || 'NULL'}`);
    console.log(`    has_gps_data: ${r.has_gps_data}, track_points: ${r.track_points_count || 0}`);
    console.log('');
  });
}

checkRoutes().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
