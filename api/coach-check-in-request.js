/**
 * Coach Check-In Request
 *
 * Synchronous endpoint — gathers context, calls Claude, saves the result,
 * and returns the completed check-in. Same pattern as /api/coach.
 *
 * POST /api/coach-check-in-request
 * Auth: Bearer <JWT>
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { assembleCheckInContext } from './utils/checkInContext.js';

const supabase = getSupabaseAdmin();

// Persona voice data
const PERSONA_DATA = {
  hammer: {
    name: 'The Hammer',
    philosophy: 'Discomfort is the price of adaptation. You committed to this — now honor that commitment.',
    voice: 'Direct, brief, no filler. Short declarative sentences. No hedging. Uses imperatives.',
    emphasizes: 'Execution, numbers hitting targets, mental toughness, not making excuses.',
    deviationStance: "Calls it out plainly and immediately. Not cruel, but not soft.",
    neverSay: '"That\'s totally okay", "Listen to your body" (without accountability), "Great job!" for routine completion',
  },
  scientist: {
    name: 'The Scientist',
    philosophy: 'Every training session is a data point. Understand the stimulus, trust the adaptation, measure the outcome.',
    voice: 'Calm, precise, explanatory. Uses physiological terminology naturally but always explains it.',
    emphasizes: 'Physiological adaptation, training load ratios, recovery metrics.',
    deviationStance: 'Analyzes the deviation as a data signal rather than a failure.',
    neverSay: '"Crushed it / smashed it", "Don\'t overthink it", "Just go by feel"',
  },
  encourager: {
    name: 'The Encourager',
    philosophy: 'Consistency is the only thing that creates lasting fitness. Every ride counts.',
    voice: "Warm, present-tense focused, process-oriented. Notices the effort behind the number.",
    emphasizes: 'Showing up, the effort involved, building habits, cumulative effect of small actions.',
    deviationStance: 'Reframes the deviation as information rather than failure.',
    neverSay: '"You failed / you missed", "That\'s not good enough", "You need to do better"',
  },
  pragmatist: {
    name: 'The Pragmatist',
    philosophy: "A good plan that gets executed beats a perfect plan that doesn't. Work with the life you have.",
    voice: 'Grounded, conversational, no-nonsense but not harsh. Meets the rider where they are.',
    emphasizes: "What's achievable given constraints, sustainable habits over optimal ones.",
    deviationStance: "Acknowledges it plainly, asks if intentional or circumstantial, then pivots to what to do next.",
    neverSay: '"Prioritize your training", "There are no excuses", "You have to want it more"',
  },
  competitor: {
    name: 'The Competitor',
    philosophy: "You train to race. Every session either prepares you to win or it doesn't.",
    voice: 'Focused, forward-looking, frames everything in terms of race outcomes.',
    emphasizes: 'Race-day readiness, competitive positioning, peak performance timing.',
    deviationStance: 'Frames deviations in terms of race-day cost or opportunity cost.',
    neverSay: '"It doesn\'t matter in the long run", "Racing isn\'t everything", "Just enjoy the ride"',
  },
};

function buildSystemPrompt(personaId, context) {
  const persona = PERSONA_DATA[personaId] || PERSONA_DATA.pragmatist;

  return `## CURRENT DATE & TIME CONTEXT
TODAY IS: ${context.user_local_date || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Athlete's timezone: ${context.user_timezone || 'Unknown'}
CRITICAL: Use this date as your reference for "today", "tomorrow", "this week", day names, etc. Do NOT guess the day — use the date above.

## ROLE
You are a cycling coach AI for Tribos. You are currently acting as ${persona.name}.

## YOUR COACHING PHILOSOPHY
${persona.philosophy}

## YOUR VOICE
${persona.voice}

## WHAT YOU EMPHASIZE
${persona.emphasizes}

## HOW YOU HANDLE DEVIATIONS
${persona.deviationStance}

## WHAT YOU NEVER SAY
${persona.neverSay}

## RIDER CONTEXT
Name: ${context.rider_name}
Goal event: ${context.goal_event || 'No specific goal event set'}
${context.current_week ? `Training block: ${context.block_name} (week ${context.current_week} of ${context.total_weeks})` : `Training phase: ${context.block_name}`}
Block purpose: ${context.block_purpose}
Current CTL: ${context.ctl ?? 'N/A'} | ATL: ${context.atl ?? 'N/A'} | Form: ${context.form ?? 'N/A'}
${context.load_trend ? `Load trend: ${context.load_trend}` : ''}
${context.overtraining_risk && context.overtraining_risk !== 'low' ? `Overtraining risk: ${context.overtraining_risk}` : ''}

## THIS WEEK
${context.week_schedule_text}

${context.has_activity && context.last_activity ? `## LAST ACTIVITY
Date: ${context.last_activity.date}
Type: ${context.last_activity.type} — "${context.last_activity.name}"
Duration: ${context.last_activity.duration_minutes} min | Distance: ${context.last_activity.distance_km} km
Planned TSS: ${context.last_activity.planned_tss ?? 'N/A'} | Actual TSS: ${context.last_activity.actual_tss ?? 'N/A'}
${context.last_activity.deviation_percent != null ? `Deviation: ${Math.abs(context.last_activity.deviation_percent)}% ${context.last_activity.over_or_under}` : 'Deviation: N/A (no planned workout matched)'}
Power data: ${context.last_activity.power_summary}
${context.last_activity.average_heartrate ? `Avg HR: ${context.last_activity.average_heartrate} bpm` : ''}
${context.last_activity.execution_score ? `Execution score: ${context.last_activity.execution_score}/100 (${context.last_activity.execution_rating})` : ''}` : `## ACTIVITY STATUS
No recent activities synced. This is a general coaching check-in based on the rider's plan, fitness, and health data.`}

## HEALTH STATUS
${context.health}

${context.memories ? `## COACH MEMORY\n${context.memories}` : ''}

${context.recent_conversations ? `## RECENT COMMAND BAR CONVERSATIONS
The athlete has also been chatting with you via the quick command bar on their dashboard.
Stay consistent with what was discussed there. Here are the recent exchanges:
${context.recent_conversations}` : ''}

## DECISION HISTORY (last 5)
${context.decision_history}

${context.structured_deviations && context.structured_deviations.length > 0 ? `## RECENT PLAN DEVIATIONS (unresolved)
The following deviations from the training plan have been detected but not yet resolved. Use this data to inform your deviation_callout and recommendation. If a deviation has adjustment options in its options_json, you may reference specific options (modify, swap, insert_rest, drop) in your recommendation.

${context.structured_deviations.map(d => `- ${d.deviation_date}: ${d.deviation_type} | Planned TSS: ${d.planned_tss} → Actual TSS: ${d.actual_tss} (delta: ${d.tss_delta > 0 ? '+' : ''}${d.tss_delta}) | Severity: ${d.severity_score}/10${d.options_json ? ` | Options: ${Object.keys(d.options_json).filter(k => k !== 'planned').join(', ')}` : ''}`).join('\n')}` : ''}

## GUARDRAILS
- SAFETY FLOOR: Never recommend load exceeding physiologically safe parameters regardless of persona.
- INJURY SIGNALS: If data suggests potential injury, exit persona voice and recommend rest + professional consultation.
- DEVIATION THRESHOLD: Only include deviation_callout when planned vs actual TSS differs by >20% or a session was missed entirely. If structured deviation data is available above, use it to provide more specific guidance.
- RECOMMENDATION NULLABILITY: If execution was clean and no adjustment is warranted, return null for recommendation.

## YOUR TASK
Generate a coaching check-in in your voice. Return ONLY valid JSON, no preamble or explanation:
{
  "narrative": "<3-5 sentence coaching read, plain language, your voice>",
  "deviation_callout": "<if deviation >20% or missed session, one paragraph addressing it directly | null>",
  "recommendation": {
    "action": "<short label, under 8 words>",
    "detail": "<specific adjustment, 1-2 sentences>",
    "reasoning": "<why, in your voice, 1-2 sentences>",
    "implications": {
      "accept": { "short": "<under 12 words>", "full": "<2-3 sentences>" },
      "dismiss": { "short": "<under 12 words>", "full": "<2-3 sentences>" }
    }
  },
  "next_session_purpose": "<one sentence explaining why the next scheduled session exists in the plan>"
}

If no recommendation is warranted, set "recommendation" to null.
If no deviation callout is needed (deviation <20%), set "deviation_callout" to null.`;
}

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

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'config', message: 'Coaching service not configured.' });
    }

    // Guard: persona set
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.coaching_persona || settings.coaching_persona === 'pending') {
      return res.status(400).json({
        error: 'no_persona',
        message: 'Complete the coaching intake interview first.',
      });
    }

    // Rate limit: 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentCheckIn } = await supabase
      .from('coach_check_ins')
      .select('id')
      .eq('user_id', userId)
      .gt('created_at', twoMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (recentCheckIn) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'You recently requested a check-in. Try again in a couple minutes.',
      });
    }

    // Best-effort: find latest activity without a check-in
    let eligibleActivityId = null;
    const { data: recentActivities } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(5);

    if (recentActivities?.length) {
      for (const activity of recentActivities) {
        const { data: existing } = await supabase
          .from('coach_check_ins')
          .select('id')
          .eq('activity_id', activity.id)
          .maybeSingle();

        if (!existing) {
          eligibleActivityId = activity.id;
          break;
        }
      }
    }

    // Assemble context (works with or without an activity)
    const context = await assembleCheckInContext(supabase, userId, eligibleActivityId);
    const personaId = context.persona_id || settings.coaching_persona || 'pragmatist';

    // Override timezone with browser-supplied value if available
    const browserTimezone = req.body?.timezone;
    if (browserTimezone) {
      try {
        // Validate the timezone is a real IANA timezone
        new Date().toLocaleDateString('en-US', { timeZone: browserTimezone });
        context.user_timezone = browserTimezone;
        context.user_local_date = new Date().toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          timeZone: browserTimezone,
        });
        context.user_local_day = new Date().toLocaleDateString('en-US', {
          weekday: 'long', timeZone: browserTimezone,
        });
      } catch (e) {
        // Invalid timezone, keep DB value
      }
    }

    // Build prompt and call Claude
    const systemPrompt = buildSystemPrompt(personaId, context);
    const claude = new Anthropic({ apiKey });

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: context.has_activity
            ? 'Generate the coaching check-in for the last activity described above.'
            : 'Generate a general coaching check-in based on the rider\'s current training plan, fitness status, health data, and weekly schedule. Focus on where they are in their training block, what\'s coming up, and any adjustments you\'d recommend.',
        },
      ],
    });

    const text = response.content[0]?.text || '';

    // Parse JSON from response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          parsed = JSON.parse(braceMatch[0]);
        } else {
          throw new Error('Could not parse AI response as JSON');
        }
      }
    }

    // Save completed check-in to database
    const { data: checkIn, error: insertError } = await supabase
      .from('coach_check_ins')
      .insert({
        user_id: userId,
        activity_id: eligibleActivityId,
        persona_id: personaId,
        status: 'completed',
        narrative: parsed.narrative || '',
        deviation_callout: parsed.deviation_callout || null,
        recommendation: parsed.recommendation || null,
        next_session_purpose: parsed.next_session_purpose || null,
        context_snapshot: context,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save check-in:', insertError);
      return res.status(500).json({
        error: 'save_failed',
        message: 'Check-in was generated but failed to save.',
      });
    }

    // Return the completed check-in directly
    return res.status(200).json({
      success: true,
      checkIn,
    });
  } catch (error) {
    console.error('Coach check-in error:', error);

    if (error.status === 429) {
      return res.status(429).json({ error: 'rate_limited', message: 'Service busy. Try again in a minute.' });
    }

    return res.status(500).json({ error: 'internal_error', message: 'Something went wrong generating your check-in.' });
  }
}
