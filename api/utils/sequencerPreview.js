/**
 * Sequencer — event-anchored PREVIEW (no writes).
 *
 * `buildAnchoredPreview()` produces exactly the block chain + 14-day session
 * prescriptions that `sequencer-event-anchored-init.js` would persist, but
 * writes nothing. The coach uses it to show a confirmable plan before the
 * athlete taps "Anchor plan".
 *
 * Single-source guarantee: the race resolution, coefficient resolution, and
 * sequencer-context construction here are the SAME helpers the init endpoint
 * uses, and the block chain comes from the same `buildEventAnchoredSequence`,
 * so the preview cannot drift from what gets written on confirm.
 */

import {
  generateSessionsForBlock,
  coefficientsForMode,
} from './sequencerBlockOps.js';
import {
  buildSequencerContext,
  defaultRecoveryMode,
} from './sequencerContext.js';
import { buildEventAnchoredSequence } from './sequencerPlanner.js';

export const PREVIEW_DAYS = 14;

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function clipRange(start, end, fromDate, toDate) {
  const a = start < fromDate ? fromDate : start;
  const b = end > toDate ? toDate : end;
  return a <= b ? [a, b] : null;
}

/**
 * Resolve + validate the race goal an anchor will target. Returns
 * `{ race, tier }` on success, or `{ error, status, detail? }` for the same
 * failure cases the init endpoint enforces (not found / not owned / not
 * upcoming / in the past).
 */
export async function resolveRaceForAnchor(supabase, user_id, race_goal_id) {
  const { data: race, error } = await supabase
    .from('race_goals')
    .select('id, user_id, name, race_date, priority, status')
    .eq('id', race_goal_id)
    .maybeSingle();

  if (error) throw error;

  const today = todayUtc();
  if (!race) return { error: 'race_goal_not_found', status: 404 };
  if (race.user_id !== user_id) {
    return { error: 'race_goal_not_owned_by_user', status: 403 };
  }
  if (race.status !== 'upcoming') {
    return {
      error: 'race_goal_not_upcoming',
      status: 400,
      detail: `race_goal status is ${race.status}; only 'upcoming' can be anchored.`,
    };
  }
  if (race.race_date <= today) {
    return {
      error: 'race_in_past',
      status: 400,
      detail: 'Race date must be after today.',
    };
  }
  return { race, tier: race.priority ?? 'B' };
}

/** Resolve masters/recovery coefficients from the user's profile. */
export async function resolveCoefficients(supabase, user_id) {
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

  return { recoveryMode, coefficients, age };
}

/**
 * Build the sequencer context with the resolved horizon event injected at
 * upcoming_events[0] (so taper/race_specific generators make tier-correct
 * decisions). Shared by the preview and the init endpoint.
 */
export async function buildAnchoredContext(supabase, user_id, today, race, tier, coefficients) {
  const ctx = await buildSequencerContext(user_id, today);
  return {
    ...ctx,
    upcoming_events: [
      { id: race.id, date: race.race_date, name: race.name, tier, status: 'upcoming' },
      ...ctx.upcoming_events.filter((e) => e.id !== race.id),
    ],
    coefficients,
  };
}

/**
 * Produce the no-write preview: the block chain plus the first
 * `PREVIEW_DAYS` of session prescriptions.
 *
 * @returns {Promise<object>} `{ ok: true, race_goal_id, horizon_event, blocks,
 *   prescriptions, validation_status, validation_messages, chain_used,
 *   horizon_days }` on success, or `{ ok: false, error, status?, detail?,
 *   validation_messages? }` on failure.
 */
export async function buildAnchoredPreview({ supabase, user_id, race_goal_id }) {
  const resolved = await resolveRaceForAnchor(supabase, user_id, race_goal_id);
  if (resolved.error) return { ok: false, ...resolved };
  const { race, tier } = resolved;

  const { coefficients } = await resolveCoefficients(supabase, user_id);
  const today = todayUtc();

  const plan = buildEventAnchoredSequence({
    today,
    race_date: race.race_date,
    tier,
    coefficients,
  });

  if (plan.validation_status === 'conflict') {
    return {
      ok: false,
      error: 'plan_conflict',
      status: 400,
      validation_messages: plan.validation_messages,
    };
  }

  const ctxWithEvent = await buildAnchoredContext(
    supabase, user_id, today, race, tier, coefficients
  );

  const horizonEnd = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + PREVIEW_DAYS - 1);
    return d.toISOString().slice(0, 10);
  })();

  const prescriptions = [];
  for (const block of plan.blocks) {
    const range = clipRange(block.start_date, block.end_date, today, horizonEnd);
    if (!range) continue;
    const sessions = generateSessionsForBlock(
      block.block_type,
      block.start_date,
      block.end_date,
      ctxWithEvent
    );
    for (const s of sessions) {
      if (s.date >= range[0] && s.date <= range[1]) {
        prescriptions.push({
          date: s.date,
          block_type: block.block_type,
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
  prescriptions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ok: true,
    race_goal_id: race.id,
    horizon_event: {
      id: race.id,
      name: race.name,
      race_date: race.race_date,
      tier,
    },
    blocks: plan.blocks,
    prescriptions,
    validation_status: plan.validation_status,
    validation_messages: plan.validation_messages,
    chain_used: plan.chain_used,
    horizon_days: plan.horizon_days,
  };
}
