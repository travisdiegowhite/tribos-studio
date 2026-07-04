// Shared fetch-header helper for calling our /api endpoints.
// Attaches the Supabase session token when one exists; guests (no session)
// get plain JSON headers — the API treats tokenless requests as guest
// traffic with its own rate limits.
import { supabase } from '../lib/supabase';

export async function getAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession() ?? {};
    const token = data?.session?.access_token;
    if (token) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
    }
  } catch {
    // Auth lookup failed — send guest headers rather than breaking the call.
  }
  return { 'Content-Type': 'application/json' };
}
