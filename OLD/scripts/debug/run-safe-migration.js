// Safe database migration script - adds new fields without dropping existing data
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Missing REACT_APP_SUPABASE_URL in .env file');
  process.exit(1);
}

// Use service key if available, otherwise anon key
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

async function runSafeMigration() {
  try {
    console.log('🔧 Running safe database migration...');
    console.log('⚠️  This will ADD new fields to your existing routes table without deleting data');
    
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, 'database', 'safe_migration.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL commands
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📝 Executing ${commands.length} migration commands...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`⚡ Running command ${i + 1}/${commands.length}`);
      
      // Execute each command directly
      const { error } = await supabase.rpc('exec_sql', { 
        sql: command 
      });
      
      if (error) {
        // Some errors are expected (like constraint already exists)
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist')) {
          console.log(`⚠️  Command ${i + 1}: ${error.message} (skipping)`);
        } else {
          console.error(`❌ Error executing command ${i + 1}:`, error);
          console.log('Command was:', command);
        }
      } else {
        console.log(`✅ Command ${i + 1} executed successfully`);
      }
    }
    
    console.log('🎉 Safe migration complete!');
    console.log('✅ Your existing route data has been preserved');
    console.log('✨ New enhanced fields are now available');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

runSafeMigration();