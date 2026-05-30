/**
 * writeActivity — persist one pulled Garmin activity end-to-end.
 *
 * Phase 1 of the Garmin ping/pull rebuild. Given an authenticated integration
 * row, a ping queue row, and the matched §7.3 Activity Details payload,
 * this module owns the entire database write path:
 *
 *   1. Parse the §7.3 JSON into the canonical fitParser-shape streams (via the
 *      existing `extractStreamsFromActivityDetails`).
 *   2. Derive TSS / IF / RSS / RI from NP + athlete FTP (`deriveTss`), since
 *      §7.3 does not return device-computed values.
 *   3. Build the base activity row (`buildActivityData`).
 *   4. Cross-provider duplicate check (`checkForDuplicate` against Strava /
 *      Wahoo / COROS). On hit, take over or merge per the existing semantics.
 *   5. Insert / update the row with full streams + dual-write metric columns
 *      (`normalized_power` + `effective_power`, `tss` + `rss`, `intensity_factor`
 *      + `ride_intensity`), polyline, power curve, and completeness.
 *   6. Fire the full post-import side-effect chain — gear assignment, backfill
 *      chunk credit, fitness snapshot, proprietary metrics, activation +
 *      insight + coaching check-in + deviation analysis, post-ride push.
 *      Every step is non-fatal; a side-effect failure doesn't fail the write.
 *
 * The chain is a faithful 1:1 lift of the relevant blocks in
 * `api/garmin-webhook-process.js` (lines 529–663 / 675–782). Phase 6 deletes
 * those, leaving this module as the single Garmin write path.
 *
 * NOTE: §7.3 does not return ride analytics or the FIT coach context (those
 * are derived during FIT parsing in the legacy path). For the ping/pull path
 * we leave `ride_analytics` and `fit_coach_context` null on insert. They're
 * not required to flip `data_completeness` to 'full'. A future enhancement
 * could derive a partial ride_analytics from the §7.3 samples; out of scope
 * for Phase 1.
 */

import { extractStreamsFromActivityDetails } from '../garmin/activityDetailsParser.js';
import { buildActivityData } from '../garmin/activityBuilder.js';
import { deriveCompleteness, refreshCompleteness } from '../garmin/completeness.js';
import { checkForDuplicate, takeoverActivity, mergeActivityData } from '../activityDedup.js';
import { fetchAthleteProfile } from '../athleteProfile.js';
import { updateBackfillChunkIfApplicable } from '../garminBackfill.js';
import { updateSnapshotForActivity } from '../fitnessSnapshots.js';
import { assignGearToActivity } from '../gearAssignment.js';
import { computeAndStoreMetrics } from '../metricsComputation.js';
import { completeActivationStep, enqueueProactiveInsight, enqueueCheckIn } from '../activation.js';
import { enqueueDeviationAnalysis } from '../deviationProcessor.js';
import { sendPushToUser, buildPostRideMessage } from '../pushNotification.js';
import { captureServerError } from '../serverSentry.js';
import { deriveTss } from './deriveTss.js';

/**
 * Map the parsed result of `extractStreamsFromActivityDetails` plus an
 * athlete FTP into the activity-column update patch we'll write. Pure.
 *
 * @param {object} parsed     Output of extractStreamsFromActivityDetails.
 * @param {number|null} ftp   Athlete FTP, or null.
 * @returns {{
 *   patch: object,    // Activity columns to set
 *   hasPower: boolean,
 *   summary: object,  // §7.3 summary, exposed for the row builder upstream
 * }}
 */
