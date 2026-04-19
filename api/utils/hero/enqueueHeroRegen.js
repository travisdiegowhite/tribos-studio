/**
 * enqueueHeroRegen — mark today's hero paragraph pending so the precompute
 * worker rebuilds it on the next tick. Called from provider webhooks after
 * a new activity is saved.
 *
 * Non-critical by design: a failure here never fails the webhook. The
 * rider will simply regenerate on demand the next time the dashboard loads.
 *
 * The existing row's paragraph + context_snapshot are preserved — we only
 * flip status to 'pending' so the worker picks it up. This keeps yesterday's
 * text on screen during the regeneration window rather than showing blank.
 */

function formatDateInTz(date, tz) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - service-role client
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.timezone] - IANA timezone; falls back to profile.timezone
 *                                   then 'America/New_York'.
 */
export async function enqueueHeroRegen(supabase, userId, opts = {}) {
  try {
    let tz = opts.timezone;
    if (!tz) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();
      tz = profile?.timezone || 'America/New_York';
    }

    const today = formatDateInTz(new Date(), tz);
    const nowIso = new Date().toISOString();

    // Check for an existing row for today.
    const { data: existing } = await supabase
      .from('today_hero_paragraphs')
      .select('id')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('today_hero_paragraphs')
        .update({
          status: 'pending',
          error_message: null,
          updated_at: nowIso,
        })
        .eq('id', existing.id);
      if (error) {
        console.warn('[enqueueHeroRegen] update failed (non-critical):', error.message);
      }
      return;
    }

    // Fresh insert — seed with a placeholder row so the worker has something
    // to pick up. Archetype defaults to 'pending'; the worker will resolve
    // the real archetype when it runs.
    const { error } = await supabase
      .from('today_hero_paragraphs')
      .insert({
        user_id: userId,
        date: today,
        status: 'pending',
        updated_at: nowIso,
      });
    if (error) {
      console.warn('[enqueueHeroRegen] insert failed (non-critical):', error.message);
    }
  } catch (err) {
    console.warn('[enqueueHeroRegen] unexpected failure (non-critical):', err?.message || err);
  }
}
