// Vercel API Route: Manual FIT File Upload
//
// Accepts a base64-encoded FIT file from the browser (single-file upload or
// a file extracted from a Strava-export ZIP), runs the full analytics
// pipeline used by Garmin/Wahoo webhooks (polyline, activity_streams,
// ride_analytics, fit_coach_context, power curve, NP, TSS, IF), and
// inserts — or updates, if the user is re-uploading — an activities row.
//
// Fixes the architectural gap where manual uploads parsed client-side and
// wrote the row directly from the browser, bypassing every server-side
// analytic (fit_coach_context, activity_streams, power_curve_summary, etc.)
// and making deep ride analysis unavailable for uploaded rides.
//
// POST /api/fit-upload
// Auth:  Bearer <JWT>
// Body:  {
//   fileName:           string,
//   fileBase64:         string,         // raw FIT bytes, base64-encoded
//   compressed:         boolean,        // true for .fit.gz
//   stravaActivityName: string|null,    // optional, preserved from activities.csv
//   provider:           'fit_upload'|'garmin'|undefined,  // defaults to 'fit_upload'
//   garminActivityId:   string|undefined  // required when provider==='garmin';
//                                         // numeric Garmin activity ID parsed
//                                         // from the FIT filename in a
//                                         // Garmin Connect "Export Your Data"
//                                         // ZIP. Used as provider_activity_id
//                                         // so bulk imports dedupe against
//                                         // webhook-imported activities.
// }
// Response: { success, action: 'inserted'|'updated', activity }

import zlib from 'zlib';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { parseFitBuffer } from './utils/fitParser.js';
import { fetchAthleteProfile } from './utils/athleteProfile.js';

const supabase = getSupabaseAdmin();

// Vercel's JSON body limit is ~4.5 MB; base64 overhead is ~33%, so reject
// bodies over 3 MB of base64 (≈ 2.25 MB decoded — far larger than any real
// FIT file). Guards against accidental video/ZIP uploads.
const MAX_BASE64_BYTES = 3 * 1024 * 1024;

// FIT files must be at least 14 bytes (12-byte header + 2-byte CRC).
const MIN_FIT_BYTES = 14;

// Sanitizers that mirror the client-side fitToActivityFormat bounds. These
// protect the activities table from obviously corrupt FIT files.
const MAX_DISTANCE_M = 500_000; // 500 km
const MAX_MOVING_SECONDS = 86_400; // 24 h
const MAX_ELAPSED_SECONDS = 172_800; // 48 h
const MAX_ELEV_GAIN_M = 6_000; // 20k ft
const MAX_SPEED_MPS = 50; // 180 km/h
const MAX_AVG_SPEED_MPS = 30; // 108 km/h
const MAX_POWER_W = 2_000;
const MAX_HR_BPM = 250;

function sanitize(val, max, defaultVal = null) {
  if (val == null || Number.isNaN(val) || val < 0 || val > max) return defaultVal;
  return val;
}

/**
 * Validate the FIT protocol magic. At offset 8 a valid FIT file contains
 * the ASCII bytes ".FIT". Rejecting non-FIT content early saves a full
 * parser invocation on GPX/ZIP/random payloads.
 */
function hasFitMagic(buffer) {
  if (!buffer || buffer.length < 12) return false;
  return (
    buffer[8] === 0x2e && // '.'
    buffer[9] === 0x46 && // 'F'
    buffer[10] === 0x49 && // 'I'
    buffer[11] === 0x54 // 'T'
  );
}

/**
 * Map the FIT session sport string to the activity.type + sport_type
 * columns. Mirrors the client-side mapping so row shape is unchanged.
 */
function mapSport(sport) {
  const s = (sport || 'cycling').toLowerCase();
  if (s === 'cycling' || s === 'biking') return { type: 'Ride', sport_type: 'cycling' };
  if (s === 'running') return { type: 'Run', sport_type: 'running' };
  if (s === 'swimming') return { type: 'Swim', sport_type: 'swimming' };
  return { type: s.charAt(0).toUpperCase() + s.slice(1), sport_type: s };
}

/**
 * Build an activity display name, preferring the actual Strava activity name
 * (from the ZIP's activities.csv) over filename/metadata guesses.
 */
