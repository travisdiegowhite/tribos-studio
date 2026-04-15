/**
 * Coach Ride Analysis Endpoint
 *
 * Generates a long-form, persona-voiced narrative that analyzes a single
 * activity using the resampled time series and derived metrics stored in
 * `activities.fit_coach_context` (populated at FIT ingestion time by
 * fitParser → fitCoachContext).
 *
 * Generation is lazy: the first time a user opens the Deep Ride Analysis
 * section for an activity we call Claude, persist the text + persona on the
 * activity row, and return it. Subsequent opens read from cache. If the
 * user has changed personas since the last generation we re-run.
 *
 * POST /api/coach-ride-analysis
 * Auth: Bearer <JWT>
 * Body: { activityId: string }
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { PERSONA_DATA } from './utils/personaData.js';

const supabase = getSupabaseAdmin();

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 900;
const TEMPERATURE = 0.5;

// ─── Prompt Builders ────────────────────────────────────────────────────────

function buildSystemPrompt(personaId, hasIntent, hasPower) {
  const persona = PERSONA_DATA[personaId] || PERSONA_DATA.pragmatist;

  return `## ROLE
You are ${persona.name}, the rider's cycling coach. You are reviewing a single completed ride in depth using power, heart-rate, and cadence time-series data, plus derived metrics that have been pre-computed for you. Your job is to give the rider a focused, evidence-based read on this specific ride — not generic training advice.

## YOUR COACHING PHILOSOPHY
${persona.philosophy}

## YOUR VOICE
${persona.voice}

## WHAT YOU EMPHASIZE
${persona.emphasizes}

## WHAT YOU NEVER SAY
${persona.neverSay}

## WHAT YOU HAVE
- The athlete's FTP, current zones, and current training load (CTL/ATL/TSB)
- Today's terrain classification (flat / rolling / hilly / mountainous) from recent rides, when available — reference it when it's relevant to recovery or pacing expectations
- Pre-computed summary metrics (NP, IF, TSS, VI, avg/max power, avg HR)
- Power zone distribution (% of pedaling time in Z1–Z7)
- Cadence band distribution
- Aerobic decoupling (first-half vs second-half Pa:HR)
- Power dropout detection (sensor-failure flag)
- A uniform-interval time series of (t, power, hr, cadence) — the actual shape of the ride
${hasIntent ? '- The intended workout (planned TSS, planned duration, name) for direct comparison' : '- No planned workout matched — treat this as an unstructured ride'}
${hasPower ? '' : '- ⚠ NO POWER DATA available for this ride; analyze HR + cadence only'}

## WHAT TO ANALYZE
Cover all of the following dimensions. Be specific. Every claim must reference an actual number from the data above.

1. EXECUTION FIDELITY
${hasIntent
  ? '   Did the athlete execute the intended workout? Compare actual TSS / duration / IF to targets. Were intervals on-zone? Did they bail early or push past?'
  : '   Characterize the ride type from the zone distribution (steady aerobic, tempo, mixed). Was the pacing appropriate for current TSB?'}

2. POWER QUALITY
   Evaluate VI (1.00–1.05 = excellent, 1.06–1.12 = acceptable, >1.12 = erratic). Was the distribution appropriate for this kind of workout? Note any meaningful spikes or collapses you can see in the time series.

3. CARDIAC RESPONSE
   Was HR appropriate for the power output? Evaluate aerobic decoupling — flag drift > 5% as meaningful. If TSB is negative, expect HR to run hot — acknowledge that.

4. CADENCE PATTERNS
   Flag if cadence was too low for the effort (e.g. high Z4/Z5 with <80 rpm = grinding). Flag erratic cadence relative to power. Note cadence-power mismatches.

5. FATIGUE & TREND SIGNALS
   Did performance degrade through the session? Where? How does this TSS compare to the athlete's recent ATL — is this load-appropriate?

## RESPONSE RULES
- Stay in your coach voice throughout. Do not be generic.
- Every claim must reference a specific number from the data.
- Do not give unrelated training advice.
- If the dropout flag is set, explicitly acknowledge it and discount affected intervals.
- Keep the response under 400 words.
- End with one specific, actionable note for the next session.
- Return PLAIN MARKDOWN — no JSON, no code fences, no preamble. Use short headings (e.g. **Execution**) and short paragraphs.`;
}

function buildUserPrompt({ activity, athlete, fitness, fitCoachContext, intent }) {
  const ctx = fitCoachContext;
  const tsMin = Math.round((ctx.duration_seconds || 0) / 60);

  const formatZoneDist = (d) =>
    d
      ? `Z1:${d.z1}% Z2:${d.z2}% Z3:${d.z3}% Z4:${d.z4}% Z5:${d.z5}% Z6:${d.z6}% Z7:${d.z7}%`
      : 'unavailable (no FTP / zones)';

  const formatCadenceBands = (b) =>
    b
      ? `<70:${b.below_70}% | 70–84:${b.band_70_84}% | 85–94:${b.band_85_94}% | 95+:${b.band_95_plus}% (avg ${b.avg} rpm)`
      : 'unavailable';

  const decoupling = ctx.aerobic_decoupling
    ? `first-half Pa:HR ${ctx.aerobic_decoupling.first_half_pa_hr}, second-half ${ctx.aerobic_decoupling.second_half_pa_hr}, drift ${ctx.aerobic_decoupling.decoupling_pct}% (${ctx.aerobic_decoupling.interpretation})`
    : 'insufficient HR data';

  const dropouts = ctx.power_dropouts
    ? ctx.power_dropouts.suspected_sensor_failure
      ? `⚠ POWER DROPOUTS DETECTED: ${ctx.power_dropouts.total_dropouts} samples (${ctx.power_dropouts.dropout_seconds}s, ${ctx.power_dropouts.dropout_pct}% of ride). Cadence was active during dropouts — suspected sensor issue.`
      : 'no significant dropouts'
    : 'no significant dropouts';

  const intentBlock = intent
    ? `## INTENDED WORKOUT
Name: ${intent.name || 'Untitled'}
Type: ${intent.workout_type || 'unspecified'}
Target TSS: ${intent.target_tss ?? 'unspecified'} | Target duration: ${intent.target_duration ?? 'unspecified'} min
${intent.execution_score != null ? `Pre-computed execution score: ${intent.execution_score}/100 (${intent.execution_rating ?? 'n/a'})` : ''}`
    : '## INTENDED WORKOUT\nUnstructured ride — no planned workout matched.';

  return `## ATHLETE
FTP: ${athlete.ftp ?? 'N/A'}W | Weight: ${athlete.weight_kg ?? 'N/A'} kg | Max HR: ${athlete.max_hr ?? 'N/A'} bpm
TFI: ${fitness.tfi ?? 'N/A'} | AFI: ${fitness.afi ?? 'N/A'} | FS: ${fitness.form_score ?? 'N/A'}${fitness.terrain_class ? ` | Terrain: ${fitness.terrain_class}` : ''}${fitness.load_trend ? ` | Trend: ${fitness.load_trend}` : ''}${fitness.overtraining_risk && fitness.overtraining_risk !== 'low' ? ` | Overtraining risk: ${fitness.overtraining_risk}` : ''}

${intentBlock}

## RIDE SUMMARY
"${activity.name}" — ${activity.start_date}
Duration: ${tsMin} min | Distance: ${activity.distance ? Math.round(activity.distance / 100) / 10 : 'N/A'} km
Avg power: ${activity.average_watts ?? 'N/A'}W | NP: ${activity.normalized_power ?? 'N/A'}W | Max: ${activity.max_watts ?? 'N/A'}W
TSS: ${activity.tss ?? 'N/A'} | IF: ${activity.intensity_factor ?? 'N/A'} | VI: ${activity.ride_analytics?.variability_index ?? 'N/A'}
Avg HR: ${activity.average_heartrate ?? 'N/A'} bpm | Max HR: ${activity.max_heartrate ?? 'N/A'} bpm
Avg cadence: ${activity.average_cadence ?? 'N/A'} rpm

## DERIVED METRICS
Power zone distribution: ${formatZoneDist(ctx.power_zone_distribution)}
Cadence bands: ${formatCadenceBands(ctx.cadence_bands)}
Aerobic decoupling: ${decoupling}
Sensor health: ${dropouts}

## TIME SERIES (${ctx.interval_seconds}s intervals, ${ctx.sample_count} samples; t in seconds from start)
${JSON.stringify(ctx.time_series)}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadAthleteContext(userId) {
  const [{ data: profile }, { data: load }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('ftp, weight_kg, max_hr')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('training_load_daily')
      .select('tfi, afi, form_score, terrain_class, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let snapshot = null;
  try {
    const { data } = await supabase
      .from('fitness_snapshots')
      .select('load_trend, overtraining_risk')
      .eq('user_id', userId)
      .order('snapshot_week', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshot = data || null;
  } catch {
    snapshot = null;
  }

  return {
    athlete: {
      ftp: profile?.ftp ?? null,
      weight_kg: profile?.weight_kg ?? null,
      max_hr: profile?.max_hr ?? null,
    },
    fitness: {
      tfi: load?.tfi ?? null,
      afi: load?.afi ?? null,
      form_score: load?.form_score ?? null,
      terrain_class: load?.terrain_class ?? null,
      load_trend: snapshot?.load_trend ?? null,
      overtraining_risk: snapshot?.overtraining_risk ?? null,
    },
  };
}

async function loadIntent(activity) {
  if (!activity.matched_planned_workout_id) return null;
  const { data: planned, error } = await supabase
    .from('planned_workouts')
    .select('id, name, workout_type, target_tss, target_duration')
    .eq('id', activity.matched_planned_workout_id)
    .maybeSingle();
  if (error || !planned) return null;
  return {
    name: planned.name,
    workout_type: planned.workout_type,
    target_tss: planned.target_tss,
    target_duration: planned.target_duration,
    execution_score: activity.execution_score,
    execution_rating: activity.execution_rating,
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please sign in again.' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please sign in again.' });
  }

  const userId = user.id;

  // Rate limit (10 requests / 5 min per user) — caps Claude spend
  const limited = await rateLimitByUser(req, res, 'coach-ride-analysis', userId, 10, 5);
  if (limited) return;

  const activityId = req.body?.activityId;
  if (!activityId || typeof activityId !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'activityId is required' });
  }

  try {
    // Load activity (verify ownership via user_id)
    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .select(
        'id, user_id, name, start_date, distance, moving_time, average_watts, normalized_power, max_watts, tss, intensity_factor, average_heartrate, max_heartrate, average_cadence, ride_analytics, fit_coach_context, fit_coach_analysis, fit_coach_analysis_persona, fit_coach_analysis_generated_at, matched_planned_workout_id, execution_score, execution_rating'
      )
      .eq('id', activityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (activityError) {
      console.error('coach-ride-analysis: activity fetch failed', activityError);
      return res.status(500).json({ error: 'internal_error', message: 'Could not load activity.' });
    }
    if (!activity) {
      return res.status(404).json({ error: 'not_found', message: 'Activity not found.' });
    }
    if (!activity.fit_coach_context) {
      return res.status(400).json({
        error: 'no_fit_data',
        message: 'This activity does not have FIT time-series data — deep analysis is unavailable.',
      });
    }

    // Resolve current persona
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', userId)
      .maybeSingle();
    const personaId = settings?.coaching_persona && settings.coaching_persona !== 'pending'
      ? settings.coaching_persona
      : 'pragmatist';

    // Cache hit: persona unchanged and analysis exists
    if (activity.fit_coach_analysis && activity.fit_coach_analysis_persona === personaId) {
      return res.status(200).json({
        success: true,
        cached: true,
        persona_id: personaId,
        analysis: activity.fit_coach_analysis,
        generated_at: activity.fit_coach_analysis_generated_at,
      });
    }

    // Cache miss → generate
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'config', message: 'Coaching service not configured.' });
    }

    const [{ athlete, fitness }, intent] = await Promise.all([
      loadAthleteContext(userId),
      loadIntent(activity),
    ]);

    const hasPower = !!(activity.average_watts || activity.normalized_power);
    const systemPrompt = buildSystemPrompt(personaId, intent !== null, hasPower);
    const userPrompt = buildUserPrompt({
      activity,
      athlete,
      fitness,
      fitCoachContext: activity.fit_coach_context,
      intent,
    });

    const claude = new Anthropic({ apiKey });
    const response = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) {
      return res.status(500).json({ error: 'empty_response', message: 'Coach response was empty.' });
    }

    const generatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('activities')
      .update({
        fit_coach_analysis: text,
        fit_coach_analysis_persona: personaId,
        fit_coach_analysis_generated_at: generatedAt,
      })
      .eq('id', activityId);

    if (updateError) {
      // Cache failure is non-fatal; we still return the text to the user
      console.error('coach-ride-analysis: cache write failed', updateError);
    }

    return res.status(200).json({
      success: true,
      cached: false,
      persona_id: personaId,
      analysis: text,
      generated_at: generatedAt,
      usage: response.usage,
    });
  } catch (err) {
    console.error('coach-ride-analysis: unexpected error', err);
    if (err?.status === 429) {
      return res.status(429).json({ error: 'rate_limited', message: 'Coach service busy. Try again in a minute.' });
    }
    return res.status(500).json({ error: 'internal_error', message: 'Could not generate ride analysis.' });
  }
}
