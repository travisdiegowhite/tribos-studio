// Run Coach Platform Migration
// This script executes the 001_coach_platform.sql migration using Supabase client

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('==========================================');
  console.log('Coach Platform Database Migration');
  console.log('==========================================\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '001_coach_platform.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Reading migration file:', sqlPath);
    console.log('SQL length:', sql.length, 'characters\n');

    console.log('Note: The Supabase client cannot execute raw SQL directly.');
    console.log('You need to run this migration in the Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/sql');
    console.log('2. Create a new query');
    console.log('3. Copy and paste the contents of:');
    console.log('   database/migrations/001_coach_platform.sql');
    console.log('4. Click "Run"\n');

    console.log('Alternatively, install Supabase CLI:');
    console.log('  npm install -g supabase');
    console.log('  supabase link --project-ref toihfeffpljsmgritmuy');
    console.log('  supabase db push\n');

    console.log('==========================================');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

runMigration();
