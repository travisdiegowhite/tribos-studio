// Import one Wahoo workout into `activities`. Shared by the webhook and the
// manual "Sync now" path so both write exactly the same row.
//
// Idempotent: a workout already stored for this user (provider_activity_id)
// is UPDATED, never inserted twice — Wahoo documents that it may deliver the
// same webhook more than once, and it retries any delivery we fail.

import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { downloadAndParseFitFile } from '../fitParser.js';
import { fetchAthleteProfile } from '../athleteProfile.js';
import { checkForDuplicate, mergeActivityData, takeoverActivity } from '../activityDedup.js';
import { completeActivationStep, enqueueProactiveInsight, enqueueCheckIn } from '../activation.js';
import { enqueueDeviationAnalysis } from '../deviationProcessor.js';
import { triggerTrainingLoadRefresh } from '../trainingLoadRefresh.js';
import { buildWahooActivity, fitResultToActivityFields, splitWahooPayload, toLocalFakeUtc } from './normalize.js';
import { checkWahooFileUrl } from './fileHosts.js';
import { getValidWahooToken } from './tokens.js';

const IMMUTABLE = new Set(['user_id', 'provider', 'provider_activity_id']);

function warn(step, err) {
  console.warn(`⚠️ Wahoo ${step} failed (non-critical): ${err?.message || err}`);
}

/**
 * Download + parse the workout's FIT. Never throws; returns {} on any failure
 * so the workout still imports from its summary.
 */
async function parseWorkoutFit({ supabase, integration, summary, workout, athlete, deps }) {
  const url = summary?.file?.url;
  if (!url) return { fields: {}, note: 'no file url' };

  const check = checkWahooFileUrl(url);
  if (!check.allowed) {
    console.warn(`⚠️ Wahoo FIT not downloaded: ${check.reason}`);
    return { fields: {}, note: check.reason };
  }

  const download = deps.downloadAndParseFitFile || downloadAndParseFitFile;
  const storage = {
    supabase,
    userId: integration.user_id,
    activityId: String(workout.id),
    keyPrefix: 'wahoo',
  };

  // Wahoo file links are CDN URLs that take no auth; try without a token
  // first and only fall back to a bearer token if the CDN refuses.
  let result = await download(url, null, athlete, storage);
  if (result?.error && /Download failed: 40[13]/.test(result.error)) {
    try {
      const token = await getValidWahooToken(integration, deps);
      result = await download(url, token, athlete, storage);
    } catch (err) {
      warn('FIT token retry', err);
    }
  }
  if (result?.error) return { fields: {}, note: result.error };
  return { fields: fitResultToActivityFields(result, athlete?.ftp ?? null), note: null };
}

