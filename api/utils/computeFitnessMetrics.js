/**
 * Standard CTL/ATL/TSB computation for the metric audit.
 *
 * Ground-truth baseline: fixed tau=42/7 (no adaptive), canonical-first
 * column reads, 180-day window. Used by the /internal/fitness-audit
 * endpoint for race-day comparison against the displayed (buggy) TFI.
 *
 * Key difference from Dashboard.jsx: reads `activity.rss ?? activity.tss`
 * so Garmin FIT-computed training stress scores are used correctly.
 */

// ─── EWA helpers ─────────────────────────────────────────────────────────────

/**
 * Iterative EWA. Initialises at 0 (cold-start from day 0 of the window).
 * @param {number[]} dailyRSS — ordered oldest-first
 * @param {number} tau
 * @returns {number}
 */
function _ewa(dailyRSS, tau) {
  let val = 0;
  for (const rss of dailyRSS) {
    val = val + (rss - val) / tau;
  }
  return Math.round(val * 10) / 10;
}

// ─── Per-activity RSS estimation (canonical-first) ────────────────────────────

/**
 * Pick the best available RSS value from an activity row, canonical-first.
 *
 * Tier 1: activity.rss (canonical, computed server-side — highest fidelity)
 * Tier 2: activity.tss (legacy fallback — NULL for most current activities)
 * Tier 3: effective_power ?? normalized_power + FTP → standard TSS formula
 * Tier 4: kilojoules + duration → approximate TSS
 * Tier 5: duration + elevation heuristic
 *
 * @param {object} activity — row from activities table (select *)
 * @param {number|null} ftp
 * @returns {number}
 */
export function estimateRSSCanonical(activity, ftp) {
  const durationHours = (activity.moving_time || 0) / 3600;

  // Tier 1 / 2: stored canonical or legacy RSS (device-computed, highest fidelity)
  const stored = activity.rss ?? activity.tss;
  if (stored && stored > 0) return stored;

  // Running activities — separate estimation
  if (['Run', 'VirtualRun', 'TrailRun'].includes(activity.type || '')) {
    return _estimateRunningRSS(activity);
  }

  // Tier 3: power-based (canonical effective_power, then legacy normalized_power)
  const power = activity.effective_power ?? activity.normalized_power;
  if (power && power > 0 && ftp && ftp > 0 && durationHours > 0) {
    const ri = power / ftp;
    return Math.round(durationHours * ri * ri * 100);
  }

  // Tier 4: kilojoules → derive average power
  if (activity.kilojoules && activity.kilojoules > 0 && durationHours > 0) {
    const avgPower = (activity.kilojoules * 1000) / (activity.moving_time || 1);
    const effectiveFtp = (ftp && ftp > 0) ? ftp : 200;
    const ri = avgPower / effectiveFtp;
    return Math.round(durationHours * ri * ri * 100);
  }

  // Tier 5: duration + elevation heuristic
  const elevM = activity.total_elevation_gain || 0;
  const baseTSS = durationHours * 50;
  const elevFactor = (elevM / 300) * 10;
  let intensityMul = 1.0;
  if (activity.average_watts && activity.average_watts > 0) {
    intensityMul = Math.min(1.8, Math.max(0.5, activity.average_watts / 150));
  }
  return Math.round((baseTSS + elevFactor) * intensityMul);
}

function _estimateRunningRSS(activity) {
  const durationHours = (activity.moving_time || 0) / 3600;
  if (durationHours === 0) return 0;
  const distanceKm = (activity.distance || 0) / 1000;
  const elevM = activity.total_elevation_gain || 0;

  let intensityMul = 1.0;
  if (distanceKm > 0 && durationHours > 0) {
    const paceMinPerKm = (durationHours * 60) / distanceKm;
    if (paceMinPerKm < 3.5) intensityMul = 1.6;
    else if (paceMinPerKm < 4.0) intensityMul = 1.4;
    else if (paceMinPerKm < 4.5) intensityMul = 1.2;
    else if (paceMinPerKm < 5.0) intensityMul = 1.05;
    else if (paceMinPerKm < 6.0) intensityMul = 0.85;
    else if (paceMinPerKm < 7.0) intensityMul = 0.7;
    else intensityMul = 0.55;
  }
  if (activity.average_heartrate > 0) {
    const hr = activity.average_heartrate;
    if (hr >= 175) intensityMul = Math.max(intensityMul, 1.5);
    else if (hr >= 160) intensityMul = Math.max(intensityMul, 1.2);
    else if (hr >= 145) intensityMul = Math.max(intensityMul, 1.0);
    else if (hr >= 130) intensityMul = Math.max(intensityMul, 0.8);
  }
  const baseRTSS = durationHours * 60;
  const elevFactor = (elevM / 200) * 10;
  const trailFactor = activity.type === 'TrailRun' ? 1.1 : 1.0;
  return Math.round((baseRTSS + elevFactor) * intensityMul * trailFactor);
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute per-day CTL/ATL/TSB for a user over the last 180 days.
 *
 * Uses standard fixed tau (42/7) — no adaptive tau — so this is a clean
 * TrainingPeaks-equivalent baseline for comparison against TFI.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} throughDate — ISO date string (YYYY-MM-DD), inclusive end of window
 * @returns {Promise<Array<{date: string, rss: number, ctl: number, atl: number, tsb: number}>>}
 */
