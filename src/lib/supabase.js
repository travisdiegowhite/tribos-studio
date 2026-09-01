import { createClient } from '@supabase/supabase-js';
import { assertBrowserSafeKey } from './validateSupabaseKey';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// 🛡️ SAFEGUARD: refuse to boot with a privileged key in the browser.
//
// This previously threw INSIDE its own try block, so the throw was caught by
// the adjacent catch, turned into a console error, and `createClient` ran
// anyway — a service_role key produced an alert and then a fully privileged,
// RLS-bypassing browser client. It also assumed every key was a JWT, so the
// current `sb_secret_…` format was never recognised as dangerous at all.
//
// Both are fixed by validateSupabaseKey: the throw now propagates and the
// module fails to load, which is the correct outcome for shipping a secret to
// the browser.
try {
  const info = assertBrowserSafeKey(supabaseAnonKey);
  if (info.format !== 'missing') {
    console.log(`✅ Supabase client initialized with ${info.format} key`);
  }
} catch (err) {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert('Configuration Error: a secret Supabase key is set for the browser. Check the console.');
  }
  throw err;
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Simple client creation like the OLD implementation - no extra options
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Expose for console debugging (anon key only, RLS-protected)
if (typeof window !== 'undefined') {
  window.__supabase = supabase;
}
