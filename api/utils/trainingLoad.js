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
 *
 * Writes the spec §2 canonical columns (rss/tfi/afi/form_score/rss_source).
 * The legacy tss/ctl/atl/tsb/tss_source columns were dropped in migration
 * 071 (B4). Callers still pass the legacy field shape — translation
 * happens here — so call sites can be migrated incrementally.
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
 *   terrain_class?: 'flat'|'rolling'|'hilly'|'mountainous'|null,
 *   tfi_composition?: { aerobic_fraction: number, threshold_fraction: number, high_intensity_fraction: number } | null,
 *   tfi_tau?: number | null,
 *   afi_tau?: number | null,
 * }} payload - Legacy field names kept for caller compatibility; they
 *   map 1:1 onto the canonical rss/tfi/afi/form_score/rss_source columns.
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
        // Spec §2 canonical columns.
        rss: payload.tss,
        tfi: payload.ctl,
        afi: payload.atl,
        form_score: payload.tsb,
        rss_source: payload.tss_source,
        // Shared columns.
        confidence: payload.confidence,
        fs_confidence,
        terrain_class: payload.terrain_class ?? null,
        // New spec-§3 columns (populated opportunistically; B6 wires
        // tfi_composition into the write path).
        tfi_composition: payload.tfi_composition ?? null,
        tfi_tau: payload.tfi_tau ?? null,
        afi_tau: payload.afi_tau ?? null,
      },
      { onConflict: 'user_id,date' }
    );
}
