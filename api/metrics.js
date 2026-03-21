/**
 * Vercel API Route: Proprietary Metrics
 *
 * GET /api/metrics — Fetch user's current EFI, TWL, and TCAS scores
 * for dashboard display.
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

    // Fetch all three metrics in parallel
    const [efiResult, twlResult, tcasResult, providerResult, planResult] = await Promise.all([
      // Latest EFI (28-day rolling)
      supabase
        .from('activity_efi')
        .select('efi, efi_28d, vf, ifs, cf, planned_tss, actual_tss, computed_at')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Latest TWL
      supabase
        .from('activity_twl')
        .select('twl, base_tss, m_terrain, vam, gvi, mean_elevation, alpha_component, beta_component, gamma_component, computed_at')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Latest TCAS
      supabase
        .from('weekly_tcas')
        .select('tcas, he, aq, taa, fv, eft, adi, ppd, week_ending, computed_at')
        .eq('user_id', userId)
        .order('week_ending', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Check if user has any connected providers
      supabase
        .from('activities')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),

      // Check if user has an active training plan
      supabase
        .from('training_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ]);

    // Compute data readiness
    const hasProvider = !!providerResult.data;
    const hasTrainingPlan = !!planResult.data;
    const efiAvailable = !!efiResult.data;
    const twlAvailable = !!twlResult.data;
    const tcasAvailable = !!tcasResult.data;

    // Check TCAS data readiness (needs 6 weeks of history)
    let tcasDaysRemaining = 0;
    if (!tcasAvailable && hasProvider) {
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
      efi: efiResult.data ? {
        score: efiResult.data.efi_28d ?? efiResult.data.efi,
        session_score: efiResult.data.efi,
        vf: efiResult.data.vf,
        ifs: efiResult.data.ifs,
        cf: efiResult.data.cf,
        computed_at: efiResult.data.computed_at,
      } : null,

      twl: twlResult.data ? {
        score: twlResult.data.twl,
        base_tss: twlResult.data.base_tss,
        m_terrain: twlResult.data.m_terrain,
        vam: twlResult.data.vam,
        gvi: twlResult.data.gvi,
        mean_elevation: twlResult.data.mean_elevation,
        alpha_component: twlResult.data.alpha_component,
        beta_component: twlResult.data.beta_component,
        gamma_component: twlResult.data.gamma_component,
        overage_percent: twlResult.data.m_terrain
          ? Math.round((twlResult.data.m_terrain - 1) * 100)
          : 0,
        computed_at: twlResult.data.computed_at,
      } : null,

      tcas: tcasResult.data ? {
        score: tcasResult.data.tcas,
        he: tcasResult.data.he,
        aq: tcasResult.data.aq,
        taa: tcasResult.data.taa,
        fv: tcasResult.data.fv,
        eft: tcasResult.data.eft,
        adi: tcasResult.data.adi,
        ppd: tcasResult.data.ppd,
        week_ending: tcasResult.data.week_ending,
        computed_at: tcasResult.data.computed_at,
      } : null,

      data_readiness: {
        efi_available: efiAvailable,
        twl_available: twlAvailable,
        tcas_available: tcasAvailable,
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
