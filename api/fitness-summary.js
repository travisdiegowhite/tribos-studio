// Vercel API Route: Fitness Language Layer — AI Summary Generation
// Generates plain-language fitness summaries using Claude Haiku
// Cached in fitness_summaries table with 4-hour TTL

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { assembleFitnessContext, buildCacheKey } from './utils/assembleFitnessContext.js';
import { PERSONA_DATA } from './utils/personaData.js';

const supabase = getSupabaseAdmin();

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VALID_SURFACES = new Set(['today', 'post_ride', 'coach']);

const BASE_SYSTEM_PROMPT = `You are a friendly fitness assistant for Tribos, a cycling coaching app.
Your job is to write 1–2 casual sentences explaining what an athlete's training data means for them TODAY.

VOICE:
- Friendly, direct, knowledgeable. Like a training partner who knows the numbers. Not a data report. Not a doctor.
- Never list metrics by name — translate them. NEVER emit the old TrainingPeaks abbreviations (TSS, CTL, ATL, TSB, NP, IF). The Tribos system uses RSS (ride stress), TFI (training fitness), AFI (acute fatigue), FS (form score), EP (effective power), RI (ride intensity).
- No asterisks, markdown, or formatting. Plain text only.
- Keep it under 40 words.

WEIGHTING RULES:
- The 28-day fitness trend (ctl_direction in the payload corresponds to the TFI trend) is the primary fitness signal. A single noisy week does not change the story if the trend is solid.
- The fatigue-to-fitness ratio (AFI/TFI) matters more than raw AFI numbers.
- Form Score (FS) is context-dependent — weight it against the athlete's tsb_range_28d (FS range over the last 28 days) to know if today's value is unusual or normal for them.

TREND CONSISTENCY — CRITICAL:
- trends.ctl_direction and trends.ctl_delta_pct are authoritative. They match the Trend card the athlete sees on the dashboard. NEVER contradict them.
- Values of ctl_direction: 'building' (ctl_delta_pct > 8%), 'maintaining' (> 2%), 'holding' (−2% to 2%), 'recovering' (< −2%).
- If ctl_delta_pct is positive, do NOT write "fitness is declining" or similar. If ctl_delta_pct is negative, do not claim fitness is "building".
- When referencing the trend, align your language with ctl_direction. e.g. if building, say something like "fitness is trending up" — never the opposite.

SPIKE GUARD — CRITICAL:
- If missed_rides_flag is true: the week is not over and the athlete is behind on planned rides. An apparent drop in fatigue (AFI) is NOT recovery — it is simply fewer rides so far this week. Do NOT describe this as "legs are recovering" or similar. Instead, acknowledge the week isn't done.

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

// Today's Brief — longer, persona-voiced paragraph that anchors the Today view.
const TODAY_BRIEF_OVERRIDES = `

TODAY'S BRIEF — surface-specific overrides:
- Write 3–4 sentences (60–90 words). The 1–2 sentence rule does NOT apply to this surface.
- Open with the athlete's first name when present in the context payload (do not invent one).
- Reference: today's planned workout name (when present), today's form / fatigue snapshot, and the next purposeful action this week.
- Speak in the persona voice provided below. Match the persona's pacing, register, and signature framing.
- Do not lecture on general principles. Anchor every sentence to today's data, today's plan, or the rider's next session.`;

function buildPersonaBlock(personaId) {
  const persona = PERSONA_DATA[personaId];
  if (!persona) return '';
  const styleRules = Array.isArray(persona.styleRules)
    ? persona.styleRules.map((r) => `  - ${r}`).join('\n')
    : '';
  return `

PERSONA VOICE — ${persona.name}:
- Philosophy: ${persona.philosophy}
- Voice: ${persona.voice}
- Emphasizes: ${persona.emphasizes}
- Never say: ${persona.neverSay}
${styleRules ? `- Style rules:\n${styleRules}` : ''}`;
}

