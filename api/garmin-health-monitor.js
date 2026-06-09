// Vercel API Route: Garmin pipeline health monitor (cron, hourly)
//
// Computes the pipeline SLIs via api/utils/garmin/healthMetrics.js, persists
// one row to garmin_health_snapshots (trend data for the admin dashboard),
// and emits a structured Sentry-tagged error for every threshold breach so
// degradation pages instead of waiting for a user to notice.
//
// Tags emitted (configure Sentry alert rules on these):
//   garmin.slo_breach        — 24h-full SLO below target
//   garmin.queue_lag         — processor stalled / starved
//   garmin.dead_letter       — events exhausted their retry budget
//   garmin.unmatched_webhook — webhooks arriving for unknown garmin_user_ids
//   garmin.token_death       — refresh tokens died in the last 24h
//   garmin.delivery_degraded — FIT/ping delivery rate collapsed (Garmin-side)
//   garmin.config_missing    — required env config absent in production

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { computeHealthSnapshot } from './utils/garmin/healthMetrics.js';
import { captureServerError } from './utils/serverSentry.js';

const supabase = getSupabaseAdmin();

const BREACH_TAGS = {
  slo_full_within_24h: 'garmin.slo_breach',
  queue_lag_seconds: 'garmin.queue_lag',
  dead_lettered_24h: 'garmin.dead_letter',
  unmatched_webhooks_24h: 'garmin.unmatched_webhook',
  invalid_token_last_24h: 'garmin.token_death',
  file_delivery_rate_7d: 'garmin.delivery_degraded',
};

export default async function handler(req, res) {
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Garmin Health Monitor Started ===');

  try {
    const snapshot = await computeHealthSnapshot(supabase);

    // Config presence check: a missing webhook secret means we'd accept
    // unsigned webhooks in production (signatureVerifier.js warns per-request;
    // this makes it a recurring, alertable signal instead of log noise).
    if (
      (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') &&
      !process.env.GARMIN_WEBHOOK_SECRET
    ) {
      snapshot.breaches.push({ sli: 'garmin_webhook_secret_missing', value: 0, threshold: 1 });
      captureServerError('GARMIN_WEBHOOK_SECRET not configured in production', {
        tag: 'garmin.config_missing',
      });
    }

    // Day-over-day backlog growth: compare against the snapshot from ~24h ago.
    const backlogNow = snapshot.sli.summary_only_backlog;
    if (backlogNow !== null) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: prior } = await supabase
        .from('garmin_health_snapshots')
        .select('summary_only_backlog, created_at')
        .lte('created_at', dayAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.summary_only_backlog !== null && prior?.summary_only_backlog !== undefined
          && backlogNow > prior.summary_only_backlog) {
        snapshot.breaches.push({
          sli: 'summary_only_backlog_growth',
          value: backlogNow,
          threshold: prior.summary_only_backlog,
        });
      }
    }

    // Fire one structured error per breach so Sentry alert rules can route them.
    for (const b of snapshot.breaches) {
      const tag = BREACH_TAGS[b.sli] || 'garmin.health_breach';
      captureServerError(`Garmin SLI breach: ${b.sli} = ${b.value} (threshold ${b.threshold})`, {
        tag,
        extra: { sli: b.sli, value: b.value, threshold: b.threshold },
      });
    }

    // Persist the snapshot. Tolerate the table not existing yet (migration 098).
    const { error: insertError } = await supabase.from('garmin_health_snapshots').insert({
      file_delivery_rate: snapshot.sli.file_delivery_rate,
      slo_full_within_24h: snapshot.sli.slo_full_within_24h,
      queue_lag_seconds: snapshot.sli.queue_lag_seconds,
      dead_lettered_24h: snapshot.sli.dead_lettered_24h,
      dead_lettered_open: snapshot.sli.dead_lettered_open,
      unmatched_webhooks_24h: snapshot.sli.unmatched_webhooks_24h,
      invalid_token_integrations: snapshot.sli.invalid_token_integrations,
      summary_only_backlog: snapshot.sli.summary_only_backlog,
      breaches: snapshot.breaches,
      detail: snapshot.detail,
    });
    if (insertError) {
      console.warn('⚠️ Could not persist health snapshot (migration 098 applied?):', insertError.message);
    }

    console.log('=== Garmin Health Monitor Complete ===');
    console.log(`SLIs: ${JSON.stringify(snapshot.sli)}; breaches: ${snapshot.breaches.length}`);

    return res.status(200).json({
      success: true,
      sli: snapshot.sli,
      breaches: snapshot.breaches,
      persisted: !insertError,
    });
  } catch (error) {
    console.error('Health monitor error:', error);
    captureServerError(error, { tag: 'garmin.health_monitor_failed' });
    return res.status(500).json({ error: 'Health monitor failed', details: error.message });
  }
}
