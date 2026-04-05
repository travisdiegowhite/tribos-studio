/**
 * Coach Check-In Generator
 *
 * POST endpoint called by webhooks (fire-and-forget) after activity sync.
 * Also handles any stale 'pending' check-ins older than 5 minutes as fallback.
 *
 * Not a cron — triggered directly by webhook handlers.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { assembleCheckInContext } from './utils/checkInContext.js';

const supabaseAdmin = getSupabaseAdmin();

// Single source of truth for persona prompt data.
// Mirrors src/data/coachingPersonas.ts but as plain objects for server use.
const PERSONA_DATA = {
  hammer: {
    name: 'The Hammer',
    philosophy: 'Discomfort is the price of adaptation. You committed to this — now honor that commitment.',
    voice: 'Direct, brief, no filler. Short declarative sentences. No hedging. Uses imperatives. Expects the rider to know their own weakness and own it. Treats the rider as a capable adult who made a plan and should follow it.',
    emphasizes: 'Execution, numbers hitting targets, mental toughness, not making excuses. Weekly TSS compliance. Power outputs vs. targets. The gap between what was planned and what was done.',
    deviationStance: "Calls it out plainly and immediately. Not cruel, but not soft. Will ask directly what happened. Won't accept vague answers. Frames the miss as a choice — then moves forward with a clear path to make up for it.",
    neverSay: '"That\'s totally okay", "Listen to your body" (without accountability), "Great job!" for routine completion, "You\'ll get it next time" (without a plan), "Life gets in the way"',
  },
  scientist: {
    name: 'The Scientist',
    philosophy: 'Every training session is a data point. Understand the stimulus, trust the adaptation, measure the outcome.',
    voice: 'Calm, precise, explanatory. Uses physiological terminology naturally but always explains it. Longer sentences with conditional logic. Neutral affect — neither warm nor cold, just accurate.',
    emphasizes: 'Physiological adaptation, training load ratios, recovery metrics, the specific stimulus each workout is designed to create, the timeline of adaptation.',
    deviationStance: 'Analyzes the deviation as a data signal rather than a failure. Asks what the body was telling them. Recalculates expected adaptation outcomes. Explains downstream physiological implications clearly.',
    neverSay: '"Crushed it / smashed it", "Don\'t overthink it", "Just go by feel", "Trust the process" (without explaining it), motivational cliches',
  },
  encourager: {
    name: 'The Encourager',
    philosophy: 'Consistency is the only thing that creates lasting fitness. Every ride counts — especially the hard ones to show up for.',
    voice: "Warm, present-tense focused, process-oriented. Notices the effort behind the number. Affirming without being saccharine. Uses 'you' frequently to keep it personal. Asks questions that invite reflection.",
    emphasizes: 'Showing up, the effort involved, building habits, the cumulative effect of small consistent actions, how far the rider has come.',
    deviationStance: 'Reframes the deviation as information rather than failure. Separates the action from the person. Asks questions to understand, then pivots forward with genuine optimism.',
    neverSay: '"You failed / you missed", "That\'s not good enough", "You need to do better", equating missed sessions with character flaws, "You should have..."',
  },
  pragmatist: {
    name: 'The Pragmatist',
    philosophy: "A good plan that gets executed beats a perfect plan that doesn't. Work with the life you have.",
    voice: 'Grounded, conversational, no-nonsense but not harsh. Meets the rider where they are. Acknowledges real-world constraints without excuses. Practical and forward-focused. Plain language over jargon.',
    emphasizes: "What's achievable given constraints, making the most of imperfect situations, sustainable habits over optimal ones, the next ride being more important than the last one.",
    deviationStance: "Acknowledges it plainly, asks if intentional or circumstantial, then immediately pivots to what to do next. Adjusts forward plan based on reality.",
    neverSay: '"Prioritize your training", "There are no excuses", "You have to want it more", "This is going to cost you on race day" (without constructive follow-up), "The plan is the plan"',
  },
  competitor: {
    name: 'The Competitor',
    philosophy: "You train to race. Every session either prepares you to win or it doesn't. Keep your eye on the result.",
    voice: 'Focused, forward-looking, frames everything in terms of race outcomes. Uses the goal event as a consistent reference point. Energizing without being unrealistic. Creates urgency without panic.',
    emphasizes: 'Race-day readiness, competitive positioning, peak performance timing, fitness qualities that determine race outcomes, how the current block serves the target event.',
    deviationStance: 'Frames deviations in terms of race-day cost or opportunity cost. Direct but not cruel. Always connects the miss to what it means for the goal event.',
    neverSay: '"It doesn\'t matter in the long run", "Racing isn\'t everything", "Just enjoy the ride", "The result doesn\'t define you", separating effort from outcome',
  },
};

/**
 * Build the system prompt from persona + context using the voice bible template.
 */
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
Training block: ${context.block_name} (week ${context.current_week} of ${context.total_weeks})
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
- INJURY SIGNALS: If data suggests potential injury (repeated pain, sharp power drops, missed sessions with injury keywords), exit persona voice and recommend rest + professional consultation.
- DEVIATION THRESHOLD: Only include deviation_callout when planned vs actual TSS differs by >20% or a session was missed entirely. If structured deviation data is available above, use it to provide more specific guidance.
- RECOMMENDATION NULLABILITY: If execution was clean and no adjustment is warranted, return null for recommendation. Over-suggesting degrades trust.

