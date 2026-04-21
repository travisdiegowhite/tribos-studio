/**
 * Vercel API Route: Proprietary Metrics
 *
 * GET /api/metrics — Fetch user's current EFI, TWL, and TCAS scores
 * for dashboard display. On first read, computes metrics from existing
 * activity data if none have been stored yet (lazy backfill).
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Shared query functions (used for initial read and post-backfill re-read)
function fetchEFI(userId) {
  return supabase
    .from('activity_efi')
    .select('efi, efi_28d, vf, ifs, cf, planned_tss, actual_tss, computed_at')
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

function fetchTWL(userId) {
  return supabase
    .from('activity_twl')
    .select('twl, base_tss, m_terrain, vam, gvi, mean_elevation, alpha_component, beta_component, gamma_component, computed_at')
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

function fetchTCAS(userId) {
  return supabase
    .from('weekly_tcas')
    .select('tcas, he, aq, taa, fv, eft, adi, ppd, week_ending, computed_at')
    .eq('user_id', userId)
    .order('week_ending', { ascending: false })
    .limit(1)
    .maybeSingle();
}

function fetchFAR(userId) {
  return supabase
    .from('far_daily')
    .select('score, score_7d, tfi_delta_28d, weekly_rate, zone, personal_ceiling_weekly_rate, personal_ceiling_basis, confidence, gap_days_in_window, computed_at')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
}

function fetchFARTrend(userId) {
  const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return supabase
    .from('far_daily')
    .select('date, score')
    .eq('user_id', userId)
    .gte('date', sixWeeksAgo)
    .order('date', { ascending: true });
}

function formatEFI(data) {
  if (!data) return null;
  return {
    score: data.efi_28d ?? data.efi,
    session_score: data.efi,
    vf: data.vf,
    ifs: data.ifs,
    cf: data.cf,
    computed_at: data.computed_at,
  };
}

function formatTWL(data) {
  if (!data) return null;
  return {
    score: data.twl,
    base_tss: data.base_tss,
    m_terrain: data.m_terrain,
    vam: data.vam,
    gvi: data.gvi,
    mean_elevation: data.mean_elevation,
    alpha_component: data.alpha_component,
    beta_component: data.beta_component,
    gamma_component: data.gamma_component,
    overage_percent: data.m_terrain
      ? Math.round((data.m_terrain - 1) * 100)
      : 0,
    computed_at: data.computed_at,
  };
}

function formatTCAS(data) {
  if (!data) return null;
  return {
    score: data.tcas,
    he: data.he,
    aq: data.aq,
    taa: data.taa,
    fv: data.fv,
    eft: data.eft,
    adi: data.adi,
    ppd: data.ppd,
    week_ending: data.week_ending,
    computed_at: data.computed_at,
  };
}

function formatFAR(data, trend) {
  if (!data) return null;
  const score = data.score != null ? Math.round(data.score * 10) / 10 : null;
  const score_7d = data.score_7d != null ? Math.round(data.score_7d * 10) / 10 : null;

  let momentum_flag = 'steady';
  if (score != null && score_7d != null) {
    const abs28 = Math.abs(score);
    if (abs28 >= 5) {
      const threshold = abs28 * 0.15;
      if (score_7d > score + threshold) momentum_flag = 'accelerating';
      else if (score_7d < score - threshold) momentum_flag = 'decelerating';
    }
  }

  return {
    score,
    score_7d,
    tfi_delta_28d: data.tfi_delta_28d,
    weekly_rate: data.weekly_rate,
    zone: data.zone,
    personal_ceiling_weekly_rate: data.personal_ceiling_weekly_rate,
    personal_ceiling_basis: data.personal_ceiling_basis,
    confidence: data.confidence,
    gap_days_in_window: data.gap_days_in_window,
    momentum_flag,
    trend_6w: (trend || []).map(r => ({ date: r.date, far: r.score })),
    computed_at: data.computed_at,
  };
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id;

    // Fetch all metrics + readiness checks in parallel
    let [efiResult, twlResult, tcasResult, farResult, farTrendResult, providerResult, planResult] = await Promise.all([
      fetchEFI(userId),
      fetchTWL(userId),
      fetchTCAS(userId),
      fetchFAR(userId),
      fetchFARTrend(userId),
      supabase.from('activities').select('id').eq('user_id', userId).limit(1).maybeSingle(),
      supabase.from('training_plans').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
    ]);

    const hasProvider = !!providerResult.data;
    const hasTrainingPlan = !!planResult.data;

    // ─── Lazy backfill: compute from existing data on first read ─────────
    // Run backfill if EFI or TWL is missing (these should always be computable
    // if there are activities). TCAS may legitimately be missing if the user
    // doesn't have enough history, so we don't let it trigger repeated backfills.
    const needsBackfill = hasProvider && (!efiResult.data || !twlResult.data);

    if (needsBackfill) {
      try {
        const { backfillMetricsForUser } = await import('./utils/metricsComputation.js');
        await backfillMetricsForUser(supabase, userId);

        // Re-query all metrics (backfill may have also produced TCAS)
        [efiResult, twlResult, tcasResult] = await Promise.all([
          fetchEFI(userId),
          fetchTWL(userId),
          fetchTCAS(userId),
        ]);
        // Note: FAR is computed by nightly cron, not backfill — don't re-fetch
      } catch (backfillError) {
        console.error('[metrics] Backfill failed (non-critical):', backfillError.message);
      }
    }

    // ─── TCAS backfill: run independently if TCAS is missing ─────────────
    // This is separate from the main backfill because EFI/TWL may already
    // exist while TCAS still needs fitness snapshots generated.
    // Once TCAS computes successfully, tcasResult.data will be non-null on
    // future loads and this block won't re-run.
    if (!tcasResult.data && hasProvider) {
      try {
        const { backfillSnapshots } = await import('./utils/fitnessSnapshots.js');
        const { computeAndStoreTCAS } = await import('./utils/metricsComputation.js');

        // Generate fitness snapshots from activity history
        const snapResult = await backfillSnapshots(supabase, userId, 12);
        console.log(`[metrics] TCAS: backfilled ${snapResult.snapshotsCreated} snapshots`);

        // Attempt TCAS computation with the new snapshots
        const computed = await computeAndStoreTCAS(supabase, userId);
        console.log(`[metrics] TCAS: computation result = ${computed}`);
        if (computed) {
          tcasResult = await fetchTCAS(userId);
        }
      } catch (tcasErr) {
        console.error('[metrics] TCAS backfill failed:', tcasErr.message);
      }
    }

    // ─── TCAS days remaining ─────────────────────────────────────────────
    let tcasDaysRemaining = 0;
    if (!tcasResult.data && hasProvider) {
      const { data: firstActivity } = await supabase
        .from('activities')
        .select('start_date')
        .eq('user_id', userId)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstActivity) {
        const daysSinceFirst = Math.floor(
          (Date.now() - new Date(firstActivity.start_date).getTime()) / (1000 * 60 * 60 * 24)
        );
        tcasDaysRemaining = Math.max(0, 42 - daysSinceFirst);
      } else {
        tcasDaysRemaining = 42;
      }
    }

    // FAR days remaining (if no FAR data — how many more days of TFI needed)
    let farDaysRemaining = 0;
    if (!farResult.data && hasProvider) {
      const { data: firstLoad } = await supabase
        .from('training_load_daily')
        .select('date')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstLoad) {
        const daysSinceFirst = Math.floor(
          (Date.now() - new Date(firstLoad.date).getTime()) / (1000 * 60 * 60 * 24)
        );
        farDaysRemaining = Math.max(0, 28 - daysSinceFirst);
      } else {
        farDaysRemaining = 28;
      }
    }

    return res.status(200).json({
      efi: formatEFI(efiResult.data),
      twl: formatTWL(twlResult.data),
      tcas: formatTCAS(tcasResult.data),
      far: formatFAR(farResult.data, farTrendResult.data),
      data_readiness: {
        efi_available: !!efiResult.data,
        twl_available: !!twlResult.data,
        tcas_available: !!tcasResult.data,
        tcas_days_remaining: tcasDaysRemaining,
        far_available: !!(farResult.data && farResult.data.score != null),
        far_days_remaining: farDaysRemaining,
        has_provider: hasProvider,
        has_training_plan: hasTrainingPlan,
      },
    });
  } catch (error) {
    console.error('[metrics] Error fetching metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}
