/**
 * Store the run thresholds estimated from an athlete's history on their
 * profile (multisport phase 5, migration 136).
 *
 * The load recompute already resolves them (resolveRunProfile → `estimated`)
 * to score runs. Storing them lets the browser use them too: route pace and
 * pace zones fall back to the estimate, and Settings offers it ("Use this").
 *
 * Writes ONLY the estimate columns, never the athlete's own threshold_pace_sec
 * or lthr, and only when a value changed. Fail-soft: an unapplied 136 or any
 * error is logged and skipped, so the load recompute is never affected.
 */

import { optionalColumn } from './optionalColumn.js';

// One probe column stands for the three: migration 136 adds them together.
const estimates = optionalColumn('user_profiles', 'estimated_threshold_pace_sec');
let missing = false;

/** Test hook. */
export function resetRunEstimatesFallback() {
  missing = false;
}

const intOrNull = (v) => (Number(v) > 0 ? Math.round(Number(v)) : null);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ estimated?: { thresholdPaceSec?: number|null, lthr?: number|null } }|null} runProfile
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ written: boolean }>}
 */
export async function storeRunEstimates(supabase, userId, runProfile, opts = {}) {
  if (missing) return { written: false };
  const pace = intOrNull(runProfile?.estimated?.thresholdPaceSec);
  const lthr = intOrNull(runProfile?.estimated?.lthr);
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('estimated_threshold_pace_sec, estimated_lthr')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (estimates.isMissingError(error)) {
        missing = true;
        console.warn('[runEstimates] estimate columns missing — apply migration 136. Skipping.');
      } else {
        console.warn('[runEstimates] read failed:', error.message);
      }
      return { written: false };
    }
    if (!data) return { written: false };
    // Keep a stored estimate when this window found none (e.g. a quiet month):
    // only a new value replaces it.
    const nextPace = pace ?? data.estimated_threshold_pace_sec ?? null;
    const nextLthr = lthr ?? data.estimated_lthr ?? null;
    if (nextPace === (data.estimated_threshold_pace_sec ?? null) && nextLthr === (data.estimated_lthr ?? null)) {
      return { written: false };
    }
    const { error: writeError } = await supabase
      .from('user_profiles')
      .update({
        estimated_threshold_pace_sec: nextPace,
        estimated_lthr: nextLthr,
        run_estimates_at: (opts.now ?? new Date()).toISOString(),
      })
      .eq('id', userId);
    if (writeError) {
      console.warn('[runEstimates] write failed:', writeError.message);
      return { written: false };
    }
    return { written: true };
  } catch (err) {
    console.warn('[runEstimates] failed:', err?.message);
    return { written: false };
  }
}
