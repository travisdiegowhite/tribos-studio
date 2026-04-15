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
 * Dual-write (B2 → B4): this helper writes both the legacy columns
 * (tss/ctl/atl/tsb/tss_source) AND the spec-§2 canonical columns
 * (rss/tfi/afi/form_score/rss_source). Callers continue to pass the old
 * field names; reader cut-over to the new names happens in B3, legacy
 * columns are dropped in B4.
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
        // Legacy columns (dropped in B4).
        tss: payload.tss,
        ctl: payload.ctl,
        atl: payload.atl,
        tsb: payload.tsb,
        tss_source: payload.tss_source,
        // Spec §2 canonical columns (dual-write from B2; readers cut over
        // in B3). Same values — the rename is semantic, not mathematical.
        rss: payload.tss,
        tfi: payload.ctl,
        afi: payload.atl,
        form_score: payload.tsb,
        rss_source: payload.tss_source,
        // Shared columns (unchanged by rename).
        confidence: payload.confidence,
        fs_confidence,
        terrain_class: payload.terrain_class ?? null,
        // New columns, populated in later PRs (B6 for composition;
        // optional here so B2 writers can start threading the snapshot).
        tfi_composition: payload.tfi_composition ?? null,
        tfi_tau: payload.tfi_tau ?? null,
        afi_tau: payload.afi_tau ?? null,
      },
      { onConflict: 'user_id,date' }
    );
}
