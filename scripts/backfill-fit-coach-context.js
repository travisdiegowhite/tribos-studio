#!/usr/bin/env node

/**
 * Backfill FIT Coach Context
 *
 * Diagnostic + opportunistic backfill for activities that are missing
 * `fit_coach_context` — the resampled uniform-interval time series used by
 * the Deep Ride Analysis endpoint (api/coach-ride-analysis.js). Before the
 * server-side pipeline shipped, FIT ingestion wrote only summary columns;
 * this script re-hydrates what it can.
 *
 * Strategy by provider:
 *   garmin   — If the row's raw_data carries a webhook callbackURL that's
 *              still within Garmin's 24-hour signing window, re-download
 *              and re-parse. Otherwise report as "needs manual action".
 *   wahoo    — If raw_data carries a still-valid file URL, re-download and
 *              re-parse. Otherwise report.
 *   strava   — Raw FIT bytes are never persisted server-side; reports only.
 *   fit_upload — Same; the user should re-upload via the in-app FIT modal,
 *              which now updates (rather than rejects) an existing row.
 *
 * Usage:
 *   node scripts/backfill-fit-coach-context.js [options]
 *
 * Options:
 *   --user-id <id>   Process only one user
 *   --limit <n>      Cap activities processed (default: 500)
 *   --dry-run        Report without writing anything
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { downloadAndParseFitFile } from '../api/utils/fitParser.js';
import { fetchAthleteProfile } from '../api/utils/athleteProfile.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// ─── CLI args ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { userId: null, limit: 500, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id') opts.userId = args[++i];
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

// ─── Row helpers ──────────────────────────────────────────────────────────

async function fetchCandidates({ userId, limit }) {
  let query = supabase
    .from('activities')
    .select('id, user_id, provider, provider_activity_id, name, start_date, moving_time, raw_data')
    .is('fit_coach_context', null)
    .gt('moving_time', 300)
    .order('start_date', { ascending: false })
    .limit(limit);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function findGarminFitUrl(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;
  // Webhook-ingested activities carry callbackURL under raw_data.webhook.
  const webhook = rawData.webhook;
  if (webhook?.callbackURL) return webhook.callbackURL;
  if (Array.isArray(webhook) && webhook[0]?.callbackURL) return webhook[0].callbackURL;
  if (rawData.callbackURL) return rawData.callbackURL;
  return null;
}

function findWahooFileUrl(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;
  return rawData.file?.url || rawData.file_url || null;
}

async function getGarminAccessToken(userId) {
  const { data } = await supabase
    .from('garmin_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.access_token || null;
}

// ─── Processor ────────────────────────────────────────────────────────────

async function reprocessOne(activity, { dryRun }) {
  const rawData = activity.raw_data || {};

  let fitUrl = null;
  let accessToken = null;

  if (activity.provider === 'garmin') {
    fitUrl = findGarminFitUrl(rawData);
    if (fitUrl) accessToken = await getGarminAccessToken(activity.user_id);
  } else if (activity.provider === 'wahoo') {
    fitUrl = findWahooFileUrl(rawData);
  }

  if (!fitUrl) return { status: 'no_url', reason: `No FIT URL available on raw_data for provider=${activity.provider}` };

  if (dryRun) return { status: 'would_process', fitUrl };

  try {
    const athlete = await fetchAthleteProfile(activity.user_id);
    const result = await downloadAndParseFitFile(fitUrl, accessToken || '', athlete);
    if (result.error) return { status: 'download_failed', reason: result.error };
    if (!result.fitCoachContext) return { status: 'no_context', reason: 'parser returned no coach context (file may be too short)' };

    const update = { updated_at: new Date().toISOString(), fit_coach_context: result.fitCoachContext };
    if (result.activityStreams) update.activity_streams = result.activityStreams;
    if (result.rideAnalytics) update.ride_analytics = result.rideAnalytics;
    if (result.powerMetrics?.powerCurveSummary) update.power_curve_summary = result.powerMetrics.powerCurveSummary;
    if (result.powerMetrics?.normalizedPower) update.normalized_power = result.powerMetrics.normalizedPower;
    if (result.powerMetrics?.intensityFactor) update.intensity_factor = result.powerMetrics.intensityFactor;
    if (result.powerMetrics?.trainingStressScore) update.tss = result.powerMetrics.trainingStressScore;

    const { error } = await supabase.from('activities').update(update).eq('id', activity.id);
    if (error) return { status: 'update_failed', reason: error.message };
    return { status: 'updated', sampleCount: result.fitCoachContext.sample_count };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log('⚙️  Options:', opts);

  const candidates = await fetchCandidates(opts);
  console.log(`📋 Found ${candidates.length} activities missing fit_coach_context`);

  // Summary by provider
  const byProvider = candidates.reduce((acc, a) => {
    acc[a.provider] = (acc[a.provider] || 0) + 1;
    return acc;
  }, {});
  console.log('   Breakdown:', byProvider);

  const tally = {
    updated: 0,
    would_process: 0,
    no_url: 0,
    no_context: 0,
    download_failed: 0,
    update_failed: 0,
    error: 0,
    manual_action_required: 0,
  };

  for (const activity of candidates) {
    // strava/fit_upload: raw FIT bytes are never persisted server-side; log
    // for manual remediation (user re-upload) and move on.
    if (activity.provider === 'strava' || activity.provider === 'fit_upload') {
      tally.manual_action_required++;
      console.log(`   ⚠️  [${activity.provider}] ${activity.start_date} "${activity.name}" — needs user re-upload`);
      continue;
    }

    const result = await reprocessOne(activity, opts);
    tally[result.status] = (tally[result.status] || 0) + 1;
    const tag = result.status.padEnd(16);
    console.log(`   ${tag} [${activity.provider}] ${activity.start_date} "${activity.name}"${result.reason ? ` — ${result.reason}` : ''}${result.sampleCount ? ` (${result.sampleCount} samples)` : ''}`);
  }

  console.log('\n✅ Done. Tally:', tally);
  if (tally.manual_action_required > 0) {
    console.log(`\nℹ️  ${tally.manual_action_required} activity(s) need a manual FIT re-upload by the user.`);
    console.log('    The in-app FIT upload modal now updates existing rows (rather than rejecting duplicates),');
    console.log('    so the user can re-upload their .fit file and the row will be enriched in place.');
  }
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
