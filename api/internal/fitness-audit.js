/**
 * Internal fitness audit endpoint — Travis-only (travisdiegowhite@gmail.com).
 *
 * Returns 180 days of per-day data for the metrics diagnostic page:
 *   - Standard CTL/ATL/TSB (canonical-first RSS reads, fixed tau 42/7)
 *   - Server-stored TFI/AFI/form_score from training_load_daily
 *   - Per-activity RSS breakdown for tier analysis
 *
 * GET /api/internal/fitness-audit
 * GET /api/internal/fitness-audit?debug=true  — also returns metric_debug_tfi rows
 */

import { supabase } from '../utils/supabaseAdmin.js';
import { computeFitnessMetrics } from '../utils/computeFitnessMetrics.js';
import { setupCors } from '../utils/cors.js';

const AUDIT_EMAIL = 'travisdiegowhite@gmail.com';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — require valid JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Email gate — scoped to Travis only for the audit window
  if (user.email?.toLowerCase() !== AUDIT_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const throughDate = new Date().toISOString().split('T')[0];
  const windowStart = new Date(throughDate + 'T00:00:00Z');
  windowStart.setDate(windowStart.getDate() - 180);
  const windowStartStr = windowStart.toISOString().split('T')[0];

  try {
    // Standard CTL (canonical-first, 180 days)
    const ctlRows = await computeFitnessMetrics(supabase, user.id, throughDate);

    // Server-stored TFI/AFI/form_score from training_load_daily
    const { data: tldRows, error: tldError } = await supabase
      .from('training_load_daily')
      .select('date, rss, tfi, afi, form_score, rss_source, confidence, fs_confidence, tfi_tau, afi_tau')
      .eq('user_id', user.id)
      .gte('date', windowStartStr)
      .lte('date', throughDate)
      .order('date', { ascending: true });

    if (tldError) throw tldError;

    // Per-activity RSS breakdown for tier analysis
    const { data: activities, error: actError } = await supabase
      .from('activities')
      .select(
        'id, name, type, sport_type, start_date, moving_time, distance, ' +
        'total_elevation_gain, average_watts, kilojoules, average_heartrate, ' +
        'rss, tss, effective_power, normalized_power, rss_source, confidence, ' +
        'is_hidden, duplicate_of'
      )
      .eq('user_id', user.id)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', windowStartStr + 'T00:00:00Z')
      .lte('start_date', throughDate + 'T23:59:59Z')
      .order('start_date', { ascending: false });

    if (actError) throw actError;

    // Annotate each activity with which tier estimateRSSCanonical would hit
    const annotatedActivities = (activities || []).map(a => {
      let tier = 5;
      if (a.rss ?? a.tss) tier = 1;
      else if (['Run', 'VirtualRun', 'TrailRun'].includes(a.type)) tier = 2;
      else if (a.effective_power ?? a.normalized_power) tier = 3;
      else if (a.kilojoules) tier = 4;
      return { ...a, estimated_tier: tier };
    });

    // Merge CTL rows and TLD rows by date into unified daily table
    const tldByDate = {};
    for (const row of (tldRows || [])) {
      tldByDate[row.date] = row;
    }

    const merged = ctlRows.map(ctlRow => {
      const tld = tldByDate[ctlRow.date] || {};
      return {
        date: ctlRow.date,
        rss: ctlRow.rss,
        ctl: ctlRow.ctl,
        atl: ctlRow.atl,
        tsb: ctlRow.tsb,
        tfi: tld.tfi ?? null,
        afi: tld.afi ?? null,
        form_score: tld.form_score ?? null,
        tfi_minus_ctl: tld.tfi != null ? Math.round((tld.tfi - ctlRow.ctl) * 10) / 10 : null,
        rss_source: tld.rss_source ?? null,
        confidence: tld.confidence ?? null,
        tfi_tau: tld.tfi_tau ?? null,
      };
    });

    const responseBody = {
      through_date: throughDate,
      daily: merged,
      activities: annotatedActivities,
    };

    // Debug: include raw debug table rows if ?debug=true and table exists
    if (req.query?.debug === 'true') {
      const { data: debugRows } = await supabase
        .from('metric_debug_tfi')
        .select('date, inputs_json, intermediates_json, output, computed_at')
        .eq('user_id', user.id)
        .gte('date', windowStartStr)
        .lte('date', throughDate)
        .order('date', { ascending: true });

      responseBody.debug_tfi = debugRows ?? [];
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error('[fitness-audit] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