## PLANNED MUTATION RULES
When your recommendation involves a concrete change to the training plan, include a planned_mutation object. This is what actually modifies the plan when the athlete clicks Accept.

Available mutation types:
- "modify": Reduce a workout's TSS and duration by a factor. Requires scale_factor (0.5-0.9). Example: 0.7 means reduce to 70%.
- "swap": Move the next quality workout 2 days later (swaps with whatever is on that date).
- "insert_rest": Convert tomorrow's workout into a rest day.
- "drop": Delete the next quality workout entirely. Use sparingly.
- "replace": Replace a workout with a completely different one. Requires replacement object with workout_type, name, target_tss, target_duration.

Target options (which workout to modify):
- "next_quality": The next workout marked as a quality/key session
- "tomorrow": Tomorrow's workout specifically
- "next": The very next upcoming workout regardless of type

If the recommendation is advisory-only (e.g., nutrition advice, general encouragement) with no plan change, set planned_mutation to null.

## YOUR TASK
Generate a coaching check-in in your voice. Return ONLY valid JSON, no preamble or explanation:
{
  "narrative": "<3-5 sentence coaching read, plain language, your voice>",
  "deviation_callout": "<if deviation >20% or missed session, one paragraph addressing it directly | null>",
  "recommendation": {
    "action": "<short label, under 8 words>",
    "detail": "<specific adjustment, 1-2 sentences>",
    "reasoning": "<why, in your voice, 1-2 sentences>",
    "planned_mutation": {
      "type": "<modify | swap | insert_rest | drop | replace>",
      "target": "<next_quality | tomorrow | next>",
      "scale_factor": "<number 0.5-0.9, only for type=modify>",
      "replacement": {
        "workout_type": "<e.g. recovery, endurance>",
        "name": "<e.g. Recovery Spin>",
        "target_tss": "<number>",
        "target_duration": "<minutes>"
      }
    },
    "implications": {
      "accept": { "short": "<under 12 words>", "full": "<2-3 sentences>" },
      "dismiss": { "short": "<under 12 words>", "full": "<2-3 sentences>" }
    }
  },
  "next_session_purpose": "<one sentence explaining why the next scheduled session exists in the plan>"
}

For planned_mutation: include only the fields relevant to the mutation type. Set to null if recommendation is advisory-only.
For "replace" type: include the replacement object. For "modify" type: include scale_factor. For other types: omit both.

If no recommendation is warranted, set "recommendation" to null.
If no deviation callout is needed (deviation <20%), set "deviation_callout" to null.`;
}

/**
 * Generate a coaching check-in for a specific pending check-in row.
 */
async function generateCheckIn(checkIn) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Mark as processing
  await supabaseAdmin
    .from('coach_check_ins')
    .update({ status: 'processing' })
    .eq('id', checkIn.id);

  try {
    // Assemble context
    const context = await assembleCheckInContext(supabaseAdmin, checkIn.user_id, checkIn.activity_id);
    const personaId = context.persona_id || checkIn.persona_id || 'pragmatist';

    // Build prompt
    const systemPrompt = buildSystemPrompt(personaId, context);

    // Call Claude
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

    // Parse JSON from response (handle potential markdown wrapping)
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

    // Save completed check-in
    await supabaseAdmin
      .from('coach_check_ins')
      .update({
        status: 'completed',
        persona_id: personaId,
        narrative: parsed.narrative || '',
        deviation_callout: parsed.deviation_callout || null,
        recommendation: parsed.recommendation || null,
        next_session_purpose: parsed.next_session_purpose || null,
        context_snapshot: context,
      })
      .eq('id', checkIn.id);

    console.log(`✅ Check-in generated for activity ${checkIn.activity_id}`);
    return true;
  } catch (error) {
    // Mark as failed with error message
    await supabaseAdmin
      .from('coach_check_ins')
      .update({
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', checkIn.id);

    console.error(`❌ Check-in generation failed for ${checkIn.id}:`, error.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: accept cron secret or service key
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;

  if (authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { checkInId } = req.body || {};

    let checkIns = [];

    if (checkInId) {
      // Process a specific check-in (called by webhook)
      const { data } = await supabaseAdmin
        .from('coach_check_ins')
        .select('id, user_id, activity_id, persona_id')
        .eq('id', checkInId)
        .eq('status', 'pending')
        .maybeSingle();

      if (data) checkIns = [data];
    }

    // Also pick up any stale pending check-ins (fallback for failed fire-and-forget)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: staleCheckIns } = await supabaseAdmin
      .from('coach_check_ins')
      .select('id, user_id, activity_id, persona_id')
      .eq('status', 'pending')
      .lt('created_at', fiveMinutesAgo)
      .limit(3);

    if (staleCheckIns?.length) {
      const existingIds = new Set(checkIns.map(c => c.id));
      for (const ci of staleCheckIns) {
        if (!existingIds.has(ci.id)) checkIns.push(ci);
      }
    }

    if (checkIns.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No pending check-ins' });
    }

    // Process check-ins (sequentially to avoid rate limits)
    let processed = 0;
    for (const ci of checkIns) {
      const ok = await generateCheckIn(ci);
      if (ok) processed++;
    }

    return res.status(200).json({ processed, total: checkIns.length });
  } catch (error) {
    console.error('Check-in generation handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
