/**
 * Coach Correction Trigger — Cron Handler
 *
 * Runs daily at UTC 12:00. For each user who:
 *   1. Has an active race goal within 3–21 days with target_tfi_min/max set
 *   2. Is currently in the 6–8 AM local window
 *   3. Has no correction proposal generated in the last 48 hours
 *   4. Is not within 72 hours of a goal event (taper protection)
 *   5. Has projected TFI at the goal date outside the target band by > 3
 *
 * …it generates a correction proposal using Claude's propose_modification
 * and render_coach_voice tools, validates the response, and saves it.
 *
 * GET /api/coach-correction-trigger  (Vercel cron)
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { buildTemporalAnchor, fetchTemporalAnchorData } from './utils/temporalAnchor.js';
import {
  CORRECTION_TOOLS,
  buildTokenMap,
  resolveTokens,
  validateCorrectionProposal,
  enrichModificationsWithIds,
} from './utils/correctionTools.js';
import { projectTfiWithAndWithout } from './utils/tfiProjection.js';
import { PERSONA_DATA } from './utils/personaData.js';

const supabase = getSupabaseAdmin();

// ─── Trigger conditions ───────────────────────────────────────────────────────

const MIN_DAYS_TO_GOAL = 3;
const MAX_DAYS_TO_GOAL = 21;
const TAPER_GUARD_HOURS = 72;
const PROPOSAL_COOLDOWN_HOURS = 48;
const TFI_DEVIATION_THRESHOLD = 3;
const LOCAL_WINDOW_START_HOUR = 6;
const LOCAL_WINDOW_END_HOUR = 8;

function toLocalDateStr(date, timezone) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function localHour(date, timezone) {
  try {
    return parseInt(
      date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }),
      10
    );
  } catch {
    return date.getUTCHours();
  }
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T12:00:00Z');
  const b = new Date(dateStrB + 'T12:00:00Z');
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// ─── Proposal generation ──────────────────────────────────────────────────────

async function generateProposal(userId, personaId, goal, currentTfi, anchorBlock, anchorData, resolvedTimezone) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const persona = PERSONA_DATA[personaId] || PERSONA_DATA.pragmatist;

  const todayStr = toLocalDateStr(new Date(), resolvedTimezone);
  const daysUntil = daysBetween(todayStr, goal.race_date);

  const systemPrompt = `You are ${persona.name}, a cycling coach on Tribos.

${persona.philosophy}

${anchorBlock}

## CORRECTION MODE
The athlete's projected TFI at ${goal.name} (${daysUntil} days away) is ${currentTfi}.
Target TFI band: ${goal.target_tfi_min}–${goal.target_tfi_max}.
Gap: ${currentTfi < goal.target_tfi_min ? `${goal.target_tfi_min - currentTfi} below minimum` : `${currentTfi - goal.target_tfi_max} above maximum`}.

Your job: propose 1–3 specific session modifications to bring projected TFI into the target band.

## RULES
- Use ONLY session IDs from the SESSIONS block above.
- Call propose_modification once per session you want to change.
- After all propose_modification calls, call render_coach_voice exactly once.
- In render_coach_voice prose, use only {anchor_label} tokens for dates — NEVER raw day names.
- Keep modifications realistic: ±15–40 min duration, not wholesale plan changes.
- ${currentTfi < goal.target_tfi_min ? 'TFI is below target — prefer extending or adding load.' : 'TFI is above target — prefer reducing or skipping load.'}`;

  const claude = new Anthropic({ apiKey });

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0.3,
    system: systemPrompt,
    tools: CORRECTION_TOOLS,
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: 'Generate the correction proposal for this athlete.',
      },
    ],
  });

  // Extract tool calls
  const toolUses = response.content.filter(b => b.type === 'tool_use');
  const modifications = toolUses
    .filter(t => t.name === 'propose_modification')
    .map(t => t.input);
  const voiceTool = toolUses.find(t => t.name === 'render_coach_voice');

  if (!voiceTool || modifications.length === 0) {
    throw new Error(`Incomplete tool response: ${modifications.length} modifications, voice=${!!voiceTool}`);
  }

  return {
    modifications,
    opener: voiceTool.input.opener,
    closer: voiceTool.input.closer,
    usage: response.usage,
    raw: { modifications, voice: voiceTool.input },
  };
}

// ─── Main cron handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { authorized } = verifyCronAuth(req);
  if (!authorized) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date();
  const todayUTCStr = now.toISOString().split('T')[0];

  // Fetch all users who have an upcoming race goal with TFI targets set
  // within the trigger window (3–21 days away from today UTC)
  const minDate = new Date(now.getTime() + MIN_DAYS_TO_GOAL * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const maxDate = new Date(now.getTime() + MAX_DAYS_TO_GOAL * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: eligibleGoals, error: goalsError } = await supabase
    .from('race_goals')
    .select('id, user_id, name, race_date, target_tfi_min, target_tfi_max')
    .eq('status', 'upcoming')
    .not('target_tfi_min', 'is', null)
    .not('target_tfi_max', 'is', null)
    .gte('race_date', minDate)
    .lte('race_date', maxDate)
    .order('race_date', { ascending: true });

  if (goalsError) {
    console.error('Correction trigger: failed to fetch goals:', goalsError);
    return res.status(500).json({ error: 'db_error' });
  }

  const results = { evaluated: 0, fired: 0, skipped: 0, errors: 0 };
  // Deduplicate: one user may have multiple goals — process first goal per user
  const processedUsers = new Set();

  for (const goal of (eligibleGoals || [])) {
    if (processedUsers.has(goal.user_id)) continue;
    processedUsers.add(goal.user_id);
    results.evaluated++;

    const conditions = {
      has_goal: true,
      in_time_window: false,
      no_recent_proposal: false,
      not_in_taper: false,
      tfi_off_target: false,
    };

    try {
      // Fetch user timezone
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('timezone')
        .eq('id', goal.user_id)
        .maybeSingle();

      const timezone = profile?.timezone || 'UTC';
      const hour = localHour(now, timezone);

      // Condition 1: local time 6–8 AM
      conditions.in_time_window = hour >= LOCAL_WINDOW_START_HOUR && hour < LOCAL_WINDOW_END_HOUR;
      if (!conditions.in_time_window) {
        await logEvaluation(goal.user_id, timezone, false, conditions, null);
        results.skipped++;
        continue;
      }

      // Condition 2: no recent proposal
      const cooldownCutoff = new Date(now.getTime() - PROPOSAL_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { data: recentProposal } = await supabase
        .from('coach_correction_proposals')
        .select('id')
        .eq('user_id', goal.user_id)
        .gte('generated_at', cooldownCutoff)
        .limit(1)
        .maybeSingle();

      conditions.no_recent_proposal = !recentProposal;
      if (!conditions.no_recent_proposal) {
        await logEvaluation(goal.user_id, timezone, false, conditions, null);
        results.skipped++;
        continue;
      }

      // Condition 3: not in 72-hour taper window
      const taperCutoff = new Date(now.getTime() + TAPER_GUARD_HOURS * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      conditions.not_in_taper = goal.race_date > taperCutoff;
      if (!conditions.not_in_taper) {
        await logEvaluation(goal.user_id, timezone, false, conditions, null);
        results.skipped++;
        continue;
      }

      // Condition 4: TFI off-target
      // Get latest TFI from fitness_snapshots
      const { data: snapshot } = await supabase
        .from('fitness_snapshots')
        .select('ctl:tfi, snapshot_week')
        .eq('user_id', goal.user_id)
        .order('snapshot_week', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentTfi = snapshot?.ctl ?? null;

      if (currentTfi === null) {
        await logEvaluation(goal.user_id, timezone, false, conditions, null);
        results.skipped++;
        continue;
      }

      // Fetch workouts for projection
      const { plannedWorkouts } = await fetchTemporalAnchorData(goal.user_id, supabase, timezone);
      const startDateStr = toLocalDateStr(now, timezone);
      const { without: projectedWithout } = projectTfiWithAndWithout(
        currentTfi, startDateStr, goal.race_date, plannedWorkouts, []
      );

      const inBand =
        projectedWithout >= goal.target_tfi_min &&
        projectedWithout <= goal.target_tfi_max;
      const deviation = inBand
        ? 0
        : Math.min(
          Math.abs(projectedWithout - goal.target_tfi_min),
          Math.abs(projectedWithout - goal.target_tfi_max)
        );

      conditions.tfi_off_target = deviation > TFI_DEVIATION_THRESHOLD;
      conditions.current_tfi = currentTfi;
      conditions.projected_tfi = projectedWithout;
      conditions.target_band = `${goal.target_tfi_min}–${goal.target_tfi_max}`;
      conditions.deviation = deviation;

      if (!conditions.tfi_off_target) {
        await logEvaluation(goal.user_id, timezone, false, conditions, null);
        results.skipped++;
        continue;
      }

      // All conditions met — generate proposal
      // Fetch coach settings for persona
      const { data: coachSettings } = await supabase
        .from('user_coach_settings')
        .select('coaching_persona')
        .eq('user_id', goal.user_id)
        .maybeSingle();

      const personaId = coachSettings?.coaching_persona || 'pragmatist';

      // Build anchor (full 14-day context for the LLM)
      const { raceGoals: allGoals } = await fetchTemporalAnchorData(goal.user_id, supabase, timezone);
      const anchorBlock = buildTemporalAnchor(timezone, plannedWorkouts, allGoals);

      let proposal;
      let attempt = 0;
      let lastErrors = [];

      while (attempt < 2) {
        attempt++;
        try {
          const raw = await generateProposal(
            goal.user_id, personaId, goal, projectedWithout, anchorBlock, { plannedWorkouts, raceGoals: allGoals }, timezone
          );

          // Resolve tokens server-side
          const tokenMap = buildTokenMap(timezone, plannedWorkouts, allGoals);
          const resolvedOpener = resolveTokens(raw.opener, tokenMap);
          const resolvedCloser = resolveTokens(raw.closer, tokenMap);

          // Validate (Phase 6)
          const enriched = enrichModificationsWithIds(raw.modifications, plannedWorkouts);
          const { valid, errors } = validateCorrectionProposal(
            enriched, plannedWorkouts, resolvedOpener, resolvedCloser
          );

          if (!valid) {
            lastErrors = errors;
            console.warn(`Correction trigger: validation failed (attempt ${attempt}) for user ${goal.user_id}:`, errors);
            if (attempt < 2) continue; // regenerate
            // Second failure: fallback — no modifications, log
            console.error(`Correction trigger: second validation failure for user ${goal.user_id}. Skipping.`);
            results.errors++;
            await logEvaluation(goal.user_id, timezone, false,
              { ...conditions, validation_failed: true, errors }, null);
            break;
          }

          // Compute projected TFI with modifications
          const { with: projectedWith } = projectTfiWithAndWithout(
            currentTfi, startDateStr, goal.race_date, plannedWorkouts, enriched
          );

          // Save proposal
          const { data: savedProposal, error: saveError } = await supabase
            .from('coach_correction_proposals')
            .insert({
              user_id: goal.user_id,
              race_goal_id: goal.id,
              persona_id: personaId,
              opener_text: resolvedOpener,
              closer_text: resolvedCloser,
              modifications: enriched,
              current_tfi: currentTfi,
              projected_tfi_without: projectedWithout,
              projected_tfi_with: projectedWith,
              target_tfi_min: goal.target_tfi_min,
              target_tfi_max: goal.target_tfi_max,
              outcome: 'pending',
              input_tokens: raw.usage?.input_tokens,
              output_tokens: raw.usage?.output_tokens,
              raw_response: raw.raw,
            })
            .select('id')
            .single();

          if (saveError) throw saveError;

          await logEvaluation(goal.user_id, timezone, true, conditions, savedProposal.id);
          results.fired++;
          proposal = savedProposal;
          break;
        } catch (genErr) {
          console.error(`Correction trigger: generation error (attempt ${attempt}) for user ${goal.user_id}:`, genErr.message);
          lastErrors = [genErr.message];
          if (attempt >= 2) {
            results.errors++;
            await logEvaluation(goal.user_id, timezone, false,
              { ...conditions, generation_error: genErr.message }, null);
          }
        }
      }
    } catch (userErr) {
      console.error(`Correction trigger: unexpected error for user ${goal.user_id}:`, userErr.message);
      results.errors++;
    }
  }

  console.log(`Coach correction trigger complete [${todayUTCStr}]:`, results);
  return res.status(200).json({ success: true, ...results });
}

async function logEvaluation(userId, timezone, fired, conditions, proposalId) {
  await supabase.from('coach_correction_trigger_log').insert({
    user_id: userId,
    timezone,
    fired,
    conditions,
    proposal_id: proposalId,
  }).catch(err => console.error('Failed to log trigger evaluation:', err.message));
}
