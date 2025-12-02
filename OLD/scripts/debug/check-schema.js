// Check track_points schema to see what constraints exist
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('\n🔍 CHECKING TRACK_POINTS SCHEMA...\n');

  // Query information_schema to get column details
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'track_points'
      ORDER BY ordinal_position;
    `
  });

  if (error) {
    console.error('❌ Error:', error);
    console.log('\n💡 Try running this SQL in Supabase SQL Editor instead:');
    console.log(`
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'track_points'
ORDER BY ordinal_position;
    `);
    return;
  }

  console.log('📊 TRACK_POINTS COLUMNS:\n');
  console.table(data);

  // Check for problematic NOT NULL constraints
  const notNullColumns = data.filter(col => col.is_nullable === 'NO' && col.column_default === null);

  if (notNullColumns.length > 0) {
    console.log('\n⚠️ COLUMNS WITH NOT NULL CONSTRAINT (no default):\n');
    notNullColumns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    console.log('\n💡 These columns MUST have values when inserting, which may cause errors.');
    console.log('   The migration in database/migrations/fix_track_points_nullable.sql');
    console.log('   should be run to make time_seconds and distance_m nullable.');
  }
}

checkSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
