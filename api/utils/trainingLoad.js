/**
 * Training Load Upsert Helper
 *
 * Single entry point for writing rows into training_load_daily. Computes
 * fs_confidence inline from the previous 6 days of confidence + the new
 * row's confidence so the UI can gate Form Score display without a
 * separate cron pass.
 *
 * The helper accepts `supabase` as a parameter — it does NOT call
 * createClient() itself. Callers must pass the shared singleton from
 * api/utils/supabaseAdmin.js (per the connection-hygiene rules in CLAUDE.md).
 */

import { calculateFormScoreConfidence } from './fitnessSnapshots.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} date — ISO date (YYYY-MM-DD)
 * @param {{
 *   tss: number,
 *   ctl: number,
 *   atl: number,
 *   tsb: number,
 *   tss_source: 'device'|'power'|'kilojoules'|'hr'|'rpe'|'inferred',
 *   confidence: number,
 * }} payload
 */
export async function upsertTrainingLoadDaily(supabase, userId, date, payload) {
  // Pull up to the previous 6 days of confidence so we can compute
  // fs_confidence (7-day weighted) including today's new value.
  const { data: recent } = await supabase
    .from('training_load_daily')
    .select('date, confidence')
    .eq('user_id', userId)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(6);

  // Supabase returns newest-first; calculateFormScoreConfidence wants
  // oldest-first, with today appended last.
  const history = (recent ?? []).slice().reverse().map((r) => r.confidence);
  const fs_confidence = calculateFormScoreConfidence([
    ...history,
    payload.confidence,
  ]);

  return supabase
    .from('training_load_daily')
    .upsert(
      {
        user_id: userId,
        date,
        tss: payload.tss,
        ctl: payload.ctl,
        atl: payload.atl,
        tsb: payload.tsb,
        tss_source: payload.tss_source,
        confidence: payload.confidence,
        fs_confidence,
      },
      { onConflict: 'user_id,date' }
    );
}
