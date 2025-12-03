import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 🛡️ SAFEGUARD: Decode JWT and verify it's NOT a service role key
function validateAnonKey(key) {
  if (!key || key === 'placeholder-key') {
    console.error('❌ VITE_SUPABASE_ANON_KEY is not configured');
    return false;
  }

  try {
    // Decode JWT payload (base64)
    const payload = JSON.parse(atob(key.split('.')[1]));

    if (payload.role === 'service_role') {
      console.error('🚨 CRITICAL: Service role key detected in browser! Check your .env file.');
      console.error('VITE_SUPABASE_ANON_KEY should be the ANON key, not the SERVICE key.');
      alert('Configuration Error: Service key detected in browser. Check console.');
      throw new Error('Forbidden: Cannot use service_role key in browser');
    }

    if (payload.role !== 'anon') {
      console.warn(`⚠️ Unexpected role: ${payload.role}. Expected "anon".`);
    }

    console.log('✅ Supabase client initialized with anon key');
    return true;
  } catch (e) {
    console.error('❌ Failed to validate Supabase key:', e.message);
    return false;
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Validate before creating client
validateAnonKey(supabaseAnonKey);

// Simple client creation like the OLD implementation - no extra options
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
