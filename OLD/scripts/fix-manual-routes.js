#!/usr/bin/env node

/**
 * Fix manually created routes that incorrectly have recorded_at set
 *
 * This script identifies routes that were manually created (imported_from = 'manual')
 * and removes their recorded_at timestamp so they appear as "Planned Routes"
 * instead of "Completed Rides".
 *
 * Manually created routes include:
 * - Routes created in Route Builder
 * - AI-generated routes
 * - Any route not imported from Strava/Garmin/file upload
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function fixManualRoutes() {
  console.log('🔍 Finding manually created routes with recorded_at set...\n');

  try {
    // Find all routes that:
    // 1. Have imported_from = 'manual' (created in app, not imported)
    // 2. Have a recorded_at timestamp (shouldn't have one)
    const { data: routes, error: fetchError } = await supabase
      .from('routes')
      .select('id, name, recorded_at, created_at, imported_from, strava_id')
      .eq('imported_from', 'manual')
      .not('recorded_at', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching routes:', fetchError.message);
      return;
    }

    console.log(`Found ${routes.length} manually created routes with recorded_at set:\n`);

    if (routes.length === 0) {
      console.log('✅ No manual routes need fixing!');
      return;
    }

    // Display routes that will be updated
    routes.forEach((route, index) => {
      console.log(`${index + 1}. "${route.name}"`);
      console.log(`   ID: ${route.id}`);
      console.log(`   recorded_at: ${route.recorded_at}`);
      console.log(`   created_at: ${route.created_at}`);
      console.log('');
    });

    console.log('📝 Updating routes to remove recorded_at...\n');

    // Update all manual routes to remove recorded_at
    const routeIds = routes.map(r => r.id);

    const { data: updated, error: updateError } = await supabase
      .from('routes')
      .update({ recorded_at: null })
      .in('id', routeIds)
      .select('id, name');

    if (updateError) {
      console.error('❌ Error updating routes:', updateError.message);
      return;
    }

    console.log(`✅ Successfully updated ${updated.length} routes!`);
    console.log('\nUpdated routes:');
    updated.forEach((route, index) => {
      console.log(`${index + 1}. ${route.name} (ID: ${route.id})`);
    });

    console.log('\n🎉 Done! These routes will now appear as "Planned Routes" in My Routes.');
    console.log('💡 Refresh the My Routes page to see the changes.');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
fixManualRoutes().then(() => {
  console.log('\n✨ Script completed.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
