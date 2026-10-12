// Vercel API Route: weekly refresh of event_catalog (Train → Find an event).
//
// GET (cron, Mondays 05:00 UTC)  → re-check a batch of unconfirmed upcoming
//     events on the web and apply verified dates. See api/utils/eventCatalogRefresh.js.
// GET ?limit=10&dry=1 (cron-secret authed) → a manual run; dry=1 writes nothing
//     and returns each planned change, for eyeballing before trusting a batch.
//
// Batch size: ?limit=, else EVENT_REFRESH_BATCH, else 24 (max 60). Each check
// is up to 3 web searches + 2 page fetches on claude-sonnet-5-5.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { DEFAULT_BATCH, MAX_BATCH, runRefresh } from './utils/eventCatalogRefresh.js';

const supabase = getSupabaseAdmin();

function batchSize(query) {
  const n = Number(query?.limit ?? process.env.EVENT_REFRESH_BATCH ?? DEFAULT_BATCH);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_BATCH) : DEFAULT_BATCH;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[event-catalog-refresh] MISSING ANTHROPIC_API_KEY');
    return res.status(500).json({ success: false, error: 'Not configured' });
  }

  const dryRun = req.query?.dry === '1' || req.query?.dry === 'true';
  try {
    const summary = await runRefresh({
      supabase,
      // One slow check must not eat the run: 70 s per request, one retry.
      client: new Anthropic({ apiKey, timeout: 70_000, maxRetries: 1 }),
      today: new Date().toISOString().slice(0, 10),
      limit: batchSize(req.query),
      dryRun,
    });
    // One line per run; changes list ids only (public event data, no athlete data).
    console.log('[event-catalog-refresh]', JSON.stringify({ dryRun, ...summary, changes: summary.changes.map((c) => `${c.id}:${c.outcome}`) }));
    // A run where every check failed is a failure, not a quiet green cron.
    const allFailed = summary.picked > 0 && summary.checked === 0;
    return res.status(allFailed ? 502 : 200).json({ success: !allFailed, dryRun, ...summary });
  } catch (err) {
    console.error('[event-catalog-refresh] failed:', err?.status ?? '', err?.message ?? err);
    return res.status(500).json({ success: false, error: String(err?.message ?? err).slice(0, 200) });
  }
}
