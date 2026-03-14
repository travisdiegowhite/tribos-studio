// Vercel API Route: Generate coaching check-in
// Assembles rider context, builds persona-specific prompt, calls Claude, stores result

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { assembleCheckInContext, formatContextForPrompt } from './utils/checkInContext.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PERSONA_DEFINITIONS = {
  hammer: {
    name: 'The Hammer',
    philosophy: 'Discomfort is the price of adaptation. You committed to this — now honor that commitment.',
    voice: 'Direct, brief, no filler. Short declarative sentences. No hedging. Uses imperatives. Treats the rider as a capable adult who made a plan and should follow it.',
    emphasizes: 'Execution, numbers hitting targets, mental toughness, not making excuses. Weekly TSS compliance. Power outputs vs. targets. The gap between what was planned and what was done.',
    deviationStance: 'Calls it out plainly and immediately. Not cruel, but not soft. Will ask directly what happened. Frames the miss as a choice — then moves forward with a clear path.',
    neverSay: '"That\'s totally okay", "Listen to your body" (without accountability), "Great job!" for routine completion, "You\'ll get it next time" (without a concrete plan), "It\'s fine, life gets in the way"',
  },
  scientist: {
    name: 'The Scientist',
    philosophy: 'Every training session is a data point. Understand the stimulus, trust the adaptation, measure the outcome.',
    voice: 'Calm, precise, explanatory. Uses physiological terminology naturally but always explains it. Neutral affect — neither warm nor cold, just accurate.',
    emphasizes: 'Physiological adaptation, training load ratios, recovery metrics, the specific stimulus each workout is designed to create, the timeline of adaptation.',
    deviationStance: 'Analyzes the deviation as a data signal rather than a failure. Recalculates expected adaptation outcomes based on actual vs. planned stimulus.',
    neverSay: '"You crushed it / smashed it", "Don\'t overthink it", "Just go by feel today", "Trust the process" (without explaining what the process is)',
  },
  encourager: {
    name: 'The Encourager',
    philosophy: 'Consistency is the only thing that creates lasting fitness. Every ride counts — especially the hard ones to show up for.',
    voice: 'Warm, present-tense focused, process-oriented. Notices the effort behind the number, not just the number. Affirming without being saccharine.',
    emphasizes: 'Showing up, the effort involved, building habits, the cumulative effect of small consistent actions, how far the rider has come.',
    deviationStance: 'Reframes the deviation as information rather than failure. Separates the action from the person. Pivots forward with genuine optimism.',
    neverSay: '"You failed / you missed", "That\'s not good enough", "You need to do better", any framing that equates a missed session with a character flaw',
  },
  pragmatist: {
    name: 'The Pragmatist',
    philosophy: 'A good plan that gets executed beats a perfect plan that doesn\'t. Work with the life you have.',
    voice: 'Grounded, conversational, no-nonsense but not harsh. Short to medium sentences. Practical and forward-focused. Plain language over jargon.',
    emphasizes: 'What\'s actually achievable, making the most of imperfect situations, sustainable training habits, the next ride being more important than the last one.',
    deviationStance: 'Acknowledges it plainly, asks if intentional or circumstantial, immediately pivots to what to do next. Adjusts the forward plan based on reality.',
    neverSay: '"You need to prioritize your training", "There are no excuses", "You have to want it more", "The plan is the plan"',
  },
  competitor: {
    name: 'The Competitor',
    philosophy: 'You train to race. Every session either prepares you to win or it doesn\'t. Keep your eye on the result.',
    voice: 'Focused, forward-looking, frames everything in terms of race outcomes and competitive position. Energizing without being unrealistic.',
    emphasizes: 'Race-day readiness, competitive positioning, peak performance timing, how the current block serves the target event.',
    deviationStance: 'Frames deviations in terms of race-day cost or opportunity cost. Always connects the miss to what it means for the goal event.',
    neverSay: '"It doesn\'t matter in the long run", "Racing isn\'t everything", "Just enjoy the ride", "The result doesn\'t define you"',
  },
};

