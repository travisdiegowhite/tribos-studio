/**
 * Training Load Upsert Helper
 *
 * Single entry point for writing rows into training_load_daily.
 *
 * Two spec invariants are enforced here (not at call sites) so every
 * writer gets the same semantics:
 *
 *   1. fs_confidence is computed from the previous 6 days of
 *      `confidence` plus today's — spec §3.6's 7-day weighted avg.
 *   2. form_score is computed from YESTERDAY's tfi and afi — spec §3.6
 *      says FS represents readiness going INTO today, not readiness
 *      AFTER today's training. Callers may still pass `tsb` in the
 *      payload, but the helper overrides it with previousTFI − previousAFI.
 *
 * The helper accepts `supabase` as a parameter — it does NOT call
 * createClient() itself. Callers must pass the shared singleton from
 * api/utils/supabaseAdmin.js (per the connection-hygiene rules in CLAUDE.md).
 *
 * Writes only the spec §2 canonical columns (rss/tfi/afi/form_score/
 * rss_source). Legacy tss/ctl/atl/tsb were dropped in migration 071.
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
 *   `tsb` is overridden by the spec §3.6 form_score calculation.
 */
export async function upsertTrainingLoadDaily(supabase, userId, date, payload) {
  // Pull up to the previous 7 days — 6 for fs_confidence's weighted
  // average and the most-recent (yesterday) for form_score per §3.6.
  const { data: recent } = await supabase
    .from('training_load_daily')
    .select('date, confidence, tfi, afi')
    .eq('user_id', userId)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(7);

  const sorted = recent ?? [];

  // fs_confidence wants oldest-first, today appended last.
  const history = sorted.slice(0, 6).slice().reverse().map((r) => r.confidence);
  const fs_confidence = calculateFormScoreConfidence([
    ...history,
    payload.confidence,
  ]);

  // Spec §3.6: form_score = previousTFI − previousAFI (yesterday's values).
  // Falls back to today's values when no prior row exists so the very
  // first row doesn't land as NULL.
  const yesterday = sorted[0];
  const previousTFI = Number.isFinite(yesterday?.tfi) ? Number(yesterday.tfi) : null;
  const previousAFI = Number.isFinite(yesterday?.afi) ? Number(yesterday.afi) : null;
  const form_score = previousTFI != null && previousAFI != null
    ? Math.round((previousTFI - previousAFI) * 100) / 100
    : Math.round((payload.ctl - payload.atl) * 100) / 100;

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
        form_score,
        rss_source: payload.tss_source,
        // Shared columns.
        confidence: payload.confidence,
        fs_confidence,
        terrain_class: payload.terrain_class ?? null,
        // Spec §3 columns.
        tfi_composition: payload.tfi_composition ?? null,
        tfi_tau: payload.tfi_tau ?? null,
        afi_tau: payload.afi_tau ?? null,
      },
      { onConflict: 'user_id,date' }
    );
}
