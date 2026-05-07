/**
 * Event-anchored calendar bridge.
 *
 * Projects rows from `session_prescriptions` (canonical, written by the
 * sequencer) onto `planned_workouts` (consumed by the calendar at /planner)
 * so anchored sessions show up alongside any template-based plan.
 *
 * Design: see docs/event-anchored-calendar-bridge.md.
 *
 * Canonical → projection direction only. Never reads `planned_workouts` to
 * mutate `session_prescriptions`. The phantom training_plans row is identified
 * by template_id = 'event_anchored' (one per user).
 */

const PHANTOM_TEMPLATE_ID = 'event_anchored';

const SESSION_TYPE_TO_WORKOUT_TYPE = {
  rest: 'rest',
  z1: 'recovery',
  z2: 'endurance',
  tempo: 'tempo',
  threshold: 'threshold',
  vo2: 'vo2max',
  race_sim: 'race_sim',
  opener: 'opener',
};

const SESSION_TYPE_LABEL = {
  rest: 'Rest',
  z1: 'Recovery',
  z2: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO2',
  race_sim: 'Race Simulation',
  opener: 'Opener',
};

const BLOCK_TYPE_LABEL = {
  base: 'Base',
  build: 'Build',
  threshold: 'Threshold',
  vo2: 'VO2',
  race_specific: 'Race-Specific',
  taper: 'Taper',
  recovery: 'Recovery',
  maintenance: 'Maintenance',
};

function dayOfWeek(dateStr) {
  // 0=Sunday … 6=Saturday, matching the existing planned_workouts convention.
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function weekNumberFromStart(scheduledDate, planStartedAt) {
  if (!planStartedAt) return 1;
  const start = new Date(planStartedAt);
  const sched = new Date(scheduledDate + 'T00:00:00Z');
  const diffDays = Math.floor((sched - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

function formatName(sessionType, blockType) {
  const sessionLabel = SESSION_TYPE_LABEL[sessionType] ?? sessionType;
  const blockLabel = BLOCK_TYPE_LABEL[blockType] ?? blockType;
  if (!blockLabel) return sessionLabel;
  return `${sessionLabel} • ${blockLabel}`;
}

/**
 * Look up (or create / update) the phantom training_plans row that holds the
 * calendar projection for this user's anchored sequence. Returns the plan id.
 *
 * Re-anchoring with a different race updates the existing phantom plan's name
 * in place rather than creating a second row, so the user only ever sees one
 * "Race: <name>" entry in the planner selector.
 */
export async function ensureEventAnchoredPlan(supabase, userId, race) {
  const planName = `Race: ${race.name}`;

  const { data: existing, error: selErr } = await supabase
    .from('training_plans')
    .select('id, name')
    .eq('user_id', userId)
    .eq('template_id', PHANTOM_TEMPLATE_ID)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing?.id) {
    if (existing.name !== planName) {
      await supabase
        .from('training_plans')
        .update({ name: planName, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: created, error: insErr } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      template_id: PHANTOM_TEMPLATE_ID,
      name: planName,
      duration_weeks: 0,
      status: 'active',
      started_at: today,
    })
    .select('id')
    .single();

  if (insErr) throw insErr;
  return created.id;
}

/**
 * Build the projection-row payload for a single session_prescription. Pure;
 * does not hit the database. Caller passes `blockType` from the prescription's
 * parent block_instance.
 */
export function projectionRowForPrescription({
  planId,
  userId,
  prescription,
  blockType,
  planStartedAt,
}) {
  const sessionType = prescription.session_type;
  const workoutType = SESSION_TYPE_TO_WORKOUT_TYPE[sessionType] ?? 'endurance';
  const targetRss = prescription.target_rss ?? 0;
  const durationMin = prescription.target_duration_min ?? 0;

  return {
    plan_id: planId,
    user_id: userId,
    week_number: weekNumberFromStart(prescription.date, planStartedAt),
    day_of_week: dayOfWeek(prescription.date),
    scheduled_date: prescription.date,
    workout_type: workoutType,
    workout_id: null,
    name: formatName(sessionType, blockType),
    // Canonical-only writer per CLAUDE.md §metrics rollout (target_tss left
    // null; readers fall back via target_rss ?? target_tss).
    target_rss: targetRss,
    target_duration: durationMin,
    duration_minutes: durationMin,
    notes: prescription.gating_reason ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert a batch of projection rows. Keyed on the (plan_id, scheduled_date)
 * unique constraint added by add_unique_scheduled_date_constraint.sql so
 * re-runs (init + same-day rollover) are idempotent.
 */
export async function upsertProjectionRows(supabase, rows) {
  if (!rows || rows.length === 0) return { inserted: 0 };
  const { error } = await supabase
    .from('planned_workouts')
    .upsert(rows, { onConflict: 'plan_id,scheduled_date' });
  if (error) throw error;
  return { inserted: rows.length };
}

/**
 * Delete projection rows in [from, to] (inclusive) for the phantom plan.
 * Used by the init endpoint when replace=true wipes the previous sequence.
 */
export async function deleteProjectionInRange(supabase, planId, fromDate, toDate) {
  if (!planId || !fromDate || !toDate) return { deleted: 0 };
  const { error, count } = await supabase
    .from('planned_workouts')
    .delete({ count: 'exact' })
    .eq('plan_id', planId)
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate);
  if (error) throw error;
  return { deleted: count ?? 0 };
}

/**
 * Convenience: given the planId, the phantom plan's started_at, the userId,
 * and a list of {prescription, blockType} pairs, build rows and upsert them.
 * Used by both the init endpoint and the rollover cron.
 */
export async function projectPrescriptionsToCalendar(
  supabase,
  { planId, userId, planStartedAt, items }
) {
  if (!items || items.length === 0) return { inserted: 0 };
  const rows = items.map(({ prescription, blockType }) =>
    projectionRowForPrescription({
      planId,
      userId,
      prescription,
      blockType,
      planStartedAt,
    })
  );
  return upsertProjectionRows(supabase, rows);
}

export const EVENT_ANCHORED_TEMPLATE_ID = PHANTOM_TEMPLATE_ID;
