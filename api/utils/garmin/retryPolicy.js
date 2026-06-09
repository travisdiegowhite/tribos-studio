// Retry budget + dead-letter transitions for the Garmin webhook queue.
// Shared by api/garmin-webhook-process.js and api/admin-garmin-dlq.js so the
// schedule and the give-up semantics live in one place and are unit-testable.

// 10 attempts with waits of 1, 2, 4, 8, 16, 32, 64, 128, 256 minutes between
// them (≈8.5h cumulative) — wide enough to ride out a multi-hour Garmin or
// Supabase outage. The old budget of 6 (~1h) permanently lost events during
// routine blips.
export const MAX_RETRIES = 10;

// Safety cap so a future MAX_RETRIES bump can't schedule a retry days out,
// past the 14d activity-event pickup window.
export const MAX_BACKOFF_MINUTES = 360;

/**
 * Exponential backoff with jitter. Jitter (±20%) spreads retries across cron
 * ticks so a burst of failures doesn't thunder back in a single batch.
 *
 * @param {number} retryCount - 1-based attempt number being scheduled.
 * @returns {number} minutes until the next attempt
 */
export function computeBackoffMinutes(retryCount) {
  const base = Math.pow(2, Math.max(0, retryCount - 1));
  const jittered = base * (0.8 + Math.random() * 0.4);
  return Math.min(jittered, MAX_BACKOFF_MINUTES);
}

/**
 * Park an event in the dead-letter queue after the retry budget is exhausted.
 * The row keeps processed=false so it stays visible as unfinished work; the
 * processor's pickup query already excludes it via retry_count >= MAX_RETRIES.
 * Redrive (api/admin-garmin-dlq.js) resets retry_count/next_retry_at/dead_lettered.
 *
 * Falls back to the legacy mark-processed-with-error behavior when the
 * migration-098 columns don't exist yet, so the processor never wedges on a
 * deploy that precedes the migration.
 *
 * @returns {Promise<{deadLettered: boolean}>}
 */
export async function deadLetterEvent(supabase, event, errorMessage) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('garmin_webhook_events')
    .update({
      dead_lettered: true,
      dead_lettered_at: now,
      dead_letter_reason: errorMessage,
      retry_count: MAX_RETRIES,
      process_error: errorMessage,
    })
    .eq('id', event.id);

  if (!error) return { deadLettered: true };

  console.warn(`⚠️ Dead-letter write failed (migration 098 applied?): ${error.message} — falling back to processed-with-error`);
  await supabase
    .from('garmin_webhook_events')
    .update({
      processed: true,
      processed_at: now,
      process_error: `Max retries (${MAX_RETRIES}) exceeded. Last error: ${errorMessage}`,
    })
    .eq('id', event.id);
  return { deadLettered: false };
}

/**
 * Reset dead-lettered events back into the queue for another full retry budget.
 *
 * @param {string[]} eventIds
 * @returns {Promise<{redriven: number}>}
 */
export async function redriveEvents(supabase, eventIds) {
  const { data, error } = await supabase
    .from('garmin_webhook_events')
    .update({
      dead_lettered: false,
      dead_lettered_at: null,
      retry_count: 0,
      next_retry_at: null,
      process_error: null,
    })
    .in('id', eventIds)
    .eq('dead_lettered', true)
    .select('id');

  if (error) throw new Error(`Redrive failed: ${error.message}`);
  return { redriven: data?.length || 0 };
}