export function buildActivityPatch(parsed, ftp) {
  const patch = { updated_at: new Date().toISOString() };
  if (parsed.polyline) patch.map_summary_polyline = parsed.polyline;
  if (parsed.activityStreams) patch.activity_streams = parsed.activityStreams;

  const pm = parsed.powerMetrics;
  let hasPower = false;
  if (pm) {
    hasPower = pm.hasPowerData === true;
    if (pm.avgPower != null) patch.average_watts = pm.avgPower;
    if (pm.normalizedPower != null) {
      // Dual-write canonical + legacy per metrics-freeze policy.
      patch.normalized_power = pm.normalizedPower;
      patch.effective_power = pm.normalizedPower;
    }
    if (pm.maxPower != null) patch.max_watts = pm.maxPower;
    if (pm.powerCurveSummary) patch.power_curve_summary = pm.powerCurveSummary;
    if (pm.workKj != null) patch.kilojoules = pm.workKj;
    if (hasPower) patch.device_watts = true;
  }

  // Derive TSS/IF/RSS/RI from NP + FTP since §7.3 omits device values.
  const np = pm?.normalizedPower ?? null;
  const durationSec = parsed.summary?.duration ?? null;
  const derived = deriveTss({ np, ftp, durationSec });
  if (derived.tss != null) {
    patch.tss = derived.tss;
    patch.rss = derived.rss;
  }
  if (derived.intensityFactor != null) {
    patch.intensity_factor = derived.intensityFactor;
    patch.ride_intensity = derived.rideIntensity;
  }

  return { patch, hasPower, summary: parsed.summary };
}

/**
 * Persist one pulled activity. Top-level orchestrator.
 *
 * @param {object} args
 * @param {object} args.supabase
 * @param {object} args.integration   Row from bike_computer_integrations.
 *                                    Required: id, user_id.
 * @param {object} args.ping          Row from garmin_webhook_events. Required:
 *                                    activity_id (= summaryId), payload.
 * @param {object} args.detail        §7.3 detail (output of pullActivityDetail).
 * @param {object} [args.deps]        Test seam — override individual side-effect
 *                                    callables. Defaults to the live imports.
 * @returns {Promise<{
 *   activityId: string|null,
 *   action: 'inserted'|'updated'|'taken_over'|'merged'|'skipped',
 *   completeness: string|null,
 *   error: Error|null,
 * }>}
 */
export async function writeActivityFromDetail({ supabase, integration, ping, detail, deps = {} } = {}) {
  if (!supabase || !integration || !ping || !detail) {
    return { activityId: null, action: 'skipped', completeness: null, error: new Error('missing required args') };
  }

  const d = withDeps(deps);

  try {
    const parsed = d.extractStreamsFromActivityDetails(detail);
    if (parsed.error) {
      throw new Error(`extractStreams failed: ${parsed.error}`);
    }

    // FTP for TSS derivation. Non-fatal if profile fetch fails.
    let athlete = null;
    try {
      athlete = await d.fetchAthleteProfile(integration.user_id);
    } catch (athleteErr) {
      console.warn(`[PULL:WRITE] athlete profile fetch failed for ${integration.user_id}: ${athleteErr.message}`);
    }
    const ftp = athlete?.ftp ?? null;

    const { patch, hasPower } = buildActivityPatch(parsed, ftp);

    // === Case A: this Garmin activity already exists in our table ===
    // Re-runs of the puller (e.g. retried ping) UPDATE in place. We don't
    // run the dedup or side-effect chain again — those fired on the first
    // landing.
    const { data: existing } = await supabase
      .from('activities')
      .select('id, user_id, data_completeness')
      .eq('user_id', integration.user_id)
      .eq('provider', 'garmin')
      .eq('provider_activity_id', String(ping.activity_id))
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from('activities')
        .update(patch)
        .eq('id', existing.id);
      if (updErr) throw updErr;

      const completeness = await d.refreshCompleteness(supabase, existing.id).catch(() => null);
      return { activityId: existing.id, action: 'updated', completeness, error: null };
    }

    // === Case B: new activity ===
    // Build the base row from the §7.3 summary, then layer the
    // streams/power/polyline patch on top so the INSERT lands `'full'` in one
    // shot (instead of insert summary_only → update full).
    const activityInfo = mapDetailToActivityInfo(detail, ping);
    const baseRow = d.buildActivityData(
      integration.user_id,
      String(ping.activity_id),
      activityInfo,
      'garmin_pull',
    );
    baseRow.raw_data = { ping: ping.payload, pulled_at: new Date().toISOString() };

    const fullRow = { ...baseRow, ...patch };
    // updated_at is in patch; the activity row needs created_at semantics, so
    // we let the DB default handle it (don't set it explicitly).
    fullRow.data_completeness = d.deriveCompleteness(fullRow) || 'summary_only';

    // Cross-provider dedup check. Distance/duration come from the §7.3 summary.
    const dupCheck = await d.checkForDuplicate(
      integration.user_id,
      fullRow.start_date,
      fullRow.distance,
      'garmin',
      String(ping.activity_id),
    );

    if (dupCheck.isDuplicate) {
      return await handleDuplicate({
        supabase, integration, ping, fullRow, patch, dupCheck, deps: d,
      });
    }

    const { data: activity, error: insertErr } = await supabase
      .from('activities')
      .insert(fullRow)
      .select()
      .single();
    if (insertErr) throw insertErr;

    await runPostImportSideEffects({
      supabase,
      integration,
      activity,
      activityInfo,
      hasPower,
      deps: d,
    });

    return {
      activityId: activity.id,
      action: 'inserted',
      completeness: fullRow.data_completeness,
      error: null,
    };
  } catch (err) {
    d.captureServerError(err, {
      tag: 'garmin.pull_write_error',
      extra: { event_id: ping.id, user_id: integration.user_id, activity_id: ping.activity_id },
    });
    return { activityId: null, action: 'skipped', completeness: null, error: err };
  }
}

