// Shared SLI/SLO computations for the Garmin pipeline.
//
// Single source of truth used by BOTH:
//   - api/admin-garmin-health.js   (on-demand admin dashboard)
//   - api/garmin-health-monitor.js (hourly cron: snapshots + Sentry alerts)
// so the dashboard and the alerts can never disagree about the numbers.
//
// Every getter takes the shared supabase admin client as its first argument
// and returns { available: false, reason } instead of throwing when a
// migration hasn't been applied yet (same tolerance contract as the original
// admin-garmin-health.js implementation these were extracted from).

const ACTIVITY_EVENT_TYPES = ['CONNECT_ACTIVITY', 'ACTIVITY_DETAIL', 'ACTIVITY_FILE_DATA'];

// Mirrors the processor's pickup window and retry budget
// (api/garmin-webhook-process.js ACTIVITY_CUTOFF_DAYS, retryPolicy.MAX_RETRIES).
// Queue lag must only count events the processor is still eligible to claim —
// fossil rows older than the window sit unprocessed forever by design and
// would otherwise peg the lag SLI at months. 217 such rows existed when the
// monitor first ran (June 2026), pinning the metric at ~160 days.
const PROCESSOR_PICKUP_WINDOW_DAYS = 14;
const PROCESSOR_MAX_RETRIES = 10;

// Alert thresholds for the breach evaluation in computeHealthSnapshot().
// MIN_SAMPLE guards keep tiny denominators from paging at 3am.
export const THRESHOLDS = {
  DEAD_LETTERED_24H: 0,          // breach when >
  UNMATCHED_24H: 0,              // breach when >
  QUEUE_LAG_SECONDS: 1800,       // breach when >
  // Measured weekly rates May–Jul 2026 range 0.11–0.32 (median ~0.16); 0.15
  // sat inside that noise band and flapped hourly. 0.10 pages only on a real
  // collapse below the observed floor.
  FILE_DELIVERY_RATE: 0.10,      // breach when < (7d window)
  FILE_DELIVERY_MIN_SAMPLE: 10,
  SLO_FULL_24H: 0.999,           // breach when <
  SLO_MIN_SAMPLE: 10,
};

/**
 * % of distinct activities seen in the window that received at least one
 * ACTIVITY_FILE_DATA event (i.e. a FIT callbackURL). Empirically ~11-32%
 * week to week (Jul 2026); a sustained drop means Garmin-side delivery
 * degraded. Token state doesn't affect webhook delivery, so disconnected
 * users' activities are legitimately part of this sample.
 */
export async function getFileDeliveryRate(supabase, since) {
  const { data, error } = await supabase
    .from('garmin_webhook_events')
    .select('activity_id, event_type, file_url')
    .in('event_type', ACTIVITY_EVENT_TYPES)
    .gte('created_at', since)
    .limit(10000);
  if (error) return { available: false, reason: error.message };

  const buckets = {};
  const seen = new Map();
  for (const row of data || []) {
    buckets[row.event_type] = (buckets[row.event_type] || 0) + 1;
    if (!row.activity_id) continue;
    const had = seen.get(row.activity_id) || new Set();
    had.add(row.event_type);
    seen.set(row.activity_id, had);
  }

  let withFitPing = 0;
  for (const had of seen.values()) {
    if (had.has('ACTIVITY_FILE_DATA')) withFitPing++;
  }

  return {
    available: true,
    eventCountsByType: buckets,
    activitiesSeen: seen.size,
    activitiesWithFitPing: withFitPing,
    rate: seen.size > 0 ? +(withFitPing / seen.size).toFixed(3) : null,
  };
}

/**
 * Legacy "lost forever" bucket: events marked processed=true with an error
 * and no imported activity (the pre-DLQ give-up path, still produced for
 * health events and as the dead-letter fallback).
 */
