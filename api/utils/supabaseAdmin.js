import { createClient } from '@supabase/supabase-js';

let _supabase = null;

/**
 * Returns a shared Supabase admin client (service role).
 * Lazy singleton — one client per Vercel function instance.
 */
export function getSupabaseAdmin() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: 'public' },
        global: { headers: { 'X-Client-Info': 'tribos-server' } },
      }
    );
  }
  return _supabase;
}
