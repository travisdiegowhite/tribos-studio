#!/usr/bin/env node

/**
 * Script to apply the enhanced workout templates migration
 * Run with: node scripts/apply-workout-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - REACT_APP_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY (or REACT_APP_SUPABASE_ANON_KEY as fallback)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Starting workout templates migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/add_enhanced_workout_templates.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split the SQL file into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📄 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comments
      if (statement.trim().startsWith('--')) {
        continue;
      }

      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement
      });

      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: directError } = await supabase.from('workout_templates').select('*').limit(1);

        if (directError && directError.message.includes('does not exist')) {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          throw error;
        }

        // If it's a benign error (like column already exists), continue
        if (error.message.includes('already exists')) {
          console.log(`   ⚠️  Skipping (already exists)`);
          continue;
        }

        throw error;
      }

      console.log(`   ✓ Success`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verifying workout templates...');

    // Verify the migration worked
    const { data: templates, error: queryError } = await supabase
      .from('workout_templates')
      .select('name, workout_type, difficulty_level, focus_area')
      .order('workout_type');

    if (queryError) {
      console.error('❌ Error querying workout templates:', queryError.message);
      process.exit(1);
    }

    console.log(`\n✓ Found ${templates.length} workout templates:`);

    // Group by workout type
    const grouped = templates.reduce((acc, template) => {
      if (!acc[template.workout_type]) {
        acc[template.workout_type] = [];
      }
      acc[template.workout_type].push(template);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([type, workouts]) => {
      console.log(`\n  ${type.toUpperCase()}:`);
      workouts.forEach(w => {
        console.log(`    • ${w.name} (${w.difficulty_level}) - Focus: ${w.focus_area || 'N/A'}`);
      });
    });

    console.log('\n🎉 All done! Your workout library is ready to use.\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nYou can manually apply the migration by running:');
    console.error('  psql $DATABASE_URL < database/migrations/add_enhanced_workout_templates.sql');
    console.error('\nOr use the Supabase dashboard SQL editor to paste the contents of:');
    console.error('  database/migrations/add_enhanced_workout_templates.sql');
    process.exit(1);
  }
}

applyMigration();
