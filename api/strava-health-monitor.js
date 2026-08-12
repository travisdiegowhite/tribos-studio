// Vercel API Route: Strava ingest health monitor (cron, hourly)
//
// Exists because the 2026-06-30 Strava app deactivation silently killed
// Strava activity ingestion fleet-wide for six weeks: token refresh kept
// succeeding (so every integration looked "Connected"), the webhook handler
// marked every failed event processed, and nothing alerted. This cron reads
// strava_webhook_events over the last 24h and pages when ingestion is broken,
// regardless of cause.
//
// Tags emitted (configure Sentry alert rules on these):
//   strava.app_inactive    — Strava has deactivated the API application itself
//   strava.ingest_failure  — every activity-create webhook in 24h failed the
//                            fetch step (silent fleet-wide ingest outage)
//
// Deliberately lightweight: no snapshot table, two count queries. Mirrors the
// alerting pattern of api/garmin-health-monitor.js.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { captureServerError, flushServerSentry } from './utils/serverSentry.js';
import { STRAVA_APP_INACTIVE_PROCESS_ERROR, STRAVA_FETCH_FAILED_PREFIX } from './utils/stravaAppStatus.js';

const supabase = getSupabaseAdmin();

// Minimum activity-create events in the window before an all-failed state is
// treated as an outage rather than noise from one or two flaky fetches.
const MIN_CREATES_FOR_OUTAGE = 5;

export default async function handler(req, res) {
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Strava Health Monitor Started ===');

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: creates24h, error: createsError } = await supabase
      .from('strava_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'activity')
      .eq('aspect_type', 'create')
      .gte('received_at', since);
    if (createsError) throw createsError;

    // App-inactive marker prefix, with the "(403)" suffix dropped so the LIKE
    // pattern carries no parentheses (PostgREST-safe).
    const appInactivePrefix = STRAVA_APP_INACTIVE_PROCESS_ERROR.split(' (')[0];

    // Fetch-step failures on creates. Two counts because the process_error is
    // either the generic fetch-failed string (legacy bare form or new
    // status-suffixed form) or the app-inactive marker — see
    // api/utils/stravaAppStatus.js. The sets are disjoint by construction.
    const { count: genericFails24h, error: failsError } = await supabase
      .from('strava_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'activity')
      .eq('aspect_type', 'create')
      .gte('received_at', since)
      .like('process_error', `${STRAVA_FETCH_FAILED_PREFIX}%`);
    if (failsError) throw failsError;

    const { count: inactiveCreates24h, error: inactiveCreatesError } = await supabase
      .from('strava_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'activity')
      .eq('aspect_type', 'create')
      .gte('received_at', since)
      .like('process_error', `${appInactivePrefix}%`);
    if (inactiveCreatesError) throw inactiveCreatesError;

    // App-inactive across ALL events (updates get the marker too).
    const { count: appInactive24h, error: inactiveError } = await supabase
      .from('strava_webhook_events')
      .select('id', { count: 'exact', head: true })
      .gte('received_at', since)
      .like('process_error', `${appInactivePrefix}%`);
    if (inactiveError) throw inactiveError;

    const sli = {
      creates_24h: creates24h ?? 0,
      fetch_failures_24h: (genericFails24h ?? 0) + (inactiveCreates24h ?? 0),
      app_inactive_24h: appInactive24h ?? 0,
    };

    const breaches = [];
    if (sli.app_inactive_24h > 0) {
      breaches.push({ sli: 'app_inactive_24h', value: sli.app_inactive_24h, threshold: 0, tag: 'strava.app_inactive' });
    }
    if (sli.creates_24h >= MIN_CREATES_FOR_OUTAGE && sli.fetch_failures_24h >= sli.creates_24h) {
      breaches.push({ sli: 'all_creates_failed_24h', value: sli.fetch_failures_24h, threshold: sli.creates_24h, tag: 'strava.ingest_failure' });
    }

    for (const b of breaches) {
      captureServerError(`Strava SLI breach: ${b.sli} = ${b.value} (threshold ${b.threshold})`, {
        tag: b.tag,
        extra: { sli: b.sli, value: b.value, threshold: b.threshold, ...sli },
      });
    }

    console.log('=== Strava Health Monitor Complete ===');
    console.log(`SLIs: ${JSON.stringify(sli)}; breaches: ${breaches.length}`);

    // Alerting is this cron's whole job — guarantee delivery before the
    // serverless freeze can drop buffered Sentry events.
    await flushServerSentry();

    return res.status(200).json({ success: true, sli, breaches });
  } catch (error) {
    console.error('Strava health monitor error:', error);
    captureServerError(error, { tag: 'strava.health_monitor_failed' });
    await flushServerSentry();
    return res.status(500).json({ error: 'Strava health monitor failed', details: error.message });
  }
}
