/**
 * pingQueue — central read/write API for the Garmin ping queue.
 *
 * Part of the ground-up Garmin ping/pull rebuild. Garmin's Activity API §4
 * Ping Service sends us lightweight notifications:
 *
 *   { activityDetails: [{
 *       userId, summaryId, uploadStartTimeInSeconds,
 *       uploadEndTimeInSeconds, callbackURL
 *   }] }
 *
 * The Cloudflare worker (and the Vercel fallback) verify HMAC, write one row
 * per item into `garmin_webhook_events`, and return 200 in <5 s. This module
 * defines the row shape and the claim/finish lifecycle so the receiver and
 * the puller agree on the contract.
 *
 * Row shape (reuses the existing table — no migration):
 *   event_type        = 'ACTIVITY_DETAIL_PING' | 'HEALTH_<type>_PING'
 *   garmin_user_id    = ping.userId                     (matches integrations.provider_user_id)
 *   activity_id       = ping.summaryId                  (Garmin activity id, sans -detail suffix)
 *   file_url          = ping.callbackURL                (pre-authorized pull URL, valid 24h)
 *   file_type         = 'JSON'                          (we pull JSON, not FIT, per §7.3)
 *   payload           = the full ping item, including the upload window
 *   processed         = false
 *   created_at/received_at default to now()
 *
 * Retry semantics:
 *   On pull failure (5xx / network), `markFailed` sets `next_retry_at` with
 *   exponential backoff. `claimPings` returns rows where processed=false AND
 *   (next_retry_at is null OR next_retry_at <= now()), oldest first.
 *
 * NOTE: `next_retry_at` / `retry_count` were added by migration 039 for the
 * legacy push processor and are already on the table; we reuse them here so
 * no schema change is required.
 *
 * NOTE: This module is Phase 0 — defined, tested, NOT YET WIRED into any
 * endpoint. Phase 1 (`garmin2-pull.js`) will be the first consumer; Phase 2
 * (worker ping support) will be the first producer.
 */

export const ACTIVITY_PING = 'ACTIVITY_DETAIL_PING';
export const HEALTH_PING_PREFIX = 'HEALTH_';
export const HEALTH_PING_SUFFIX = '_PING';

// Exponential backoff schedule, in minutes. Index = retry_count BEFORE the
// failure being recorded (so the first failure → 5 min, second → 15, etc.).
// Cap is intentional — after MAX_RETRIES, the row is parked with the error
// and not retried automatically. The reconciler/admin can resurrect manually.
const RETRY_BACKOFF_MIN = [5, 15, 45, 120, 360];
export const MAX_RETRIES = RETRY_BACKOFF_MIN.length;

/**
 * Build the row shape for a single ping item and insert it.
 *
 * @param {object} supabase    Admin client.
 * @param {object} ping        One element of the §4 ping `activityDetails[]`
 *                             array. Required: userId, summaryId,
 *                             uploadStartTimeInSeconds, uploadEndTimeInSeconds,
 *                             callbackURL.
 * @param {object} [opts]
 * @param {string} [opts.eventType=ACTIVITY_PING] Override for health pings.
 * @returns {Promise<{id: string|null, error: Error|null}>}
 */
export async function storePing(supabase, ping, opts = {}) {
  if (!ping || typeof ping !== 'object') {
    return { id: null, error: new Error('ping is not an object') };
  }
  if (!ping.userId || !ping.summaryId || !ping.callbackURL) {
    return { id: null, error: new Error('ping missing userId / summaryId / callbackURL') };
  }
  const uploadStart = ping.uploadStartTimeInSeconds;
  const uploadEnd = ping.uploadEndTimeInSeconds;
  if (typeof uploadStart !== 'number' || typeof uploadEnd !== 'number') {
    return { id: null, error: new Error('ping missing upload window seconds') };
  }

  const row = {
    event_type: opts.eventType || ACTIVITY_PING,
    garmin_user_id: String(ping.userId),
    activity_id: String(ping.summaryId).replace(/-detail$/, ''),
    file_url: ping.callbackURL,
    file_type: 'JSON',
    upload_timestamp: new Date(uploadStart * 1000).toISOString(),
    payload: ping,
    processed: false,
  };

  const { data, error } = await supabase
    .from('garmin_webhook_events')
    .insert(row)
    .select('id')
    .single();
  if (error) return { id: null, error };
  return { id: data.id, error: null };
}

