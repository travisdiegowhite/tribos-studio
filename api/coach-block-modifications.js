/**
 * Coach Block Modifications
 *
 * GET  /api/coach-block-modifications?user_id=...   — list unread modifications
 * POST /api/coach-block-modifications  body: { user_id, modification_id, action }
 *      action: 'acknowledge' (mark read) | 'dispute' (Phase 4 hook, currently a no-op tag)
 *
 * Powers the BlockExtensionStrip surface in CoachCard. Surfaces explanations
 * like "I'm holding you in recovery one extra day. Your conservative recovery
 * setting plus AFI still elevated." (spec §3.5)
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const userId = req.query.user_id;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'user_id required' });
      }

      const { data, error } = await supabase
        .from('block_modifications')
        .select('id, block_id, modified_at, modified_by, reason, before, after, acknowledged')
        .eq('user_id', userId)
        .eq('acknowledged', false)
        .order('modified_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return res.status(200).json({ ok: true, modifications: data ?? [] });
    } catch (err) {
      console.error('[coach-block-modifications GET] error:', err);
      return res.status(500).json({
        error: 'Failed to load modifications',
        detail: err?.message ?? String(err),
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { user_id, modification_id, action } = req.body ?? {};
      if (!user_id || !modification_id || !action) {
        return res
          .status(400)
          .json({ error: 'user_id, modification_id, action required' });
      }
      if (action !== 'acknowledge' && action !== 'dispute') {
        return res.status(400).json({ error: 'invalid action' });
      }

      const { error } = await supabase
        .from('block_modifications')
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', modification_id)
        .eq('user_id', user_id);

      if (error) throw error;

      // Phase 4 will branch on action === 'dispute' to spawn a manual override
      // proposal. For now, both actions clear the strip; dispute is logged.
      if (action === 'dispute') {
        console.log(
          `[coach-block-modifications] user ${user_id} disputed modification ${modification_id}. Phase 4 will use this signal for manual override.`
        );
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[coach-block-modifications POST] error:', err);
      return res.status(500).json({
        error: 'Failed to update modification',
        detail: err?.message ?? String(err),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
