// Database setup script for Strava integration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // You'll need to add this to .env
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Missing REACT_APP_SUPABASE_URL in .env file');
  process.exit(1);
}

// Use service key if available, otherwise anon key (less privileged)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

async function setupStravaDatabase() {
  try {
    console.log('🔧 Setting up Strava database schema...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'database', 'strava_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL commands (simple approach)
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📝 Executing ${commands.length} SQL commands...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`⚡ Running command ${i + 1}/${commands.length}`);
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql: command 
      });
      
      if (error) {
        console.error(`❌ Error executing command ${i + 1}:`, error);
        console.log('Command was:', command);
      } else {
        console.log(`✅ Command ${i + 1} executed successfully`);
      }
    }
    
    console.log('🎉 Database setup complete!');
    
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

setupStravaDatabase();