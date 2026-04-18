// Vercel API Route: Today Hero Paragraph
// Returns the archetype-voiced hero paragraph for the rider's dashboard.
//
// Pipeline: auth → assemble deterministic HeroContext → cache check →
// Haiku voice call → field validation → pure assembler → upsert cache.
//
// Webhooks enqueue a pending row via enqueueHeroRegen; this endpoint also
// exposes a server-to-server path that the precompute cron reuses via
// generateHeroParagraph().

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { assembleHeroContext, buildHeroCacheKey } from './utils/hero/heroContext.js';
import { generateHeroVoice } from './utils/hero/heroVoice.js';
import { assembleHeroParagraph } from './utils/hero/heroAssembler.js';

const supabase = getSupabaseAdmin();

/**
 * Shared generation path used by both the HTTP endpoint and the cron worker.
 * @param {string} userId
 * @param {string} timezone
 * @returns {Promise<{ paragraph, context, voice, cacheKey, archetype, coldStart, context_snapshot }>}
 */
export async function generateHeroParagraph(userId, timezone) {
  const context = await assembleHeroContext(userId, supabase, timezone);
  const cacheKey = buildHeroCacheKey(context);
  const voice = await generateHeroVoice(context);
  const assembled = assembleHeroParagraph(context, voice);
  return {
    paragraph: assembled,
    context,
    voice,
    cacheKey,
    archetype: context.archetype,
    coldStart: assembled.coldStart,
  };
}

/**
 * Upsert a completed hero row for the rider + day.
 */
export async function persistHeroParagraph({ userId, context, voice, assembled, cacheKey }) {
  const { error } = await supabase
    .from('today_hero_paragraphs')
    .upsert({
      user_id: userId,
      date: context.date,
      last_ride_id: context.lastRide?.id || null,
      archetype: context.archetype,
      cache_key: cacheKey,
      paragraph: assembled,
      context_snapshot: context,
      voice_response: voice,
      status: 'completed',
      error_message: null,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

  if (error) {
    console.error('[today-hero] persist failed:', error.message);
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
    const { timezone: browserTimezone, forceRefresh } = req.body || {};

    // Timezone resolution mirrors api/fitness-summary.js — browser-supplied,
    // then profile, then safe fallback.
    let tz = browserTimezone;
    if (!tz) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();
      tz = profile?.timezone || 'America/New_York';
    }

    // Assemble the deterministic context first so we can compute the cache
    // key before deciding whether to call Haiku.
    const context = await assembleHeroContext(userId, supabase, tz);
    const cacheKey = buildHeroCacheKey(context);

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('today_hero_paragraphs')
        .select('paragraph, archetype, generated_at, status, cache_key')
        .eq('user_id', userId)
        .eq('date', context.date)
        .maybeSingle();

      if (cached && cached.status === 'completed' && cached.cache_key === cacheKey && cached.paragraph) {
        return res.status(200).json({
          paragraph: cached.paragraph,
          archetype: cached.archetype,
          cached: true,
          generated_at: cached.generated_at,
        });
      }
    }

    const voice = await generateHeroVoice(context);
    const assembled = assembleHeroParagraph(context, voice);

    await persistHeroParagraph({ userId, context, voice, assembled, cacheKey });

    return res.status(200).json({
      paragraph: assembled,
      archetype: context.archetype,
      cached: false,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[today-hero] error:', error);
    return res.status(500).json({ error: 'Failed to generate today hero paragraph' });
  }
}
