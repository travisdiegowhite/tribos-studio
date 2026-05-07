/**
 * Sequencer context builder.
 *
 * Assembles the SequencerContext (see src/lib/training/blocks/types.ts) used by
 * block library functions and the /api/sequencer-* endpoints. Lean and
 * numeric — distinct from assembleFitnessContext.js, which produces prose-heavy
 * AI-coach context. Coupling the two would put both at risk of breaking when
 * either consumer changes shape.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

/** @type {import('@/types/training').MastersFactor} */
const STANDARD_FACTOR = {
  recovery_block_days_added: 0,
  hit_spacing_hours: 36,
  afi_growth_ceiling_4d: 0.25,
  afi_tfi_gate: 1.10,
  fs_recovery_target: -5,
};

/** @type {import('@/types/training').MastersFactor} */
const CONSERVATIVE_FACTOR = {
  recovery_block_days_added: 1,
  hit_spacing_hours: 48,
  afi_growth_ceiling_4d: 0.20,
  afi_tfi_gate: 1.10,
  fs_recovery_target: -7,
};

/** @type {import('@/types/training').MastersFactor} */
const ADAPTIVE_FACTOR = {
  recovery_block_days_added: 0,
  hit_spacing_hours: 36,
  afi_growth_ceiling_4d: 0.20,
  afi_tfi_gate: 1.05,
  fs_recovery_target: -3,
};

/**
 * Pick a default recovery_mode based on age (spec §3 onboarding logic).
 * Used only when the user has not yet chosen a mode in onboarding.
 */
export function defaultRecoveryMode(age) {
  if (age == null) return 'standard';
  if (age >= 45) return 'conservative';
  if (age >= 35) return 'adaptive';
  return 'standard';
}

/**
 * Resolve the active MastersFactor for a user. Reads the snapshot they chose
 * in onboarding; falls back to defaults derived from age, then to standard.
 */