/** Steps after a NEW activity lands. Each is independent and non-fatal. */
async function runPostImportSteps(supabase, activity, userId, { live }) {
  try {
    const { assignGearToActivity } = await import('../gearAssignment.js');
    await assignGearToActivity(supabase, {
      activityId: activity.id,
      userId,
      activityType: activity.type,
      sportType: activity.sport_type ?? null,
      distance: activity.distance,
      stravaGearId: null,
      trainer: Boolean(activity.trainer),
    });
  } catch (err) { warn('gear assignment', err); }

  await runRecomputeSteps(supabase, activity, userId);

  try {
    const { analyzeSegmentsForNewActivity } = await import('../segmentAnalysisPipeline.js');
    await analyzeSegmentsForNewActivity(activity.id, userId);
  } catch (err) { warn('segment analysis', err); }

  await completeActivationStep(supabase, userId, 'first_sync').catch((err) => warn('activation', err));

  // Coach-facing follow-ups only for a ride that just happened. A manual sync
  // of last month's history must not enqueue a check-in per workout.
  if (!live) return;
  try {
    await enqueueProactiveInsight(supabase, userId, activity.id);
    const checkInId = await enqueueCheckIn(supabase, userId, activity.id);
    if (checkInId) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.tribos.studio';
      fetch(`${baseUrl}/api/coach-check-in-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
        body: JSON.stringify({ checkInId }),
      }).catch(() => {});
    }
    enqueueDeviationAnalysis(supabase, userId, activity.id).catch(() => {});
  } catch (err) { warn('coach follow-ups', err); }
}

/** Steps after an activity's numbers change (insert, update or takeover). */
async function runRecomputeSteps(supabase, activity, userId) {
  try {
    const { updateSnapshotForActivity } = await import('../fitnessSnapshots.js');
    await updateSnapshotForActivity(supabase, userId, activity.start_date);
  } catch (err) { warn('snapshot update', err); }
  try {
    const { computeAndStoreMetrics } = await import('../metricsComputation.js');
    await computeAndStoreMetrics(supabase, userId, activity.id);
  } catch (err) { warn('metrics computation', err); }
  triggerTrainingLoadRefresh(userId).catch(() => {});
}

/**
 * Record a successful import on the integration. The FIRST success also makes
 * Wahoo the primary source by turning Strava auto-import off — deliberately
 * not done at connect time, so a Wahoo connection that never delivers can
 * never silence Strava.
 */
async function markIntegrationSynced(supabase, integration) {
  const firstSuccess = !integration.last_sync_at;
  const now = new Date().toISOString();
  await supabase
    .from('bike_computer_integrations')
    .update({ last_sync_at: now, status: 'active', error_message: null, updated_at: now })
    .eq('id', integration.id);
  integration.last_sync_at = now;

  if (firstSuccess) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ strava_auto_sync_enabled: false })
      .eq('id', integration.user_id);
    if (error) warn('Strava auto-import switch-off', error);
    else console.log('🛑 First Wahoo import — Strava auto-import disabled (Wahoo is now primary)');
  }
}

export async function recordIntegrationError(supabase, integration, message) {
  await supabase
    .from('bike_computer_integrations')
    .update({ error_message: String(message).slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', integration.id)
    .then(() => {}, () => {});
}

/**
 * @param {object} integration  bike_computer_integrations row
 * @param {object} payload      { summary, workout } — either may be nested in the other
 * @param {object} opts
 * @param {'wahoo_webhook'|'wahoo_manual_sync'} opts.source
 * @param {object} [opts.raw]   what to store in raw_data (the webhook body)
 * @param {boolean} [opts.skipExisting]  return 'unchanged' for an already-imported
 *   workout instead of re-downloading its FIT (manual sync; the webhook updates)
 * @param {object} [opts.deps]  test seams: { supabase, downloadAndParseFitFile, fetchImpl }
 * @returns {Promise<{status: 'inserted'|'updated'|'merged'|'takeover'|'skipped'|'unchanged', activityId?: string, reason?: string, fitNote?: string|null}>}
 * @throws on a database failure (callers treat it as transient)
 */
export async function ingestWahooWorkout(integration, payload, { source, raw = null, skipExisting = false, deps = {} } = {}) {
  const supabase = deps.supabase || getSupabaseAdmin();
  const userId = integration.user_id;
  const { summary, workout } = splitWahooPayload(payload);
  const live = source === 'wahoo_webhook';

  const athlete = await fetchAthleteProfile(userId);
  const { row, skipReason } = buildWahooActivity({
    userId, summary, workout, ftp: athlete?.ftp ?? null, source, raw,
  });
  if (!row) return { status: 'skipped', reason: skipReason };

  // Wahoo's time_zone may not be an IANA name; fall back to the athlete's
  // profile zone so an evening ride is not filed under the next UTC day.
  if (!row.start_date_local) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const local = toLocalFakeUtc(row.start_date, profile?.timezone);
    if (local) row.start_date_local = local;
  }

  const { data: existing, error: lookupError } = await supabase
    .from('activities')
    .select('id, start_date')
    .eq('user_id', userId)
    .eq('provider', 'wahoo')
    .eq('provider_activity_id', row.provider_activity_id)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(`Wahoo activity lookup failed: ${lookupError.message}`);
  if (existing && skipExisting) return { status: 'unchanged', activityId: existing.id };

  const fit = await parseWorkoutFit({ supabase, integration, summary, workout, athlete, deps });
  Object.assign(row, fit.fields);

  // ── Already imported: refresh it (a re-delivery or an edited workout) ──
  if (existing) {
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(row)) if (!IMMUTABLE.has(k)) updates[k] = v;
    const { error } = await supabase.from('activities').update(updates).eq('id', existing.id);
    if (error) throw new Error(`Wahoo activity update failed: ${error.message}`);
    await runRecomputeSteps(supabase, { id: existing.id, start_date: row.start_date }, userId);
    await markIntegrationSynced(supabase, integration);
    return { status: 'updated', activityId: existing.id, fitNote: fit.note };
  }

  // ── Same ride already here from another provider ──
  const dup = await checkForDuplicate(userId, row.start_date, row.distance, 'wahoo', row.provider_activity_id);
  if (dup.isDuplicate) {
    const targetId = dup.existingActivity.id;
    if (dup.shouldTakeover) {
      // Wahoo (90) outranks the existing copy (e.g. Strava 50): Wahoo becomes
      // the source of truth. takeoverActivity swaps the core fields; the
      // follow-up update adds what it does not carry (streams, TSS, IF, …).
      const result = await takeoverActivity(targetId, row, 'wahoo', row.provider_activity_id);
      if (!result.success) throw new Error(`Wahoo takeover failed: ${result.error}`);
      const extra = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(row)) if (!IMMUTABLE.has(k) && k !== 'raw_data') extra[k] = v;
      const { error } = await supabase.from('activities').update(extra).eq('id', targetId);
      if (error) warn('post-takeover update', error);
      await runRecomputeSteps(supabase, { id: targetId, start_date: row.start_date }, userId);
      await markIntegrationSynced(supabase, integration);
      return { status: 'takeover', activityId: targetId, fitNote: fit.note };
    }
    // Lower/equal priority (e.g. a Garmin copy exists): fill gaps only.
    await mergeActivityData(targetId, row, 'wahoo');
    await markIntegrationSynced(supabase, integration);
    return { status: 'merged', activityId: targetId, fitNote: fit.note };
  }

  // ── New activity ──
  const { data: activity, error: insertError } = await supabase
    .from('activities')
    .insert(row)
    .select('id, type, sport_type, distance, trainer, start_date')
    .single();
  if (insertError) {
    await recordIntegrationError(supabase, integration, `Import failed: ${insertError.message}`);
    throw new Error(`Wahoo activity insert failed: ${insertError.message}`);
  }

  console.log(`✅ Wahoo workout ${row.provider_activity_id} imported as ${activity.id} (${row.type}, fit: ${fit.note || 'parsed'})`);
  await runPostImportSteps(supabase, activity, userId, { live });
  await markIntegrationSynced(supabase, integration);
  return { status: 'inserted', activityId: activity.id, fitNote: fit.note };
}
