/**
 * Training Load Refresh Trigger
 *
 * Fire-and-forget kick of /api/training-load-daily {action:'refresh'} after
 * an activity is ingested (webhooks, FIT upload), so training_load_daily
 * gets a fresh row THROUGH TODAY (user-local) the moment a ride lands —
 * instead of readers client-filling up to two days of tail with the
 * fixed-tau approximation until the nightly rollforward catches up.
 *
 * Called alongside enqueueDeviationAnalysis(). The refresh recomputes a
 * 30-day window from the day's actual activities, so repeated triggers
 * (webhook redeliveries, multi-activity batches) are idempotent and cheap.
 *
 * No Supabase client here on purpose — connection hygiene; the target
 * endpoint owns the DB work.
 */

/**
 * @param {string} userId - The user whose training load should refresh
 * @returns {Promise<void>} resolves once the request is dispatched; never throws
 */
export async function triggerTrainingLoadRefresh(userId) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    await fetch(`${baseUrl}/api/training-load-daily`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ action: 'refresh', user_id: userId }),
    });
  } catch (error) {
    // Fire-and-forget — log but never fail the caller (webhook/upload path)
    console.warn('Training load refresh trigger failed (non-blocking):', error.message);
  }
}