function buildUserMessage(context, surface) {
  let instruction = 'Here is my current training data. Write my fitness summary.';
  if (surface === 'post_ride') {
    instruction = 'Here is my training data after my latest ride. Write a brief post-ride summary of how this ride fits into my week.';
  } else if (surface === 'coach') {
    instruction = 'Here is my current training data. Write a single-line fitness context for the top of my coach chat.';
  } else if (surface === 'today') {
    instruction = "Here is my training state for today. Write the 3–4 sentence Today's Brief paragraph.";
  }

  return `${instruction}\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
}

const VALID_PERSONA_IDS = new Set(Object.keys(PERSONA_DATA));

/**
 * Resolve the active persona id for a user. Reads
 * user_profiles.coach_persona_id (canonical home post-migration 086) first,
 * falls back to user_coach_settings.coaching_persona for users predating
 * the backfill, and finally to 'pragmatist'.
 */
async function resolvePersona(userId) {
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('coach_persona_id')
    .eq('id', userId)
    .maybeSingle();
  const fromProfile = profileRow?.coach_persona_id;
  if (fromProfile && VALID_PERSONA_IDS.has(fromProfile)) return fromProfile;

  const { data: settingsRow } = await supabase
    .from('user_coach_settings')
    .select('coaching_persona')
    .eq('user_id', userId)
    .maybeSingle();
  const fromSettings = settingsRow?.coaching_persona;
  if (fromSettings && fromSettings !== 'pending' && VALID_PERSONA_IDS.has(fromSettings)) {
    return fromSettings;
  }

  return 'pragmatist';
}

/**
 * Generate (or fetch from cache) the Today's Brief paragraph for a user.
 *
 * Used by the HTTP handler and by the per-user-timezone cron pre-warmer
 * at 04:15 local (api/today-coach-prewarm.js). Bypasses HTTP auth — the
 * caller is responsible for authorizing the userId.
 *
 * @param {string} userId
 * @param {{ tfi:number, afi:number, formScore:number, lastRideRss?:number, ctlDeltaPct?:number|null }} clientMetrics
 * @param {{ timezone?:string, forceRefresh?:boolean }} [opts]
 */
export async function generateTodaySummary(userId, clientMetrics, _todayContext, opts = {}) {
  const { timezone, forceRefresh = false } = opts;
  const surface = 'today';

  let resolvedTimezone = timezone;
  if (!resolvedTimezone) {
    const { data: profileTz } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', userId)
      .single();
    resolvedTimezone = profileTz?.timezone || 'America/New_York';
  }

  const contextMetrics = {
    ctl: clientMetrics.tfi,
    atl: clientMetrics.afi,
    tsb: clientMetrics.formScore,
    lastRideTss: clientMetrics.lastRideRss,
    ctlDeltaPct: typeof clientMetrics.ctlDeltaPct === 'number' && Number.isFinite(clientMetrics.ctlDeltaPct)
      ? clientMetrics.ctlDeltaPct
      : null,
  };

  const context = await assembleFitnessContext(userId, supabase, contextMetrics, {}, resolvedTimezone);
  const personaId = await resolvePersona(userId);
  const cacheKey = buildCacheKey(context, { personaId });

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
      return { summary: cached.summary, cached: true, generated_at: cached.generated_at };
    }
  }

  const systemPrompt = `${BASE_SYSTEM_PROMPT}${TODAY_BRIEF_OVERRIDES}${buildPersonaBlock(personaId)}`;
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildUserMessage(context, surface) }],
  });

  const summary = response.content[0].text.trim();
  const generated_at = new Date().toISOString();

  await supabase.from('fitness_summaries').upsert({
    user_id: userId,
    surface,
    cache_key: cacheKey,
    summary,
    context_snapshot: context,
    generated_at,
  }, { onConflict: 'user_id, surface' });

  return { summary, cached: false, generated_at };
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
    const {
      surface = 'today',
      clientMetrics,
      rideId,
      forceRefresh,
      timezone: browserTimezone,
    } = req.body || {};

    if (!VALID_SURFACES.has(surface)) {
      return res.status(400).json({ error: `Invalid surface: ${surface}` });
    }

    if (!clientMetrics || typeof clientMetrics.tfi !== 'number') {
      return res.status(400).json({ error: 'clientMetrics with tfi, afi, formScore required' });
    }

    // Today surface delegates to the shared generator (also used by the
    // 04:15-local cron pre-warmer in api/today-coach-prewarm.js).
    if (surface === 'today') {
      const result = await generateTodaySummary(userId, clientMetrics, null, {
        timezone: browserTimezone,
        forceRefresh,
      });
      return res.status(200).json(result);
    }

    // ── post_ride / coach surfaces (1–2 sentence variants) ──
    let resolvedTimezone = browserTimezone;
    if (!resolvedTimezone) {
      const { data: profileTz } = await supabase
        .from('user_profiles')
        .select('timezone')
        .eq('id', userId)
        .single();
      resolvedTimezone = profileTz?.timezone || 'America/New_York';
    }

    const contextMetrics = {
      ctl: clientMetrics.tfi,
      atl: clientMetrics.afi,
      tsb: clientMetrics.formScore,
      lastRideTss: clientMetrics.lastRideRss,
      ctlDeltaPct: typeof clientMetrics.ctlDeltaPct === 'number' && Number.isFinite(clientMetrics.ctlDeltaPct)
        ? clientMetrics.ctlDeltaPct
        : null,
    };

    const context = await assembleFitnessContext(userId, supabase, contextMetrics, { rideId }, resolvedTimezone);
    const cacheKey = buildCacheKey(context);

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

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: BASE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildUserMessage(context, surface),
      }],
    });

    const summary = response.content[0].text.trim();
    const generated_at = new Date().toISOString();

    await supabase.from('fitness_summaries').upsert({
      user_id: userId,
      surface,
      cache_key: cacheKey,
      summary,
      context_snapshot: context,
      generated_at,
    }, { onConflict: 'user_id, surface' });

    return res.status(200).json({ summary, cached: false, generated_at });
  } catch (error) {
    console.error('Fitness summary error:', error);
    return res.status(500).json({ error: 'Failed to generate fitness summary' });
  }
}