async function handleDuplicate({ supabase, integration, ping, fullRow, patch, dupCheck, deps }) {
  const targetId = dupCheck.existingActivity.id;

  if (dupCheck.shouldTakeover) {
    console.log(`🔄 [PULL] Garmin taking over from ${dupCheck.existingActivity.provider} for activity ${targetId}`);
    const result = await deps.takeoverActivity(targetId, fullRow, 'garmin', String(ping.activity_id));
    if (!result.success) {
      return { activityId: targetId, action: 'skipped', completeness: null, error: new Error(`takeover failed: ${result.error}`) };
    }
    // Layer the stream/power patch on top of the taken-over row.
    const { error: updErr } = await supabase
      .from('activities')
      .update(patch)
      .eq('id', targetId);
    if (updErr) throw updErr;
    const completeness = await deps.refreshCompleteness(supabase, targetId).catch(() => null);
    return { activityId: targetId, action: 'taken_over', completeness, error: null };
  }

  // Non-takeover duplicate — merge metric columns Garmin provides but the
  // existing row may lack.
  const garminData = {
    total_elevation_gain: fullRow.total_elevation_gain || null,
    average_watts: fullRow.average_watts || null,
    average_heartrate: fullRow.average_heartrate || null,
    max_heartrate: fullRow.max_heartrate || null,
    average_cadence: fullRow.average_cadence || null,
    kilojoules: fullRow.kilojoules || null,
    raw_data: fullRow.raw_data,
  };
  await deps.mergeActivityData(targetId, garminData, 'garmin');
  // And layer streams/power on top so the existing row gains the data it lacked.
  const { error: updErr } = await supabase
    .from('activities')
    .update(patch)
    .eq('id', targetId);
  if (updErr) throw updErr;
  const completeness = await deps.refreshCompleteness(supabase, targetId).catch(() => null);
  return { activityId: targetId, action: 'merged', completeness, error: null };
}

/**
 * Map a §7.3 detail + ping into the `activityInfo` shape that
 * `buildActivityData` expects (which mirrors the webhook payload + API
 * details shape from the legacy push path).
 */
export function mapDetailToActivityInfo(detail, ping) {
  const s = detail.summary || {};
  return {
    summaryId: detail.summaryId ?? `${ping.activity_id}-detail`,
    activityId: detail.activityId ?? ping.activity_id,
    activityType: s.activityType ?? null,
    activityName: s.activityName ?? null,
    startTimeInSeconds: s.startTimeInSeconds ?? null,
    startTimeOffsetInSeconds: s.startTimeOffsetInSeconds ?? 0,
    durationInSeconds: s.durationInSeconds ?? null,
    distanceInMeters: s.distanceInMeters ?? null,
    activeKilocalories: s.activeKilocalories ?? null,
    averageHeartRateInBeatsPerMinute: s.averageHeartRateInBeatsPerMinute ?? null,
    maxHeartRateInBeatsPerMinute: s.maxHeartRateInBeatsPerMinute ?? null,
    averageSpeedInMetersPerSecond: s.averageSpeedInMetersPerSecond ?? null,
    maxSpeedInMetersPerSecond: s.maxSpeedInMetersPerSecond ?? null,
    averageRunCadenceInStepsPerMinute: s.averageRunCadenceInStepsPerMinute ?? null,
    averageBikeCadenceInRoundsPerMinute: s.averageBikeCadenceInRoundsPerMinute ?? null,
    totalElevationGainInMeters: s.totalElevationGainInMeters ?? null,
    totalElevationLossInMeters: s.totalElevationLossInMeters ?? null,
    deviceName: s.deviceName ?? null,
    isParent: s.isParent ?? null,
    manual: s.manual ?? null,
  };
}

