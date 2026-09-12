import { supabase } from '../lib/supabase';

// There is no auth.users → user_profiles trigger (the only signup trigger
// creates user_activation; see database/migrations/044). Until now the
// profile row appeared as a SIDE EFFECT of whatever first wrote to it —
// the units-preference upsert, a Settings save, or finishing the onboarding
// wizard — which meant three things could silently never happen for an
// athlete who did none of those: the consent flush in AppShell (an UPDATE
// against a missing row), the welcome email (keyed on
// user_profiles.created_at), and the day-two nudge that depends on it.
//
// Create the row deliberately on first authenticated load instead.
// `ignoreDuplicates` makes this ON CONFLICT DO NOTHING, so an existing
// profile is never touched. RLS allows insert-own-row.
//
// Note for old accounts: an athlete who signed up months ago but never got a
// row will get one on their next login. The welcome cron guards against
// welcoming them by checking auth.users.created_at (see
// api/cron/welcome-email.js).
export async function ensureUserProfile(userId) {
  if (!userId) return { error: null };
  try {
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('ensureUserProfile failed:', error.message);
    return { error };
  } catch (err) {
    console.error('ensureUserProfile threw:', err);
    return { error: err };
  }
}
