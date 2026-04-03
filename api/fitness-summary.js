// Vercel API Route: Fitness Language Layer — AI Summary Generation
// Generates plain-language fitness summaries using Claude Haiku
// Cached in fitness_summaries table with 4-hour TTL

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { assembleFitnessContext, buildCacheKey } from './utils/assembleFitnessContext.js';

const supabase = getSupabaseAdmin();

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a friendly fitness assistant for Tribos, a cycling coaching app.
Your job is to write 1–2 casual sentences explaining what an athlete's training data means for them TODAY.

VOICE:
- Friendly, direct, knowledgeable. Like a training partner who knows the numbers. Not a data report. Not a doctor.
- Never list metrics by name (CTL, ATL, TSB). Translate them.
- No asterisks, markdown, or formatting. Plain text only.
- Keep it under 40 words.

WEIGHTING RULES:
- The 28-day CTL trend (ctl_direction) is the primary fitness signal. A single noisy week does not change the story if the trend is solid.
- ATL/CTL ratio matters more than raw ATL numbers.
- TSB is context-dependent — weight it against the athlete's tsb_range_28d to know if today's value is unusual or normal for them.

SPIKE GUARD — CRITICAL:
- If missed_rides_flag is true: the week is not over and the athlete is behind on planned rides. An apparent drop in fatigue (ATL) is NOT recovery — it is simply fewer rides so far this week. Do NOT describe this as "legs are recovering" or similar. Instead, acknowledge the week isn't done.

COACH CONTINUITY:
- If coach_context.summary mentions an upcoming key workout, reference it briefly if it's relevant to today's state.
- Never contradict what the coach has recommended.
- If the coach conversation is unrelated to fitness state, ignore it.

TRAINING PLAN & WEEK SCHEDULE:
- If plan data is present, briefly reference the training block (e.g. "Build phase") when it adds useful context.
- week_schedule shows each planned workout this week with status: [DONE], [PARTIAL], or [PLANNED].
- Use ONLY the workout names from week_schedule. NEVER invent, guess, or paraphrase workout names.
- When counting remaining workouts, count only [PLANNED] entries in the schedule.
- When referencing an upcoming workout, use its actual name and day from the schedule.
- If no plan or week_schedule is present, do not reference specific workouts.

RACE GOAL:
- If race_goal is present, you may briefly reference it when the athlete's form or training block relates to race preparation.

HEALTH:
- If health data is present and noteworthy (e.g., elevated resting HR, low sleep, low energy), briefly factor it into your assessment.

EXPERIENCE LEVEL ADAPTATION:
- beginner: avoid all jargon, use very plain language, be encouraging
- intermediate: light jargon ok, focus on what to do next
- advanced/racer: can be direct and data-confident, skip the basics`;

function buildUserMessage(context, surface) {
  let instruction = 'Here is my current training data. Write my fitness summary.';
  if (surface === 'post_ride') {
    instruction = 'Here is my training data after my latest ride. Write a brief post-ride summary of how this ride fits into my week.';
  } else if (surface === 'coach') {
    instruction = 'Here is my current training data. Write a single-line fitness context for the top of my coach chat.';
  }

  return `${instruction}\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    const userId = authUser.id;
    const { surface = 'today', clientMetrics, rideId, forceRefresh } = req.body || {};

    if (!clientMetrics || typeof clientMetrics.ctl !== 'number') {
      return res.status(400).json({ error: 'clientMetrics with ctl, atl, tsb required' });
    }

    // 1. Assemble context
    const context = await assembleFitnessContext(userId, supabase, clientMetrics, { rideId });
    const cacheKey = buildCacheKey(context);

    // 2. Check cache (4-hour TTL)
    if (!forceRefresh) {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('fitness_summaries')
        .select('summary, generated_at')
        .eq('user_id', userId)
        .eq('surface', surface)
        .eq('cache_key', cacheKey)
        .gte('generated_at', fourHoursAgo)
        .single();

      if (cached) {
        return res.status(200).json({
          summary: cached.summary,
          cached: true,
          generated_at: cached.generated_at,
        });
      }
    }

    // 3. Call Claude Haiku
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildUserMessage(context, surface),
      }],
    });

    const summary = response.content[0].text.trim();

    // 4. Cache the result
    await supabase.from('fitness_summaries').upsert({
      user_id: userId,
      surface,
      cache_key: cacheKey,
      summary,
      context_snapshot: context,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id, surface' });

    return res.status(200).json({
      summary,
      cached: false,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fitness summary error:', error);
    return res.status(500).json({ error: 'Failed to generate fitness summary' });
  }
}