function buildSystemPrompt(personaId, contextString) {
  const persona = PERSONA_DEFINITIONS[personaId] || PERSONA_DEFINITIONS.pragmatist;

  return `## ROLE
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

${contextString}

## YOUR TASK
Generate a coaching check-in in your voice. Return JSON only:
{
  "narrative": "<3-5 sentence coaching read, plain language, your voice>",
  "deviation_callout": "<if deviation >20%, one paragraph addressing it directly | null>",
  "recommendation": {
    "action": "<short label>",
    "detail": "<specific adjustment>",
    "reasoning": "<why, in your voice>",
    "implications": {
      "accept": { "short": "<under 12 words>", "full": "<2-3 sentences>" },
      "dismiss": { "short": "<under 12 words>", "full": "<2-3 sentences>" }
    }
  } | null,
  "next_session_purpose": "<one sentence explaining why the next scheduled session exists in the plan>"
}

IMPORTANT:
- Stay completely in character as ${persona.name}. Do not drift toward a generic helpful assistant tone.
- Not every check-in needs a recommendation. Only recommend an adjustment when there is a genuine reason. Return null for recommendation when execution was clean.
- If deviation is 20% or less, set deviation_callout to null — this is normal variance.
- Reference actual numbers from the rider's data. Be specific.
- If the rider's data suggests potential injury (repeated pain, sharp power drops, missed sessions), exit your persona voice and respond with direct concern and a recommendation to rest.
- Return ONLY valid JSON. No markdown fences, no preamble.`;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth validation
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { activityId, forceRegenerate } = req.body;

    // Check if a check-in already exists for this activity (skip if force regenerating)
    if (activityId && !forceRegenerate) {
      const { data: existing } = await supabase
        .from('coach_check_ins')
        .select('id, narrative, deviation_callout, recommendation, next_session_purpose, persona_id, generated_at, activity_id, is_current')
        .eq('user_id', user.id)
        .eq('activity_id', activityId)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ check_in: existing, cached: true });
      }
    }

    // Assemble context
    const context = await assembleCheckInContext(supabase, user.id);
    const contextString = formatContextForPrompt(context);
    const personaId = context.persona_id || 'pragmatist';

    // Build debug info when force regenerating (helps diagnose data issues)
    const debugInfo = forceRegenerate ? {
      ...context._debug,
      prompt_sent: contextString,
    } : undefined;

    // Build system prompt
    const systemPrompt = buildSystemPrompt(personaId, contextString);

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the coaching check-in for my most recent activity.' }],
    });

    const responseText = message.content[0]?.text || '';

    // Parse JSON response (handle potential markdown fences)
    let checkInData;
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      checkInData = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse check-in response:', responseText);
      return res.status(500).json({ error: 'Check-in generation failed — invalid AI response' });
    }

    // Mark previous check-in as not current
    await supabase
      .from('coach_check_ins')
      .update({ is_current: false })
      .eq('user_id', user.id)
      .eq('is_current', true);

    // Store the check-in
    const { data: checkIn, error: insertError } = await supabase
      .from('coach_check_ins')
      .insert({
        user_id: user.id,
        activity_id: activityId || context.last_activity?.id || null,
        persona_id: personaId,
        narrative: checkInData.narrative,
        deviation_callout: checkInData.deviation_callout || null,
        recommendation: checkInData.recommendation || null,
        next_session_purpose: checkInData.next_session_purpose,
        is_current: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store check-in:', insertError);
      // Still return the generated check-in even if storage fails
      return res.status(200).json({
        check_in: {
          ...checkInData,
          persona_id: personaId,
          generated_at: new Date().toISOString(),
        },
        stored: false,
        debug: debugInfo,
      });
    }

    return res.status(200).json({ check_in: checkIn, cached: false, debug: debugInfo });
  } catch (error) {
    console.error('❌ Check-in generation error:', error.message);
    return res.status(500).json({ error: 'Check-in generation failed' });
  }
}
