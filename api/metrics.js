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
    let [efiResult, twlResult, tcasResult, providerResult, planResult] = await Promise.all([
      fetchEFI(userId),
      fetchTWL(userId),
      fetchTCAS(userId),
      supabase.from('activities').select('id').eq('user_id', userId).limit(1).maybeSingle(),
      supabase.from('training_plans').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
    ]);

    const hasProvider = !!providerResult.data;
    const hasTrainingPlan = !!planResult.data;

    // ─── Lazy backfill: compute from existing data on first read ─────────
    // Run backfill if any metric is missing (not just when all are missing),
    // so that e.g. EFI gets computed even when TWL already exists.
    const needsBackfill = hasProvider && (
      !efiResult.data || !twlResult.data || !tcasResult.data
    );

    if (needsBackfill) {
      try {
        const { backfillMetricsForUser } = await import('./utils/metricsComputation.js');
        await backfillMetricsForUser(supabase, userId);

        // Re-query only the missing metrics
        const [newEfi, newTwl, newTcas] = await Promise.all([
          !efiResult.data ? fetchEFI(userId) : Promise.resolve(efiResult),
          !twlResult.data ? fetchTWL(userId) : Promise.resolve(twlResult),
          !tcasResult.data ? fetchTCAS(userId) : Promise.resolve(tcasResult),
        ]);
        efiResult = newEfi;
        twlResult = newTwl;
        tcasResult = newTcas;
      } catch (backfillError) {
        console.error('[metrics] Backfill failed (non-critical):', backfillError.message);
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

    return res.status(200).json({
      efi: formatEFI(efiResult.data),
      twl: formatTWL(twlResult.data),
      tcas: formatTCAS(tcasResult.data),
      data_readiness: {
        efi_available: !!efiResult.data,
        twl_available: !!twlResult.data,
        tcas_available: !!tcasResult.data,
        tcas_days_remaining: tcasDaysRemaining,
        has_provider: hasProvider,
        has_training_plan: hasTrainingPlan,
      },
    });
  } catch (error) {
    console.error('[metrics] Error fetching metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}
