#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

(async () => {
  // Get all routes created today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('routes')
    .select('id, name, recorded_at, created_at, imported_from, strava_id')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`\nRoutes created today:\n`);

  if (data.length === 0) {
    console.log('No routes found created today.');
  } else {
    data.forEach((route, i) => {
      console.log(`${i + 1}. "${route.name}"`);
      console.log(`   ID: ${route.id}`);
      console.log(`   imported_from: ${route.imported_from || 'null'}`);
      console.log(`   recorded_at: ${route.recorded_at || 'null'}`);
      console.log(`   created_at: ${route.created_at}`);
      console.log(`   has_strava_id: ${!!route.strava_id}`);
      console.log('');
    });
  }
})();
