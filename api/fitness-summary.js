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

const TODAY_VOICE_RULES = `VOICE:
- You are the athlete's coach. The persona block below sets your tone.
- 3–4 sentences. Conversational. Not a data report.
- Use Tribos terminology only: RSS (ride stress), TFI (training fitness), AFI (acute fatigue), FS (form score), EP (effective power), RI (ride intensity). NEVER emit TSS, CTL, ATL, TSB, NP, or IF in any user-facing text.
- No asterisks, markdown, or formatting. Plain text only.
- Reference today's planned workout by its actual name.
- If a phase + week-in-phase is provided, you may anchor to it ("week 2 of 3 in build").
- If a next A-race is provided AND it is within 60 days, ground the message around it. Otherwise don't invent a race.
- If a deterministic freshness word is provided (e.g. "ready", "loaded"), align your prose with it — don't contradict the word.
- Never use motivational filler, never apologize, never hedge.

WEIGHTING RULES:
- The 28-day fitness trend (ctl_direction) is the primary fitness signal. A single noisy week does not change the story if the trend is solid.
- The fatigue-to-fitness ratio (AFI/TFI) matters more than raw AFI numbers.

TREND CONSISTENCY — CRITICAL:
- trends.ctl_direction and trends.ctl_delta_pct are authoritative. They match the Trend card the athlete sees on the dashboard. NEVER contradict them.
- Values of ctl_direction: 'building' (>8%), 'maintaining' (>2%), 'holding' (-2% to 2%), 'recovering' (<-2%).

SPIKE GUARD — CRITICAL:
- If missed_rides_flag is true, an apparent drop in fatigue is NOT recovery — it is fewer rides so far this week. Acknowledge the week isn't done.

EXPERIENCE LEVEL ADAPTATION:
- beginner: avoid jargon, use very plain language
- intermediate: light jargon ok
- advanced/racer: be direct and data-confident`;

const SYSTEM_PROMPT = `You are a friendly fitness assistant for Tribos, a cycling coaching app.
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

function buildUserMessage(context, surface, todayExtras) {
  let instruction = 'Here is my current training data. Write my fitness summary.';
  if (surface === 'post_ride') {
    instruction = 'Here is my training data after my latest ride. Write a brief post-ride summary of how this ride fits into my week.';
  } else if (surface === 'coach') {
    instruction = 'Here is my current training data. Write a single-line fitness context for the top of my coach chat.';
  } else if (surface === 'today') {
    instruction = 'Here is my training state for today. Write the 3–4 sentence Today paragraph.';
  }

  const payload = surface === 'today' && todayExtras
    ? { ...context, today: todayExtras }
    : context;

  return `${instruction}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

/**
 * Build the system prompt for the `today` surface.
 *
 * Incorporates the user's persona (voice + styleRules) on top of the
 * shared Tribos voice rules. The 3–4 sentence ceiling overrides any
 * shorter "max 3 sentences" rule from the persona.
 */
function buildTodaySystemPrompt(persona) {
  const personaDef = PERSONA_DATA[persona] || PERSONA_DATA.pragmatist;
  const styleRules = (personaDef.styleRules || []).map((r, i) => `${i + 1}. ${r}`).join('\n');

  return `You are ${personaDef.name}, the athlete's cycling coach inside Tribos.

PERSONA VOICE:
${personaDef.voice}

PERSONA EMPHASIZES:
${personaDef.emphasizes}

NEVER SAY:
${personaDef.neverSay}

PERSONA STYLE RULES (apply unless they conflict with the length ceiling below — the 3–4 sentence ceiling wins):
${styleRules}

${TODAY_VOICE_RULES}`;
}

/**
 * Resolve the active persona id for a user, with fallback chain:
 *   user_profiles.coach_persona_id → user_coach_settings.coaching_persona → 'pragmatist'
 */
async function resolvePersona(userId) {
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('coach_persona_id')
    .eq('id', userId)
    .single();
  if (profileRow?.coach_persona_id) return profileRow.coach_persona_id;

  const { data: settingsRow } = await supabase
    .from('user_coach_settings')
    .select('coaching_persona')
    .eq('user_id', userId)
    .maybeSingle();
  const candidate = settingsRow?.coaching_persona;
  return candidate && candidate !== 'pending' ? candidate : 'pragmatist';
}

/**
 * Generate (or fetch from cache) the Today coach paragraph for a user.
 *
 * Used by the HTTP handler and by the per-user-timezone cron pre-warmer
 * at 04:15 local. Bypasses HTTP auth — caller is responsible for
 * authorizing the userId.
 *
 * @param {string} userId
 * @param {{ tfi:number, afi:number, formScore:number, lastRideRss?:number, ctlDeltaPct?:number|null }} clientMetrics
 * @param {object} todayContext  Today-surface extras (workoutId, freshnessWord, phase, weekInPhase, weeksInPhase, weeksRemaining, raceName, daysToRace, …)
 * @param {{ timezone?:string, forceRefresh?:boolean }} [opts]
 */
export async function generateTodaySummary(userId, clientMetrics, todayContext, opts = {}) {
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

  // Cache key intentionally captures only dimensions that can change
  // within a single day. Phase / weekInPhase / daysToRace shift on weekly
  // cadence so they're passed to the prompt but not the cache key — this
  // lets the 04:15 cron pre-warm and a later user-load hit the same row.
  const cacheKey = [
    buildCacheKey(context),
    `p:${personaId}`,
    `w:${todayContext?.workoutId || 'none'}`,
    `f:${todayContext?.freshnessWord || 'none'}`,
  ].join('|');

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

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 280,
    system: buildTodaySystemPrompt(personaId),
    messages: [{
      role: 'user',
      content: buildUserMessage(context, surface, todayContext),
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
      // Today-surface extras (computed client-side; passed through verbatim to the prompt)
      todayContext,
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
      const result = await generateTodaySummary(userId, clientMetrics, todayContext, {
        timezone: browserTimezone,
        forceRefresh,
      });
      return res.status(200).json(result);
    }

    // ── post_ride / coach surfaces (1–2 sentence variants) ──
    // Resolve timezone: prefer browser-supplied, then DB, then fallback.
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
      system: SYSTEM_PROMPT,
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