/**
 * The post-import side-effect chain. Each step is non-fatal; failures are
 * logged but don't fail the write. Lifted from
 * api/garmin-webhook-process.js:573–663.
 */
async function runPostImportSideEffects({ supabase, integration, activity, activityInfo, hasPower, deps }) {
  // 1. Gear assignment
  try {
    await deps.assignGearToActivity(supabase, {
      activityId: activity.id,
      userId: integration.user_id,
      activityType: activity.type,
      distance: activity.distance,
      stravaGearId: null,
    });
  } catch (err) {
    console.error('⚠️ [PULL] Gear assignment failed (non-critical):', err.message);
  }

  // 2. Backfill chunk credit (so the historical-backfill orchestrator can
  // tell which chunks have landed activities).
  if (activityInfo?.startTimeInSeconds) {
    try {
      await deps.updateBackfillChunkIfApplicable(integration.user_id, activityInfo.startTimeInSeconds);
    } catch (err) {
      console.error('⚠️ [PULL] Backfill chunk update failed (non-critical):', err.message);
    }
  }

  // 3. Fitness snapshot for the week of this activity.
  try {
    await deps.updateSnapshotForActivity(supabase, integration.user_id, activity.start_date);
  } catch (err) {
    console.error('⚠️ [PULL] Snapshot update failed (non-critical):', err.message);
  }

  // 4. Proprietary metrics (EFI / TWL).
  try {
    await deps.computeAndStoreMetrics(supabase, integration.user_id, activity.id);
  } catch (err) {
    console.error('⚠️ [PULL] Metrics computation failed (non-critical):', err.message);
  }

  // 5. Activation + insight + coaching check-in + deviation analysis.
  try {
    await deps.completeActivationStep(supabase, integration.user_id, 'first_sync');
    await deps.enqueueProactiveInsight(supabase, integration.user_id, activity.id);

    const checkInId = await deps.enqueueCheckIn(supabase, integration.user_id, activity.id);
    if (checkInId) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.tribos.studio';
      fetch(`${baseUrl}/api/coach-check-in-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
        body: JSON.stringify({ checkInId }),
      }).catch(() => {});
    }
    deps.enqueueDeviationAnalysis(supabase, integration.user_id, activity.id).catch(() => {});
  } catch (err) {
    console.error('⚠️ [PULL] Activation tracking failed (non-critical):', err.message);
  }

  // 6. Post-ride push notification (fire-and-forget).
  try {
    const { data: latestLoad } = await supabase
      .from('training_load_daily')
      .select('tfi, afi, form_score')
      .eq('user_id', integration.user_id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const message = deps.buildPostRideMessage(latestLoad);
    deps.sendPushToUser(integration.user_id, {
      ...message,
      url: '/dashboard',
      notificationType: 'post_ride_insight',
      referenceId: activity.id,
    }).catch((e) => console.error('⚠️ [PULL] Push failed (non-fatal):', e.message));
  } catch (err) {
    console.error('⚠️ [PULL] Push notification failed (non-fatal):', err.message);
  }

  // hasPower is unused for now; reserved for future variations of the chain
  // (e.g. skipping certain steps for HR-only rides).
  void hasPower;
}

/**
 * Allow tests to inject mocks for the heavy dependency chain. In production
 * every key resolves to the real module import.
 */
function withDeps(overrides) {
  return {
    extractStreamsFromActivityDetails,
    buildActivityData,
    deriveCompleteness,
    refreshCompleteness,
    checkForDuplicate,
    takeoverActivity,
    mergeActivityData,
    fetchAthleteProfile,
    updateBackfillChunkIfApplicable,
    updateSnapshotForActivity,
    assignGearToActivity,
    computeAndStoreMetrics,
    completeActivationStep,
    enqueueProactiveInsight,
    enqueueCheckIn,
    enqueueDeviationAnalysis,
    sendPushToUser,
    buildPostRideMessage,
    captureServerError,
    ...overrides,
  };
}