export async function computeFitnessMetrics(supabase, userId, throughDate) {
  const end = new Date(throughDate + 'T23:59:59Z');
  const start = new Date(end);
  start.setDate(start.getDate() - 180);

  // Fetch activities + FTP in parallel
  const [actResult, ftpResult] = await Promise.all([
    supabase
      .from('activities')
      .select(
        'id, type, sport_type, start_date, moving_time, distance, ' +
        'total_elevation_gain, average_watts, average_heartrate, ' +
        'kilojoules, rss, tss, effective_power, normalized_power, ' +
        'is_hidden, duplicate_of'
      )
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', start.toISOString())
      .lte('start_date', end.toISOString())
      .order('start_date', { ascending: true }),
    supabase
      .from('user_preferences')
      .select('ftp')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const activities = actResult.data ?? [];
  const ftp = ftpResult.data?.ftp ?? null;

  // Build daily RSS map
  const dailyRSS = {};
  for (const a of activities) {
    const dateStr = a.start_date?.split('T')[0];
    if (!dateStr) continue;
    dailyRSS[dateStr] = (dailyRSS[dateStr] || 0) + Math.min(estimateRSSCanonical(a, ftp), 500);
  }

  // Walk day-by-day, maintaining running CTL/ATL
  const CTL_TAU = 42;
  const ATL_TAU = 7;
  let ctl = 0;
  let atl = 0;
  const rows = [];

  for (let i = 0; i < 180; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i + 1);
    const dateStr = d.toISOString().split('T')[0];
    if (dateStr > throughDate) break;

    const rss = dailyRSS[dateStr] || 0;
    ctl = ctl + (rss - ctl) / CTL_TAU;
    atl = atl + (rss - atl) / ATL_TAU;

    rows.push({
      date: dateStr,
      rss: Math.round(rss * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  return rows;
}

// ─── Debug instrumentation ────────────────────────────────────────────────────

/**
 * Compute and persist full TFI/AFI breakdown to metric_debug_tfi for the
 * audit user. Skips silently if the table doesn't exist yet.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} throughDate — ISO date (YYYY-MM-DD)
 */
export async function computeTFIBreakdown(supabase, userId, throughDate) {
  const end = new Date(throughDate + 'T23:59:59Z');
  const start = new Date(end);
  start.setDate(start.getDate() - 180);

  const [actResult, profileResult, prefResult] = await Promise.all([
    supabase
      .from('activities')
      .select(
        'id, name, type, start_date, moving_time, distance, ' +
        'total_elevation_gain, average_watts, average_heartrate, ' +
        'kilojoules, rss, tss, effective_power, normalized_power, ' +
        'is_hidden, duplicate_of'
      )
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', start.toISOString())
      .lte('start_date', end.toISOString())
      .order('start_date', { ascending: true }),
    supabase
      .from('user_profiles')
      .select('tfi_tau, afi_tau')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_preferences')
      .select('ftp')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const activities = actResult.data ?? [];
  const ftp = prefResult.data?.ftp ?? null;
  const tfiTau = profileResult.data?.tfi_tau ?? 42;
  const afiTau = profileResult.data?.afi_tau ?? 7;

  // Group activities by date
  const byDate = {};
  for (const a of activities) {
    const dateStr = a.start_date?.split('T')[0];
    if (!dateStr) continue;
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(a);
  }

  let tfi = 0;
  let afi = 0;
  const debugRows = [];

  for (let i = 0; i < 180; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i + 1);
    const dateStr = d.toISOString().split('T')[0];
    if (dateStr > throughDate) break;

    const dayActivities = byDate[dateStr] || [];
    let dailyRSS = 0;
    const activityBreakdown = [];

    for (const a of dayActivities) {
      const rssStored = a.rss ?? null;
      const tssStored = a.tss ?? null;
      const ep = a.effective_power ?? null;
      const np = a.normalized_power ?? null;
      const kj = a.kilojoules ?? null;

      let tier = 5;
      if (rssStored ?? tssStored) tier = 1;
      else if (['Run', 'VirtualRun', 'TrailRun'].includes(a.type)) tier = 2;
      else if (ep ?? np) tier = 3;
      else if (kj) tier = 4;

      const rssEstimated = Math.min(estimateRSSCanonical(a, ftp), 500);
      dailyRSS += rssEstimated;

      activityBreakdown.push({
        id: a.id, name: a.name, type: a.type,
        rss_stored: rssStored, tss_stored: tssStored,
        effective_power: ep, normalized_power: np, kilojoules: kj,
        moving_time: a.moving_time,
        tier_used: tier,
        rss_estimated: rssEstimated,
      });
    }

    const tfiBefore = tfi;
    const afiBefore = afi;
    tfi = tfi + (dailyRSS - tfi) / tfiTau;
    afi = afi + (dailyRSS - afi) / afiTau;

    debugRows.push({
      user_id: userId,
      date: dateStr,
      inputs_json: {
        ftp, tfi_tau: tfiTau, afi_tau: afiTau,
        activities: activityBreakdown,
        daily_rss_total: Math.round(dailyRSS * 10) / 10,
      },
      intermediates_json: {
        tfi_before: Math.round(tfiBefore * 10) / 10,
        afi_before: Math.round(afiBefore * 10) / 10,
        rss_input: Math.round(dailyRSS * 10) / 10,
        tfi_after: Math.round(tfi * 10) / 10,
        afi_after: Math.round(afi * 10) / 10,
      },
      output: {
        tfi: Math.round(tfi * 10) / 10,
        afi: Math.round(afi * 10) / 10,
        form_score: Math.round((tfiBefore - afiBefore) * 10) / 10,
        tau_tfi: tfiTau,
        tau_afi: afiTau,
      },
    });
  }

  // Batch upsert — silently skip if table doesn't exist
  try {
    await supabase
      .from('metric_debug_tfi')
      .upsert(debugRows, { onConflict: 'user_id,date' });
  } catch {
    // Table may not exist in all environments
  }
}