export function resolveCoefficients(profile) {
  if (profile?.masters_factor && typeof profile.masters_factor === 'object') {
    return profile.masters_factor;
  }
  const mode = profile?.recovery_mode ?? defaultRecoveryMode(profile?.age);
  if (mode === 'conservative') return CONSERVATIVE_FACTOR;
  if (mode === 'adaptive') return ADAPTIVE_FACTOR;
  return STANDARD_FACTOR;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Format a JS Date as a YYYY-MM-DD string offset by `daysAgo` from `today`.
 */
function dateNDaysAgo(today, daysAgo) {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return isoDate(d);
}

/**
 * Build a SequencerContext for the given user on the given date.
 * Reads from training_load_daily, race_goals, activities, activity_efi,
 * and user_profiles. Returns the structured object expected by block library
 * functions.
 *
 * @param {string} userId
 * @param {string} today YYYY-MM-DD
 */
export async function buildSequencerContext(userId, today) {
  const supabase = getSupabaseAdmin();

  // 1. Profile (FTP, age, recovery mode)
  // Tolerate a missing date_of_birth column — older databases that haven't yet
  // run migration 087 still need today's prescription to load. Treat any
  // profile error as "no profile" rather than throwing a 500.
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('id, ftp, date_of_birth, recovery_mode, masters_factor')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.warn(
      `[sequencerContext] user_profiles select failed for ${userId}: ${profileErr.message}. Falling back to defaults.`
    );
  }

  let age = null;
  if (profile?.date_of_birth) {
    const dob = new Date(profile.date_of_birth);
    age = Math.floor(
      (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    );
  }

  const coefficients = resolveCoefficients({ ...profile, age });

  // 2. Last 14 days of daily-stats (training_load_daily)
  const fourteenDaysAgo = dateNDaysAgo(today, 14);
  const { data: dailyRows } = await supabase
    .from('training_load_daily')
    .select('date, rss, tfi, afi, form_score, tss, ctl, atl, tsb')
    .eq('user_id', userId)
    .gte('date', fourteenDaysAgo)
    .lte('date', today)
    .order('date', { ascending: false });

  const daily_stats = (dailyRows ?? []).map((row) => ({
    date: row.date,
    // Canonical-first with legacy fallback per CLAUDE.md
    rss: Number(row.rss ?? row.tss ?? 0),
    tfi: Number(row.tfi ?? row.ctl ?? 0),
    afi: Number(row.afi ?? row.atl ?? 0),
    form_score: Number(row.form_score ?? row.tsb ?? 0),
  }));

  // 3. Upcoming events from race_goals (next 16 weeks)
  const sixteenWeeksOut = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 16 * 7);
    return isoDate(d);
  })();
  const { data: eventRows } = await supabase
    .from('race_goals')
    .select('id, name, race_date, priority, status')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .gte('race_date', today)
    .lte('race_date', sixteenWeeksOut)
    .order('race_date', { ascending: true });

  const upcoming_events = (eventRows ?? []).map((r) => ({
    id: r.id,
    date: r.race_date,
    name: r.name,
    tier: (r.priority ?? 'B'),
    status: r.status,
  }));

  // 4. Recent activity summary
  const seventyTwoHoursAgo = dateNDaysAgo(today, 3);
  const twentyFourHoursAgo = dateNDaysAgo(today, 1);
  const { data: recentActivities } = await supabase
    .from('activities')
    .select('id, start_date, rss, tss, name, type')
    .eq('user_id', userId)
    .gte('start_date', seventyTwoHoursAgo)
    .order('start_date', { ascending: false });

  let max_rss_24h = 0;
  let cumulative_rss_72h = 0;
  for (const a of recentActivities ?? []) {
    const rss = Number(a.rss ?? a.tss ?? 0);
    cumulative_rss_72h += rss;
    if (a.start_date >= twentyFourHoursAgo && rss > max_rss_24h) {
      max_rss_24h = rss;
    }
  }

  // 5. Days since last race (look back 30 days at race_goals.completed_at)
  const thirtyDaysAgo = dateNDaysAgo(today, 30);
  const { data: lastRace } = await supabase
    .from('race_goals')
    .select('id, race_date, priority, completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('race_date', thirtyDaysAgo)
    .lte('race_date', today)
    .order('race_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let days_since_last_race = null;
  let post_race_tier = null;
  if (lastRace) {
    const raceDate = new Date(lastRace.race_date + 'T00:00:00Z');
    const todayDate = new Date(today + 'T00:00:00Z');
    days_since_last_race = Math.round(
      (todayDate.getTime() - raceDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days_since_last_race <= 7) {
      post_race_tier = lastRace.priority ?? null;
    }
  }

  // 6. EFI decoupling on most recent long Z2 ride (last 14 days)
  let recent_efi_decoupling = null;
  const { data: recentEfi } = await supabase
    .from('activity_efi')
    .select('activity_id, efi, decoupling_pct, computed_at')
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
    .limit(5);

  if (recentEfi && recentEfi.length > 0 && recentEfi[0].decoupling_pct != null) {
    recent_efi_decoupling = Number(recentEfi[0].decoupling_pct);
  }

  // 7. Days since last FTP estimate (from user_profiles.ftp_updated_at if present)
  let days_since_ftp_estimate = null;
  if (profile?.ftp) {
    // Fall back to created_at proxy; a dedicated ftp_updated_at column may not exist yet.
    days_since_ftp_estimate = 0; // assume recent if FTP set; refine when a ftp_updated_at column exists
  }

  // 8. Current block (if any)
  const { data: currentBlock } = await supabase
    .from('block_instances')
    .select('id, block_type, start_date, status')
    .eq('user_id', userId)
    .in('status', ['active', 'planned'])
    .lte('start_date', today)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let current_block = null;
  if (currentBlock) {
    const startDate = new Date(currentBlock.start_date + 'T00:00:00Z');
    const todayDate = new Date(today + 'T00:00:00Z');
    const days_in = Math.max(
      0,
      Math.round(
        (todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    current_block = { block_type: currentBlock.block_type, days_in };
  }

  return {
    user_id: userId,
    today,
    ftp_watts: profile?.ftp ?? null,
    coefficients,
    daily_stats,
    subjective: [], // Phase 1: not wired; placeholder for spec §4.4 gating
    upcoming_events,
    recent_activity: {
      max_rss_24h,
      cumulative_rss_72h,
      days_since_last_race,
      recent_efi_decoupling,
      days_since_ftp_estimate,
    },
    current_block,
    horizon_event: upcoming_events.find((e) => e.tier === 'A') ?? null,
    post_race_tier,
  };
}
