#!/usr/bin/env node

/**
 * Fix AI-generated routes that incorrectly have recorded_at set
 *
 * This script identifies routes that were AI-generated (have ai_generated: true
 * in their analysis_results) and removes their recorded_at timestamp so they
 * appear as "Planned Routes" instead of "Completed Rides".
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function fixAIRoutes() {
  console.log('🔍 Finding AI-generated routes with recorded_at set...\n');

  try {
    // Find all routes that:
    // 1. Have analysis_results with ai_generated: true
    // 2. Have a recorded_at timestamp (shouldn't have one)
    const { data: routes, error: fetchError } = await supabase
      .from('routes')
      .select('id, name, recorded_at, created_at, analysis_results')
      .not('recorded_at', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching routes:', fetchError.message);
      return;
    }

    // Filter for AI-generated routes
    const aiRoutes = routes.filter(r =>
      r.analysis_results &&
      typeof r.analysis_results === 'object' &&
      r.analysis_results.ai_generated === true
    );

    console.log(`Found ${aiRoutes.length} AI-generated routes with recorded_at set:\n`);

    if (aiRoutes.length === 0) {
      console.log('✅ No AI routes need fixing!');
      return;
    }

    // Display routes that will be updated
    aiRoutes.forEach((route, index) => {
      console.log(`${index + 1}. "${route.name}"`);
      console.log(`   ID: ${route.id}`);
      console.log(`   recorded_at: ${route.recorded_at}`);
      console.log(`   created_at: ${route.created_at}`);
      console.log('');
    });

    // Ask for confirmation (in a real scenario you'd use readline)
    console.log('📝 Updating routes to remove recorded_at...\n');

    // Update all AI routes to remove recorded_at
    const routeIds = aiRoutes.map(r => r.id);

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

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
fixAIRoutes().then(() => {
  console.log('\n✨ Script completed.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