/**
 * Atomically(-ish) read a batch of ready-to-process ping rows, oldest first.
 *
 * Supabase Postgrest doesn't support FOR UPDATE SKIP LOCKED via the JS
 * client, so this is a best-effort claim: two cron invocations overlapping
 * could race and double-process the same row. The puller's per-row finalize
 * (`markProcessed` with `processed=false` precondition) is the correctness
 * gate. Cron runs every 5 min and finishes well under that, so overlap is
 * unlikely in practice.
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {number} [opts.limit=50]     Per-run cap.
 * @param {string} [opts.eventTypePrefix] Optional event_type filter (e.g.
 *                                     'ACTIVITY_DETAIL_PING' to restrict to
 *                                     activity pings; omit to take both
 *                                     activity + health).
 * @returns {Promise<Array>}
 */
export async function claimPings(supabase, opts = {}) {
  const limit = opts.limit ?? 50;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from('garmin_webhook_events')
    .select('id, event_type, garmin_user_id, activity_id, file_url, file_type, upload_timestamp, payload, retry_count, next_retry_at, received_at')
    .eq('processed', false)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('received_at', { ascending: true })
    .limit(limit);

  if (opts.eventTypePrefix) {
    query = query.eq('event_type', opts.eventTypePrefix);
  } else {
    // By default, restrict to ping rows so we don't accidentally drain the
    // legacy push queue while both pipelines coexist during cutover.
    query = query.or(`event_type.eq.${ACTIVITY_PING},event_type.like.${HEALTH_PING_PREFIX}%${HEALTH_PING_SUFFIX}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Mark a ping row as successfully processed.
 *
 * @param {object} supabase
 * @param {string} eventId
 * @param {object} [opts]
 * @param {string} [opts.activityImportedId] Activity row created/updated by this ping.
 * @param {string} [opts.note]               Free-text result message for debug.
 * @returns {Promise<{error: Error|null}>}
 */
export async function markProcessed(supabase, eventId, opts = {}) {
  const update = {
    processed: true,
    processed_at: new Date().toISOString(),
  };
  if (opts.activityImportedId) update.activity_imported_id = opts.activityImportedId;
  if (opts.note) update.process_error = opts.note;        // column reused for success notes too

  const { error } = await supabase
    .from('garmin_webhook_events')
    .update(update)
    .eq('id', eventId)
    .eq('processed', false);                                // precondition guard
  return { error: error || null };
}

/**
 * Record a failed processing attempt with exponential backoff.
 *
 * Bumps retry_count, computes next_retry_at, and stamps process_error. If
 * retry_count would exceed MAX_RETRIES, parks the row (processed=true) so
 * the puller stops trying — manual reprocess only.
 *
 * @param {object} supabase
 * @param {{id: string, retry_count?: number|null}} eventRow
 *        The row returned from claimPings. retry_count is the count BEFORE
 *        the failure being recorded.
 * @param {Error|string} err
 * @returns {Promise<{terminal: boolean, error: Error|null}>}
 */
export async function markFailed(supabase, eventRow, err) {
  const message = String(err?.message || err || 'unknown failure').slice(0, 1000);
  const priorRetries = Number.isFinite(eventRow.retry_count) ? eventRow.retry_count : 0;
  const nextRetries = priorRetries + 1;

  if (nextRetries > MAX_RETRIES) {
    // Park the row so cron stops picking it up.
    const { error } = await supabase
      .from('garmin_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        retry_count: nextRetries,
        process_error: `parked after ${MAX_RETRIES} retries: ${message}`,
      })
      .eq('id', eventRow.id);
    return { terminal: true, error: error || null };
  }

  const backoffMin = RETRY_BACKOFF_MIN[priorRetries] ?? RETRY_BACKOFF_MIN[RETRY_BACKOFF_MIN.length - 1];
  const nextRetryAt = new Date(Date.now() + backoffMin * 60_000).toISOString();

  const { error } = await supabase
    .from('garmin_webhook_events')
    .update({
      retry_count: nextRetries,
      next_retry_at: nextRetryAt,
      process_error: message,
    })
    .eq('id', eventRow.id);
  return { terminal: false, error: error || null };
}