function buildActivityName({ stravaActivityName, fileName, startTime, sport }) {
  if (stravaActivityName) return stravaActivityName;

  const sportName = (sport || 'cycling').charAt(0).toUpperCase() + (sport || 'cycling').slice(1);

  if (fileName) {
    const cleanName = fileName.replace(/\.(fit|fit\.gz)$/i, '').split('/').pop();
    if (/^\d+$/.test(cleanName)) {
      // Strava export style numeric filename — prefer a date-based name.
      const date = startTime ? new Date(startTime) : new Date();
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${sportName} - ${dateStr}`;
    }
    return cleanName.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim() || `${sportName} Activity`;
  }

  return `${sportName} Activity`;
}

function decodeBase64ToBuffer(fileBase64, compressed) {
  const raw = Buffer.from(fileBase64, 'base64');
  if (!compressed) return raw;
  return zlib.gunzipSync(raw);
}

/**
 * Look up a matching existing activity to enable "re-upload to update"
 * semantics. Strict match: same user + start time within ±60s + distance
 * within ±5%. Returns the row id or null.
 */
/**
 * ID-first dedupe for Garmin bulk imports. Looks up an existing row whose
 * provider/provider_activity_id already match what this Garmin export FIT
 * would write. Catches both webhook-imported rows (no streams/analytics) and
 * re-runs of the same bulk import.
 */
async function findExistingByGarminId(userId, garminActivityId) {
  const { data, error } = await supabase
    .from('activities')
    .select('id, name, gear_id, provider, provider_activity_id')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .eq('provider_activity_id', garminActivityId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('fit-upload: garmin-id lookup failed (non-fatal):', error.message);
    return null;
  }
  return data;
}

async function findExistingActivity(userId, startTimeIso, distanceMeters) {
  if (!startTimeIso) return null;
  const start = new Date(startTimeIso);
  if (Number.isNaN(start.getTime())) return null;

  const lo = new Date(start.getTime() - 60_000).toISOString();
  const hi = new Date(start.getTime() + 60_000).toISOString();
  // If distance is 0/null we can't do the ±5% window; fall back to any
  // activity with a matching start time.
  const hasDistance = typeof distanceMeters === 'number' && distanceMeters > 0;

  let query = supabase
    .from('activities')
    .select('id, name, gear_id, provider, provider_activity_id')
    .eq('user_id', userId)
    .gte('start_date_local', lo)
    .lte('start_date_local', hi);

  if (hasDistance) {
    query = query.gte('distance', distanceMeters * 0.95).lte('distance', distanceMeters * 1.05);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    console.warn('fit-upload: duplicate lookup failed (non-fatal):', error.message);
    return null;
  }
  return data;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please sign in again.' });
  }
  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please sign in again.' });
  }
  const userId = user.id;

  const { fileName, fileBase64, compressed, stravaActivityName, provider: providerRaw, garminActivityId: garminActivityIdRaw } = req.body || {};

  // Provider tagging. Default 'fit_upload' preserves Strava bulk + single-file
  // upload behavior; 'garmin' opts the request into Garmin-export semantics
  // (real provider_activity_id from filename, dedupe against webhook rows).
  const provider = providerRaw === 'garmin' ? 'garmin' : 'fit_upload';
  let garminActivityId = null;
  if (provider === 'garmin') {
    if (typeof garminActivityIdRaw !== 'string' || !/^\d+$/.test(garminActivityIdRaw)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'garminActivityId is required and must be numeric when provider="garmin".',
      });
    }
    garminActivityId = garminActivityIdRaw;
  }

  // Rate limit — caps accidental base64 spam and runaway bulk imports.
  // Garmin exports can contain thousands of files and the modal pushes
  // ~20-wide parallelism, so the bulk-Garmin bucket is generous; the regular
  // fit-upload bucket stays tight.
  const rateLimitBucket = provider === 'garmin' ? 'fit-upload-garmin' : 'fit-upload';
  const rateLimitMax = provider === 'garmin' ? 600 : 60;
  const limited = await rateLimitByUser(req, res, rateLimitBucket, userId, rateLimitMax, 5);
  if (limited) return;

  if (!fileBase64 || typeof fileBase64 !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'fileBase64 is required' });
  }
  if (fileBase64.length > MAX_BASE64_BYTES) {
    return res.status(413).json({ error: 'payload_too_large', message: 'FIT file is too large (max ~2MB).' });
  }

  // Decode + decompress
  let fitBuffer;
  try {
    fitBuffer = decodeBase64ToBuffer(fileBase64, !!compressed);
  } catch (err) {
    return res.status(400).json({ error: 'decode_failed', message: `Could not decode file: ${err.message}` });
  }

  if (fitBuffer.length < MIN_FIT_BYTES) {
    return res.status(400).json({ error: 'invalid_fit', message: 'File is too small to be a valid FIT file.' });
  }
  if (!hasFitMagic(fitBuffer)) {
    return res.status(400).json({ error: 'invalid_fit', message: 'File does not appear to be a FIT file.' });
  }

  // Parse + analyze
  const athlete = await fetchAthleteProfile(userId);
  const result = await parseFitBuffer(fitBuffer, athlete);

  if (result.error) {
    return res.status(400).json({ error: 'parse_failed', message: result.error });
  }

  const summary = result.summary;
  if (!summary || !summary.startTime) {
    // Garmin's "Export Your Data" UploadedFiles archive contains every FIT
    // the user has ever uploaded — monitoring, wellness, sleep, sport, settings,
    // etc. — not just activities. Those parse cleanly but have no session
    // message, so they're "not an activity" rather than an error. Return 200
    // with action: 'skipped' so the client tallies them in the Skipped bucket.
    return res.status(200).json({
      success: true,
      action: 'skipped',
      reason: 'not_activity_file',
      message: 'FIT file is not an activity (likely monitoring, wellness, or settings data).',
    });
  }

  // Build the row
  const { type, sport_type } = mapSport(summary.sport);
  const activityName = buildActivityName({
    stravaActivityName,
    fileName,
    startTime: summary.startTime,
    sport: summary.sport,
  });

  const distance = sanitize(summary.totalDistance, MAX_DISTANCE_M, 0);
  const movingTime = sanitize(Math.round(summary.totalTime), MAX_MOVING_SECONDS, 0);
  const elapsedTime = sanitize(
    Math.round(summary.totalElapsedTime || summary.totalTime),
    MAX_ELAPSED_SECONDS,
    movingTime
  );
  const elevGain = sanitize(summary.totalAscent, MAX_ELEV_GAIN_M, 0);
  const avgSpeed = sanitize(summary.avgSpeed, MAX_AVG_SPEED_MPS, null);
  const maxSpeedVal = sanitize(summary.maxSpeed, MAX_SPEED_MPS, null);
  const avgHR = sanitize(summary.avgHeartRate, MAX_HR_BPM, null);
  const maxHR = sanitize(summary.maxHeartRate, MAX_HR_BPM, null);

  const pm = result.powerMetrics || {};
  const avgPower = sanitize(pm.avgPower ?? summary.avgPower, MAX_POWER_W, null);
  const maxPower = sanitize(pm.maxPower ?? summary.maxPower, MAX_POWER_W, null);
  const normalizedPower = sanitize(pm.normalizedPower ?? summary.normalizedPower, MAX_POWER_W, null);
  const workKj = pm.workKj ?? (avgPower && movingTime ? Math.round((avgPower * movingTime) / 1000) : null);

  const providerActivityId = provider === 'garmin'
    ? garminActivityId
    : `fit_${new Date(summary.startTime).getTime()}_${Math.random().toString(36).slice(2, 11)}`;

  const rawData = {
    source: provider === 'garmin' ? 'garmin_bulk_export' : 'fit_upload',
    device: summary.manufacturer,
    product: summary.product,
    serial_number: summary.serialNumber,
    sub_sport: summary.subSport,
    file_name: fileName || null,
    uploaded_at: new Date().toISOString(),
  };

  const insertRow = {
    user_id: userId,
    provider,
    provider_activity_id: providerActivityId,
    name: activityName,
    type,
    sport_type,
    start_date: summary.startTime,
    start_date_local: summary.startTime,
    distance,
    moving_time: movingTime,
    elapsed_time: elapsedTime,
    total_elevation_gain: elevGain,
    average_speed: avgSpeed,
    max_speed: maxSpeedVal,
    average_watts: avgPower,
    max_watts: maxPower,
    // B9 dual-write: normalized_power→effective_power, tss→rss, intensity_factor→ride_intensity.
    normalized_power: normalizedPower,
    effective_power: normalizedPower,
    tss: pm.trainingStressScore ?? summary.trainingStressScore ?? null,
    rss: pm.trainingStressScore ?? summary.trainingStressScore ?? null,
    intensity_factor: pm.intensityFactor ?? summary.intensityFactor ?? null,
    ride_intensity: pm.intensityFactor ?? summary.intensityFactor ?? null,
    power_curve_summary: pm.powerCurveSummary ?? null,
    kilojoules: workKj,
    average_heartrate: avgHR,
    max_heartrate: maxHR,
    device_watts: !!(avgPower || normalizedPower),
    trainer: false,
    commute: false,
    gear_id: null,
    map_summary_polyline: result.polyline,
    activity_streams: result.activityStreams,
    ride_analytics: result.rideAnalytics,
    fit_coach_context: result.fitCoachContext,
    raw_data: rawData,
  };

  // Remove undefined keys so Supabase doesn't complain
  for (const k of Object.keys(insertRow)) {
    if (insertRow[k] === undefined) delete insertRow[k];
  }

  try {
    // For Garmin bulk imports, dedupe by provider_activity_id first — this
    // catches webhook-imported rows (which lack server-side streams /
    // analytics) and re-runs of the same export. Fall through to the
    // time+distance heuristic so we can still upgrade a prior 'fit_upload'
    // row of the same activity.
    let existing = null;
    if (provider === 'garmin') {
      existing = await findExistingByGarminId(userId, garminActivityId);
    }
    if (!existing) {
      existing = await findExistingActivity(userId, summary.startTime, distance);
    }

    if (existing) {
      // UPDATE path — preserve user-editable fields (name if user renamed,
      // gear_id, provider identity) and overlay the FIT-derived analytics.
      const { id: existingId, name: existingName, gear_id: existingGearId, provider: existingProvider, provider_activity_id: existingProviderActivityId } = existing;

      const updateRow = { ...insertRow };
      // Don't clobber user_id. Provider identity is normally preserved (a
      // Strava-synced row stays Strava when enriched by a manual FIT). The
      // one exception: a Garmin bulk import that matches an older
      // 'fit_upload' row should upgrade that row to provider='garmin' with
      // the real Garmin ID, so future webhook events from Garmin Connect
      // dedupe against it via UNIQUE(user_id, provider_activity_id).
      delete updateRow.user_id;
      const shouldUpgradeProvider =
        provider === 'garmin' && existingProvider === 'fit_upload';
      if (!shouldUpgradeProvider) {
        delete updateRow.provider;
        delete updateRow.provider_activity_id;
      }
      // Preserve a non-generic existing name.
      if (existingName && existingName !== activityName) {
        delete updateRow.name;
      }
      if (existingGearId) {
        delete updateRow.gear_id;
      }
      updateRow.updated_at = new Date().toISOString();
      // Invalidate any cached deep coach narrative so it regenerates with
      // the new time series.
      updateRow.fit_coach_analysis = null;
      updateRow.fit_coach_analysis_persona = null;
      updateRow.fit_coach_analysis_generated_at = null;

      // Surface that this row was enriched by a user upload.
      updateRow.raw_data = {
        ...(rawData || {}),
        previous_provider: existingProvider,
        previous_provider_activity_id: existingProviderActivityId,
      };

      const { data: updated, error: updateError } = await supabase
        .from('activities')
        .update(updateRow)
        .eq('id', existingId)
        .select()
        .single();

      if (updateError) {
        console.error('fit-upload: update failed', updateError);
        return res.status(500).json({ error: 'update_failed', message: updateError.message });
      }

      return res.status(200).json({ success: true, action: 'updated', activity: updated });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('activities')
      .insert(insertRow)
      .select()
      .single();

    if (insertError) {
      console.error('fit-upload: insert failed', insertError);
      return res.status(500).json({ error: 'insert_failed', message: insertError.message });
    }

    return res.status(200).json({ success: true, action: 'inserted', activity: inserted });
  } catch (err) {
    console.error('fit-upload: unexpected error', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
