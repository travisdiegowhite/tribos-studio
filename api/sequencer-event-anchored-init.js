/**
 * Sequencer — Event-Anchored Plan Init (Phase 2)
 *
 * POST /api/sequencer-event-anchored-init  body: { user_id, race_goal_id }
 *
 * Anchors a sequence to a specific race. Working backwards from the race
 * date, builds a compressed/full block chain by tier (A/B/C), persists:
 *
 *   1. A new `sequences` row (horizon_event_id = race_goal_id, marks any
 *      previous active sequences inactive)
 *   2. One `block_instances` row per block in the chain
 *   3. Pre-generated `session_prescriptions` rows for the next 14 days,
 *      dispatching by block_type via generateSessionsForBlock()
 *
 * Idempotency policy: if the user already has a sequence with the same
 * horizon_event_id and is_active=true, returns it unchanged. Pass
 * `replace=true` in the body to supersede the existing sequence.
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  generateSessionsForBlock,
  coefficientsForMode,
} from './utils/sequencerBlockOps.js';
import {
  buildSequencerContext,
  defaultRecoveryMode,
} from './utils/sequencerContext.js';
import { buildEventAnchoredSequence } from './utils/sequencerPlanner.js';

const PRELOAD_DAYS = 14;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function clipRange(start, end, fromDate, toDate) {
  const a = start < fromDate ? fromDate : start;
  const b = end > toDate ? toDate : end;
  return a <= b ? [a, b] : null;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, race_goal_id, replace = false } = req.body ?? {};
    if (!user_id || !race_goal_id) {
      return res
        .status(400)
        .json({ error: 'user_id and race_goal_id required' });
    }

    const supabase = getSupabaseAdmin();
    const today = todayUtc();

    // 1. Resolve the race goal
    const { data: race, error: raceErr } = await supabase
      .from('race_goals')
      .select('id, user_id, name, race_date, priority, status')
      .eq('id', race_goal_id)
      .maybeSingle();

    if (raceErr) throw raceErr;
    if (!race) {
      return res.status(404).json({ error: 'race_goal_not_found' });
    }
    if (race.user_id !== user_id) {
      return res.status(403).json({ error: 'race_goal_not_owned_by_user' });
    }
    if (race.status !== 'upcoming') {
      return res.status(400).json({
        error: 'race_goal_not_upcoming',
        detail: `race_goal status is ${race.status}; only 'upcoming' can be anchored.`,
      });
    }
    if (race.race_date <= today) {
      return res.status(400).json({
        error: 'race_in_past',
        detail: 'Race date must be after today.',
      });
    }

    const tier = race.priority ?? 'B';

    // 2. Idempotency: existing active sequence for this event?
    const { data: existing } = await supabase
      .from('sequences')
      .select('id, horizon_event_id, is_active, generated_at')
      .eq('user_id', user_id)
      .eq('horizon_event_id', race.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existing && !replace) {
      return res.status(200).json({
        ok: true,
        already_anchored: true,
        sequence_id: existing.id,
        horizon_event_id: race.id,
      });
    }

    // 3. Resolve coefficients from user_profiles
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

    // 4. Build the block sequence (pure)
    const plan = buildEventAnchoredSequence({
      today,
      race_date: race.race_date,
      tier,
      coefficients,
    });

    if (plan.validation_status === 'conflict') {
      return res.status(400).json({
        error: 'plan_conflict',
        validation_messages: plan.validation_messages,
      });
    }

    // 5. Mark prior active sequences for this user inactive (single active
    //    sequence at a time — see docs/event-anchored-training-plans.md §7).
    await supabase
      .from('sequences')
      .update({ is_active: false })
      .eq('user_id', user_id)
      .eq('is_active', true);

    // 6. Cancel any in-flight block instances that overlap the new plan.
    //    They get superseded; we mark them 'skipped' so the rollover stops
    //    preloading their prescriptions.
    const planStart = plan.blocks[0].start_date;
    const planEnd = plan.blocks[plan.blocks.length - 1].end_date;
    await supabase
      .from('block_instances')
      .update({
        status: 'skipped',
        modified_at: new Date().toISOString(),
        modified_by: 'system',
      })
      .eq('user_id', user_id)
      .in('status', ['active', 'planned'])
      .lte('start_date', planEnd)
      .gte('end_date', planStart);

    // 7. Insert new sequence
    const { data: sequence, error: seqErr } = await supabase
      .from('sequences')
      .insert({
        user_id,
        horizon_event_id: race.id,
        validation_status: plan.validation_status,
        validation_messages: plan.validation_messages,
        is_active: true,
      })
      .select('id')
      .single();

    if (seqErr) throw seqErr;

    // 8. Insert block_instances. The first block covering today is 'active';
    //    later ones are 'planned'.
    const insertRows = plan.blocks.map((b) => {
      const isActiveNow = b.start_date <= today && b.end_date >= today;
      return {
        user_id,
        block_type: b.block_type,
        start_date: b.start_date,
        end_date: b.end_date,
        status: isActiveNow ? 'active' : 'planned',
        source: 'sequencer',
        parent_event_id: race.id,
        parent_event_tier: tier,
        coefficients_snapshot: coefficients,
        sequence_id: sequence.id,
        modified_by: 'system',
      };
    });

    const { data: insertedBlocks, error: blockErr } = await supabase
      .from('block_instances')
      .insert(insertRows)
      .select('id, block_type, start_date, end_date, status');

    if (blockErr) throw blockErr;

    // 9. Pre-generate next 14 days of prescriptions across whichever blocks
    //    cover that window. Build context once.
    const ctx = await buildSequencerContext(user_id, today);
    // Inject the resolved horizon event so generators that read
    // upcoming_events[0] (taper, race_specific) make tier-correct decisions.
    const ctxWithEvent = {
      ...ctx,
      upcoming_events: [
        {
          id: race.id,
          date: race.race_date,
          name: race.name,
          tier,
          status: 'upcoming',
        },
        ...ctx.upcoming_events.filter((e) => e.id !== race.id),
      ],
      coefficients,
    };

    const horizonEnd = (() => {
      const d = new Date(today + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + PRELOAD_DAYS - 1);
      return d.toISOString().slice(0, 10);
    })();

    const prescriptionRows = [];
    for (const block of insertedBlocks) {
      const range = clipRange(block.start_date, block.end_date, today, horizonEnd);
      if (!range) continue;
      const sessions = generateSessionsForBlock(
        block.block_type,
        block.start_date, // generator dates from block start so weekly cadence stays aligned
        block.end_date,
        ctxWithEvent
      );
      for (const s of sessions) {
        if (s.date >= range[0] && s.date <= range[1]) {
          prescriptionRows.push({
            user_id,
            block_id: block.id,
            date: s.date,
            session_type: s.session_type,
            target_rss: s.target_rss,
            target_duration_min: s.target_duration_min,
            prescribed_intervals: s.prescribed_intervals,
            long_ride_flag: s.long_ride_flag,
            notes: s.notes,
          });
        }
      }
    }

    if (prescriptionRows.length > 0) {
      const { error: presErr } = await supabase
        .from('session_prescriptions')
        .upsert(prescriptionRows, { onConflict: 'user_id,date' });
      if (presErr) throw presErr;
    }

    return res.status(200).json({
      ok: true,
      already_anchored: false,
      sequence_id: sequence.id,
      horizon_event: {
        id: race.id,
        name: race.name,
        race_date: race.race_date,
        tier,
      },
      blocks: insertedBlocks,
      prescriptions_inserted: prescriptionRows.length,
      validation_status: plan.validation_status,
      validation_messages: plan.validation_messages,
      chain_used: plan.chain_used,
      horizon_days: plan.horizon_days,
    });
  } catch (err) {
    console.error('[sequencer-event-anchored-init] error:', err);
    return res.status(500).json({
      error: 'Failed to initialize event-anchored plan',
      detail: err?.message ?? String(err),
    });
  }
}