export async function getStuckEventCount(supabase) {
  const { count, error } = await supabase
    .from('garmin_webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('processed', true)
    .is('activity_imported_id', null)
    .not('process_error', 'is', null);
  if (error) return { available: false, reason: error.message };
  return { available: true, processedWithError: count || 0 };
}

/** Dead-letter queue counts (migration 098). */
export async function getDeadLetterStats(supabase) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [openRes, recentRes] = await Promise.all([
    supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('dead_lettered', true),
    supabase
      .from('garmin_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('dead_lettered', true)
      .gte('dead_lettered_at', dayAgo),
  ]);
  if (openRes.error) return { available: false, reason: openRes.error.message };
  return {
    available: true,
    open: openRes.count || 0,
    last24h: recentRes.error ? null : (recentRes.count || 0),
  };
}

/**
 * Webhooks skipped because no integration matched the garmin_user_id. Every
 * one of these is a user whose data is silently not syncing.
 */
export async function getUnmatchedWebhookCount(supabase, since) {
  const { count, error } = await supabase
    .from('garmin_webhook_events')
    .select('*', { count: 'exact', head: true })
    .like('process_error', 'No integration found%')
    .gte('processed_at', since);
  if (error) return { available: false, reason: error.message };
  return { available: true, count: count || 0 };
}

/**
 * Age of the oldest unprocessed, retry-eligible activity event. A growing lag
 * means the processor cron is down, wedged, or starved.
 */
export async function getQueueLag(supabase) {
  const windowStart = new Date(
    Date.now() - PROCESSOR_PICKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const buildQuery = (excludeDeadLettered) => {
    let q = supabase
      .from('garmin_webhook_events')
      .select('created_at')
      .eq('processed', false)
      .in('event_type', ACTIVITY_EVENT_TYPES)
      // Only events the processor can still claim: inside the pickup window
      // and with retry budget left. Fossils outside the window are visible
      // via getStuckEventCount/backlog metrics instead.
      .gte('created_at', windowStart)
      .lt('retry_count', PROCESSOR_MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(1);
    if (excludeDeadLettered) q = q.eq('dead_lettered', false);
    return q;
  };

  // Dead-lettered rows stay processed=false by design; exclude them from lag.
  // Retry without the filter when the migration-098 column doesn't exist yet.
  let { data, error } = await buildQuery(true);
  if (error) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) return { available: false, reason: error.message };
  if (!data?.length) return { available: true, oldestSeconds: 0, oldestCreatedAt: null };

  const oldest = new Date(data[0].created_at).getTime();
  return {
    available: true,
    oldestSeconds: Math.max(0, Math.round((Date.now() - oldest) / 1000)),
    oldestCreatedAt: data[0].created_at,
  };
}

/**
 * Integrations whose refresh token is dead (user must reconnect) — total and
 * recent transitions (approximated by updated_at since we don't store a
 * transition timestamp).
 */
export async function getTokenHealth(supabase) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bike_computer_integrations')
    .select('id, user_id, updated_at, provider_user_id')
    .eq('provider', 'garmin')
    .eq('refresh_token_invalid', true);
  if (error) return { available: false, reason: error.message };

  const recent = (data || []).filter((r) => r.updated_at >= dayAgo);
  const { count: missingUserId } = await supabase
    .from('bike_computer_integrations')
    .select('*', { count: 'exact', head: true })
    .eq('provider', 'garmin')
    .is('provider_user_id', null);

  return {
    available: true,
    invalidTokenCount: data?.length || 0,
    invalidTokenLast24h: recent.length,
    missingProviderUserId: missingUserId || 0,
  };
}

/** Completeness breakdown of all Garmin activities (migration 093). */
export async function getReconciliationBacklog(supabase) {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('data_completeness')
      .eq('provider', 'garmin')
      .not('data_completeness', 'is', null);
    if (error) return { available: false, reason: error.message };
    const counts = { summary_only: 0, full: 0, needs_resync: 0, unrecoverable: 0 };
    for (const row of data || []) counts[row.data_completeness] = (counts[row.data_completeness] || 0) + 1;
    return { available: true, counts };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

/**
 * Activities stuck incomplete past the 48h grace window (recovery should have
 * resolved them by then — growth here means the recovery loop is failing).
 */
export async function getSummaryOnlyBacklog(supabase) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('provider', 'garmin')
    .in('data_completeness', ['summary_only', 'needs_resync'])
    .lt('created_at', cutoff);
  if (error) return { available: false, reason: error.message };
  return { available: true, olderThan48h: count || 0 };
}

/**
 * The primary SLO: of the distinct activities whose webhook events arrived in
 * a *matured* window (between 48h and 24h ago, so every activity has had a
 * full 24h to complete), what fraction reached a terminal-good state?
 *
 * Terminal-good = imported activity with data_completeness='full', OR a
 * legitimate non-import (filtered health/too-short activity, cross-provider
 * duplicate where another provider owns the data).
 */
export async function getSloFullWithin24h(supabase) {
  const windowStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('garmin_webhook_events')
    .select('activity_id, processed, process_error, activity_imported_id')
    .in('event_type', ACTIVITY_EVENT_TYPES)
    .gte('created_at', windowStart)
    .lt('created_at', windowEnd)
    .limit(10000);
  if (error) return { available: false, reason: error.message };

  // Collapse events to one record per distinct Garmin activity.
  const byActivity = new Map();
  for (const ev of events || []) {
    const key = ev.activity_id || `noid:${Math.random()}`;
    const agg = byActivity.get(key) || { importedId: null, errors: [], anyUnprocessed: false };
    if (ev.activity_imported_id) agg.importedId = ev.activity_imported_id;
    if (ev.process_error) agg.errors.push(ev.process_error);
    if (!ev.processed) agg.anyUnprocessed = true;
    byActivity.set(key, agg);
  }

  // Benign non-import outcomes: these are correct behavior, not failures, and
  // are excluded from the denominator. Markers come from the processor's
  // markEventProcessed() messages.
  const isFiltered = (errors) =>
    errors.some((e) => e.startsWith('Filtered') || e.startsWith('Health activity') || e.startsWith('No ') && e.includes('data in payload'));
  const isDuplicateResolution = (errors) =>
    errors.some((e) => e.includes('took over') || e.includes('Duplicate') || e.includes('duplicate'));
  // Disconnected-user outcomes: the processor correctly skips these, and they
  // already page through their own SLIs (unmatched_webhooks_24h,
  // invalid_token_last_24h). Counting them as SLO failures let 2-3 dead
  // integrations that still upload to Garmin hold the SLO under target
  // indefinitely, drowning out real pipeline regressions.
  const isDisconnected = (errors) =>
    errors.some(
      (e) =>
        e.startsWith('Integration disconnected') ||
        e.startsWith('No integration found') ||
        e.startsWith('skipped: no integration')
    );

  // Look up completeness for all imported activities in one query.
  const importedIds = [...new Set([...byActivity.values()].map((a) => a.importedId).filter(Boolean))];
  const completenessById = new Map();
  for (let i = 0; i < importedIds.length; i += 200) {
    const chunk = importedIds.slice(i, i + 200);
    const { data: acts } = await supabase
      .from('activities')
      .select('id, data_completeness')
      .in('id', chunk);
    for (const a of acts || []) completenessById.set(a.id, a.data_completeness);
  }

  let good = 0;
  let bad = 0;
  let excluded = 0;
  let excludedDisconnected = 0;
  for (const agg of byActivity.values()) {
    if (agg.importedId) {
      const completeness = completenessById.get(agg.importedId);
      if (completeness === 'full') good++;
      else if (isDuplicateResolution(agg.errors)) good++; // data owned by another provider
      else bad++;
    } else if (isFiltered(agg.errors)) {
      excluded++;
    } else if (isDuplicateResolution(agg.errors)) {
      good++;
    } else if (isDisconnected(agg.errors)) {
      excludedDisconnected++;
    } else {
      // No import, not filtered: unprocessed, dead-lettered, or failed.
      bad++;
    }
  }

  const denominator = good + bad;
  return {
    available: true,
    windowStart,
    windowEnd,
    activities: denominator,
    good,
    bad,
    excludedFiltered: excluded,
    excludedDisconnected,
    rate: denominator > 0 ? +(good / denominator).toFixed(4) : null,
  };
}

/**
 * Per-user last-complete-activity timestamps, in two queries instead of N+1:
 * fetch recent 'full' Garmin activities once and reduce to first-per-user.
 */
export async function getPerUserLastComplete(supabase) {
  try {
    const { data: integrations, error: intErr } = await supabase
      .from('bike_computer_integrations')
      .select('user_id, status, last_sync_at')
      .eq('provider', 'garmin');
    if (intErr) return { available: false, reason: intErr.message };

    const lastCompleteByUser = new Map();
    try {
      const { data: acts } = await supabase
        .from('activities')
        .select('user_id, start_date')
        .eq('provider', 'garmin')
        .eq('data_completeness', 'full')
        .order('start_date', { ascending: false })
        .limit(2000);
      for (const a of acts || []) {
        if (!lastCompleteByUser.has(a.user_id)) lastCompleteByUser.set(a.user_id, a.start_date);
      }
    } catch (_) {
      // data_completeness column may not exist yet; leave map empty.
    }

    const rows = (integrations || []).map((integ) => ({
      userId: integ.user_id,
      status: integ.status,
      lastSyncAt: integ.last_sync_at,
      lastCompleteActivityAt: lastCompleteByUser.get(integ.user_id) || null,
    }));
    return { available: true, users: rows };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

/**
 * Pure threshold evaluation over the individual SLI results. Unavailable
 * metrics (migration not applied, query error) never breach — they show up
 * as nulls in the snapshot instead.
 *
 * @returns {Array<{sli: string, value: number, threshold: number}>}
 */
export function evaluateBreaches({ delivery, dlq, unmatched, queueLag, tokens, slo }) {
  const breaches = [];
  const breach = (sli, value, threshold) => breaches.push({ sli, value, threshold });

  if (dlq?.available && dlq.last24h > THRESHOLDS.DEAD_LETTERED_24H) {
    breach('dead_lettered_24h', dlq.last24h, THRESHOLDS.DEAD_LETTERED_24H);
  }
  if (unmatched?.available && unmatched.count > THRESHOLDS.UNMATCHED_24H) {
    breach('unmatched_webhooks_24h', unmatched.count, THRESHOLDS.UNMATCHED_24H);
  }
  if (queueLag?.available && queueLag.oldestSeconds > THRESHOLDS.QUEUE_LAG_SECONDS) {
    breach('queue_lag_seconds', queueLag.oldestSeconds, THRESHOLDS.QUEUE_LAG_SECONDS);
  }
  if (
    delivery?.available &&
    delivery.activitiesSeen >= THRESHOLDS.FILE_DELIVERY_MIN_SAMPLE &&
    delivery.rate !== null &&
    delivery.rate < THRESHOLDS.FILE_DELIVERY_RATE
  ) {
    breach('file_delivery_rate_7d', delivery.rate, THRESHOLDS.FILE_DELIVERY_RATE);
  }
  if (tokens?.available && tokens.invalidTokenLast24h > 0) {
    breach('invalid_token_last_24h', tokens.invalidTokenLast24h, 0);
  }
  if (
    slo?.available &&
    slo.activities >= THRESHOLDS.SLO_MIN_SAMPLE &&
    slo.rate !== null &&
    slo.rate < THRESHOLDS.SLO_FULL_24H
  ) {
    breach('slo_full_within_24h', slo.rate, THRESHOLDS.SLO_FULL_24H);
  }

  return breaches;
}

/**
 * Assemble the full health snapshot and evaluate alert thresholds.
 * Returns { sli: {...}, breaches: [{sli, value, threshold}], detail: {...} }.
 */
export async function computeHealthSnapshot(supabase) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [delivery, dlq, unmatched, queueLag, tokens, backlog, summaryBacklog, slo, stuck] = await Promise.all([
    getFileDeliveryRate(supabase, sevenDaysAgo),
    getDeadLetterStats(supabase),
    getUnmatchedWebhookCount(supabase, dayAgo),
    getQueueLag(supabase),
    getTokenHealth(supabase),
    getReconciliationBacklog(supabase),
    getSummaryOnlyBacklog(supabase),
    getSloFullWithin24h(supabase),
    getStuckEventCount(supabase),
  ]);

  const breaches = evaluateBreaches({ delivery, dlq, unmatched, queueLag, tokens, slo });

  return {
    sli: {
      file_delivery_rate: delivery.available ? delivery.rate : null,
      slo_full_within_24h: slo.available ? slo.rate : null,
      queue_lag_seconds: queueLag.available ? queueLag.oldestSeconds : null,
      dead_lettered_24h: dlq.available ? dlq.last24h : null,
      dead_lettered_open: dlq.available ? dlq.open : null,
      unmatched_webhooks_24h: unmatched.available ? unmatched.count : null,
      invalid_token_integrations: tokens.available ? tokens.invalidTokenCount : null,
      summary_only_backlog: summaryBacklog.available ? summaryBacklog.olderThan48h : null,
    },
    breaches,
    detail: {
      fileDelivery: delivery,
      deadLetter: dlq,
      unmatchedWebhooks: unmatched,
      queueLag,
      tokenHealth: tokens,
      reconciliationBacklog: backlog,
      summaryOnlyBacklog: summaryBacklog,
      slo,
      stuckEvents: stuck,
    },
  };
}
