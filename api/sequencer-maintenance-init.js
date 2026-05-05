/**
 * Sequencer — Maintenance Mode Init
 *
 * POST /api/sequencer-maintenance-init  body: { user_id }
 *
 * Initializes a user into open-horizon maintenance mode. Creates:
 *   1. A `sequences` row with horizon_event_id = NULL
 *   2. A `block_instances` row of block_type = 'maintenance' covering 21 days
 *   3. 21 `session_prescriptions` rows for that block
 *
 * Idempotent: if the user already has an active maintenance block whose end_date
 * is still in the future, returns it unchanged.
 *
 * Phase 1 of the event-anchored training plan rollout (spec §11).
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  generateMaintenanceSessions,
  coefficientsForMode,
} from './utils/sequencerBlockOps.js';
import { defaultRecoveryMode } from './utils/sequencerContext.js';

const MAINTENANCE_DURATION_DAYS = 21;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.body ?? {};
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    const supabase = getSupabaseAdmin();

    // Idempotency: bail out if user has an active block (any type) covering today.
    const today = todayUtc();
    const { data: existing } = await supabase
      .from('block_instances')
      .select('id, block_type, start_date, end_date, status')
      .eq('user_id', user_id)
      .in('status', ['active', 'planned'])
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        ok: true,
        already_initialized: true,
        block_id: existing.id,
        block_type: existing.block_type,
      });
    }

    // Resolve coefficients from user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, recovery_mode, masters_factor, date_of_birth')
      .eq('id', user_id)
      .maybeSingle();

    let age = null;
    if (profile?.date_of_birth) {
      const dob = new Date(profile.date_of_birth);
      age = Math.floor(
        (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      );
    }
    const recoveryMode = profile?.recovery_mode ?? defaultRecoveryMode(age);
    const coefficients =
      profile?.masters_factor && typeof profile.masters_factor === 'object'
        ? profile.masters_factor
        : coefficientsForMode(recoveryMode);

    // 1. Create the sequence row
    const { data: sequence, error: seqErr } = await supabase
      .from('sequences')
      .insert({
        user_id,
        horizon_event_id: null,
        validation_status: 'valid',
        validation_messages: [],
        is_active: true,
      })
      .select('id')
      .single();

    if (seqErr) throw seqErr;

    // 2. Create the block instance
    const startDate = today;
    const endDate = addDays(today, MAINTENANCE_DURATION_DAYS - 1);

    const { data: block, error: blockErr } = await supabase
      .from('block_instances')
      .insert({
        user_id,
        block_type: 'maintenance',
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        source: 'sequencer',
        parent_event_id: null,
        parent_event_tier: null,
        target_tfi_delta: 0,
        target_afi_ceiling: null,
        target_fs_at_exit: null,
        coefficients_snapshot: coefficients,
        sequence_id: sequence.id,
        modified_by: 'system',
      })
      .select('id')
      .single();

    if (blockErr) throw blockErr;

    // 3. Generate + insert per-day session prescriptions
    const sessions = generateMaintenanceSessions(startDate, endDate);
    const rows = sessions.map((s) => ({
      user_id,
      block_id: block.id,
      date: s.date,
      session_type: s.session_type,
      target_rss: s.target_rss,
      target_duration_min: s.target_duration_min,
      prescribed_intervals: s.prescribed_intervals,
      long_ride_flag: s.long_ride_flag,
      notes: s.notes,
    }));

    const { error: prescErr } = await supabase
      .from('session_prescriptions')
      .upsert(rows, { onConflict: 'user_id,date' });

    if (prescErr) throw prescErr;

    return res.status(200).json({
      ok: true,
      already_initialized: false,
      sequence_id: sequence.id,
      block_id: block.id,
      block_type: 'maintenance',
      start_date: startDate,
      end_date: endDate,
      prescriptions_created: rows.length,
    });
  } catch (err) {
    console.error('[sequencer-maintenance-init] error:', err);
    return res.status(500).json({
      error: 'Failed to initialize maintenance mode',
      detail: err?.message ?? String(err),
    });
  }
}
