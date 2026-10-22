// AI consent gate — Garmin Connect Developer Program Agreement §15.10.
//
// Garmin requires explicit, withdrawable consent before any End User Data is
// processed by an AI system. The consent lives on user_profiles
// (ai_consent_granted_at / ai_consent_withdrawn_at, migration 045) and is
// collected in Settings and by the inline prompts in the coach surfaces.
// Granting clears ai_consent_withdrawn_at, so "consented" is exactly
// granted-and-not-withdrawn — the same rule the browser uses.
//
// Applied to every endpoint that puts activity or health data into a Claude
// prompt. Automatic paths (post-sync insights, check-ins, the correction
// cron) skip silently; user-invoked endpoints answer 403 AI_CONSENT_REQUIRED
// so the client can show its consent prompt.

import { getSupabaseAdmin } from './supabaseAdmin.js';

export const AI_CONSENT_REQUIRED = 'AI_CONSENT_REQUIRED';

export function isAiConsentGranted(profile) {
  return !!profile?.ai_consent_granted_at && !profile?.ai_consent_withdrawn_at;
}

/**
 * @param {string} userId
 * @param {object} [supabase] - defaults to the service-role singleton
 * @returns {Promise<boolean>} false on any lookup failure (fail closed)
 */
export async function hasAiConsent(userId, supabase = getSupabaseAdmin()) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('ai_consent_granted_at, ai_consent_withdrawn_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('AI consent lookup failed (treating as not granted):', error.message);
    return false;
  }
  return isAiConsentGranted(data);
}

/**
 * For user-invoked endpoints. Sends the 403 and returns true when consent is
 * missing; returns false when the caller may proceed.
 */
export async function rejectWithoutAiConsent(res, userId, supabase) {
  if (await hasAiConsent(userId, supabase)) return false;
  const message = 'AI coaching is turned off. Turn on "Coach & Insights" in Settings to let the coach use your training data.';
  // Both fields: callers read either `error` or `message`.
  res.status(403).json({ error: message, message, code: AI_CONSENT_REQUIRED });
  return true;
}
