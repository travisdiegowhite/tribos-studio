// Vercel API Route: Gear Vision — catalogue a bike's parts from photos.
//
// The rider takes up to three guided shots (whole bike, drivetrain, front
// wheel), the browser uploads them straight to the private `gear-photos`
// bucket under RLS, and this endpoint receives the object PATHS — never the
// bytes (Vercel's 4.5 MB body limit, and the API should not be a file relay).
// We sign short-lived URLs server-side, send them to Claude with the catalogue
// as the extraction contract, and return a proposed parts list with
// per-part confidence and evidence. Nothing is written to gear_components
// here: vision PROPOSES, the rider DISPOSES on the confirm screen, which then
// calls api/gear.js create_component with source='vision'.
//
// POST { gearItemId, photoPaths: { whole_bike?, drivetrain?, front_wheel? } }
//  → { extraction, model, usage }

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { requireAuth } from './utils/auth.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import {
  buildExtractionSchema,
  buildExtractionPrompt,
  normalizeExtraction,
  PHOTO_BUCKET,
  SIGNED_URL_TTL_S,
} from './utils/gearVision.js';

const supabase = getSupabaseAdmin();

// Vision quality matters more than latency for a once-per-bike catalogue.
export const GEAR_VISION_MODEL = 'claude-opus-5';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  // A catalogue is a deliberate, rare action: a handful per hour is plenty.
  const limited = await rateLimitByUser(req, res, 'gear-vision', user.id, 10, 60);
  if (limited !== null) return;
  const quotaExceeded = await enforceAiQuota(req, res, user.id);
  if (quotaExceeded !== null) return;

  const { gearItemId, photoPaths } = req.body || {};
  if (!gearItemId || !photoPaths || typeof photoPaths !== 'object') {
    return res.status(400).json({ error: 'gearItemId and photoPaths required' });
  }

  // Ownership: the bike must be the caller's, and every path must sit under
  // the caller's folder in the bucket. The storage policy enforces the same
  // rule for the browser upload; this is the server-side half.
  const { data: gear, error: gearError } = await supabase
    .from('gear_items')
    .select('id, user_id, name, brand, model, category, gear_type')
    .eq('id', gearItemId)
    .eq('user_id', user.id)
    .single();
  if (gearError || !gear) return res.status(404).json({ error: 'Gear not found' });
  if (gear.gear_type !== 'bike') return res.status(400).json({ error: 'Only bikes can be catalogued from photos' });

  const shots = [];
  for (const shotId of ['whole_bike', 'drivetrain', 'front_wheel']) {
    const path = photoPaths[shotId];
    if (!path) continue;
    if (typeof path !== 'string' || !path.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: `photo path for ${shotId} is not yours` });
    }
    shots.push({ id: shotId, path });
  }
  if (shots.length === 0) {
    return res.status(400).json({ error: 'At least one photo path required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Service not configured' });

  try {
    // Short-lived signed URLs: the bucket is private and Claude fetches once.
    const signed = await Promise.all(
      shots.map(async (shot) => {
        const { data, error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(shot.path, SIGNED_URL_TTL_S);
        if (error || !data?.signedUrl) {
          throw new Error(`Could not sign ${shot.id}: ${error?.message || 'no url'}`);
        }
        return { ...shot, url: data.signedUrl };
      })
    );

    const client = new Anthropic({ apiKey });
    const content = [];
    for (const shot of signed) {
      content.push({ type: 'text', text: `Photo "${shot.id}":` });
      content.push({ type: 'image', source: { type: 'url', url: shot.url } });
    }
    content.push({ type: 'text', text: buildExtractionPrompt(gear, signed.map((s) => s.id)) });

    const response = await client.messages.create({
      model: GEAR_VISION_MODEL,
      max_tokens: 8000,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: buildExtractionSchema() },
      },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({
        error: 'Could not read these photos',
        detail: response.stop_details?.explanation || null,
      });
    }

    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('No text block in vision response');

    const extraction = normalizeExtraction(JSON.parse(text));

    // Keep the raw extraction and the photo paths on the bike so the catalogue
    // can be redone with a better model later without re-shooting.
    const photoPathsClean = Object.fromEntries(signed.map((s) => [s.id, s.path]));
    await supabase
      .from('gear_items')
      .update({
        photo_paths: photoPathsClean,
        vision_extraction: extraction,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gear.id)
      .eq('user_id', user.id);

    return res.status(200).json({
      extraction,
      model: response.model,
      usage: {
        input_tokens: response.usage?.input_tokens ?? null,
        output_tokens: response.usage?.output_tokens ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(503).json({ error: 'Vision is busy — try again in a minute' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[gear-vision] Claude API error', error.status, error.message);
      return res.status(502).json({ error: 'Vision service error' });
    }
    console.error('[gear-vision] failed', error);
    return res.status(500).json({
      error: 'Failed to catalogue bike',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
