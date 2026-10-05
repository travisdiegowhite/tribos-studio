// Vercel API Route: Shop Identify — draft an inventory item from a photo
// and/or a spoken or typed description.
//
// The browser uploads the photo straight to the private `shop-photos` bucket
// (under the caller's folder, enforced by the storage policy) and sends the
// object PATH, never the bytes. We sign a short-lived URL server-side and give
// Claude the user's own category and location paths as enums, so whatever
// comes back maps onto rows that exist. Nothing is written here: the identify
// result PROPOSES fields, and the owner confirms them in the item editor.
//
// POST { transcript?: string, photoPath?: string }
//  → { draft, model }
//
// Owner-only, like the shop UI (SHOP_OWNER_EMAILS), plus the usual burst
// limit and daily AI quota.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { requireAuth } from './utils/auth.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import {
  buildIdentifyPrompt,
  buildIdentifySchema,
  normalizeIdentification,
  shopOwnerEmails,
  treePaths,
  MAX_TRANSCRIPT_CHARS,
  SHOP_PHOTO_BUCKET,
  SIGNED_URL_TTL_S,
} from './utils/shop/identify.js';

const supabase = getSupabaseAdmin();

export const SHOP_IDENTIFY_MODEL = 'claude-opus-5-5';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;
  if (!user.email || !shopOwnerEmails().includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Not available on this account' });
  }

  // Batch entry at the bench can be quick-fire; 40 an hour is generous.
  const limited = await rateLimitByUser(req, res, 'shop-identify', user.id, 40, 60);
  if (limited !== null) return;
  const quotaExceeded = await enforceAiQuota(req, res, user.id);
  if (quotaExceeded !== null) return;

  const body = req.body || {};
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : '';
  const photoPath = typeof body.photoPath === 'string' ? body.photoPath : '';
  if (!transcript && !photoPath) {
    return res.status(400).json({ error: 'Send a description, a photo, or both' });
  }
  // Server-side half of the bucket's owner-folder rule.
  if (photoPath && (!photoPath.startsWith(`${user.id}/`) || photoPath.includes('..'))) {
    return res.status(403).json({ error: 'That photo is not yours' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Service not configured' });

  try {
    // user_id scoping is the security boundary for the service-role client.
    const [cats, locs] = await Promise.all([
      supabase.from('shop_categories').select('id, name, parent_id').eq('user_id', user.id),
      supabase.from('shop_locations').select('id, name, parent_id').eq('user_id', user.id),
    ]);
    if (cats.error) throw new Error(`categories: ${cats.error.message}`);
    if (locs.error) throw new Error(`locations: ${locs.error.message}`);
    const categories = cats.data || [];
    const locations = locs.data || [];

    const content = [];
    if (photoPath) {
      const { data, error } = await supabase.storage.from(SHOP_PHOTO_BUCKET).createSignedUrl(photoPath, SIGNED_URL_TTL_S);
      if (error || !data?.signedUrl) {
        return res.status(404).json({ error: 'Photo not found — try taking it again' });
      }
      content.push({ type: 'image', source: { type: 'url', url: data.signedUrl } });
    }
    content.push({ type: 'text', text: buildIdentifyPrompt({ transcript, hasPhoto: !!photoPath }) });

    const schema = buildIdentifySchema(
      treePaths(categories).map((p) => p.path),
      treePaths(locations).map((p) => p.path),
    );

    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: SHOP_IDENTIFY_MODEL,
      max_tokens: 4000,
      // A single extraction: low effort for text, a notch more to read
      // part numbers off packaging.
      output_config: {
        effort: photoPath ? 'medium' : 'low',
        format: { type: 'json_schema', schema },
      },
      // Server-side refusal fallback, routed by the API's own defaults.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Could not identify that', detail: response.stop_details?.explanation || null });
    }
    if (response.stop_reason === 'max_tokens') {
      return res.status(500).json({ error: 'Identification was cut short — try again' });
    }
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('No text block in identify response');

    const draft = normalizeIdentification(JSON.parse(text), categories, locations);
    return res.status(200).json({ draft, model: response.model });
  } catch (error) {
    // Cloudflare replaces 502/503/504 bodies with HTML; report upstream
    // failures as 500 JSON so the message reaches the editor.
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Busy — try again in a minute' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[shop-identify] Claude API error', error.status, error.message);
      return res.status(500).json({ error: 'Identify service error' });
    }
    console.error('[shop-identify] failed', error);
    return res.status(500).json({ error: 'Could not identify that' });
  }
}
