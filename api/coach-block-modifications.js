/**
 * Coach Block Modifications
 *
 * GET  /api/coach-block-modifications?user_id=...   — list unread modifications
 * POST /api/coach-block-modifications  body: { user_id, modification_id, action }
 *      action:
 *        'acknowledge' — mark an informational row read
 *        'dispute'     — mark read (Phase 4 hook for manual override)
 *        'apply'       — for a proposal: write its proposed_changes into
 *                        session_prescriptions, re-project to the calendar,
 *                        and mark it applied
 *        'dismiss'     — for a proposal: discard it (mark dismissed)
 *
 * Powers the BlockExtensionStrip surface. Informational rows are audit
 * explanations; 'proposed' rows are suggest-and-confirm rebalances the athlete
 * can Apply/Dismiss (migration 094).
 */

import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  ensureEventAnchoredPlan,
  projectPrescriptionsToCalendar,
} from './utils/eventAnchoredCalendarBridge.js';

// Write the proposal's candidate changes into session_prescriptions (canonical)
// and re-project them onto the calendar. Best-effort projection: prescriptions
// are the source of truth and the daily rollover heals any missed projection.
async function applyProposal(supabase, userId, changes) {
  if (!Array.isArray(changes) || changes.length === 0) return { applied: 0, projected: 0 };

  const now = new Date().toISOString();
  const rows = changes.map((c) => ({
    user_id: userId,
    block_id: c.block_id,
    date: c.date,
    session_type: c.after.session_type,
    target_rss: c.after.target_rss,
    target_duration_min: c.after.target_duration_min,
    prescribed_intervals: c.after.prescribed_intervals ?? null,
    long_ride_flag: c.after.long_ride_flag ?? null,
    notes: c.after.notes ?? null,
    gating_reason: c.gating_reason ?? null,
    updated_at: now,
  }));

  const { error: presErr } = await supabase
    .from('session_prescriptions')
    .upsert(rows, { onConflict: 'user_id,date' });
  if (presErr) throw presErr;

  let projected = 0;
  try {
    const { data: seq } = await supabase
      .from('sequences')
      .select('horizon_event_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (seq?.horizon_event_id) {
      const { data: race } = await supabase
        .from('race_goals')
        .select('id, name, race_date')
        .eq('id', seq.horizon_event_id)
        .maybeSingle();

      if (race) {
        const planId = await ensureEventAnchoredPlan(supabase, userId, race);
        const { data: phantom } = await supabase
          .from('training_plans')
          .select('started_at')
          .eq('id', planId)
          .maybeSingle();

        const blockIds = [...new Set(changes.map((c) => c.block_id).filter(Boolean))];
        const { data: blockRows } = await supabase
          .from('block_instances')
          .select('id, block_type')
          .in('id', blockIds);
        const blockTypeById = new Map((blockRows ?? []).map((b) => [b.id, b.block_type]));

        const items = changes.map((c) => ({
          prescription: {
            user_id: userId,
            block_id: c.block_id,
            date: c.date,
            session_type: c.after.session_type,
            target_rss: c.after.target_rss,
            target_duration_min: c.after.target_duration_min,
            gating_reason: c.gating_reason ?? null,
          },
          blockType: blockTypeById.get(c.block_id) ?? null,
        }));

        const today = new Date().toISOString().slice(0, 10);
        const { inserted } = await projectPrescriptionsToCalendar(supabase, {
          planId,
          userId,
          planStartedAt: phantom?.started_at ?? today,
          items,
        });
        projected = inserted;
      }
    }
  } catch (projErr) {
    console.error('[coach-block-modifications] apply projection failed (non-blocking):', projErr);
  }

  return { applied: rows.length, projected };
}

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
        .select('id, block_id, modified_at, modified_by, reason, before, after, acknowledged, proposal_state, proposed_changes')
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
      const VALID = ['acknowledge', 'dispute', 'apply', 'dismiss'];
      if (!user_id || !modification_id || !action) {
        return res
          .status(400)
          .json({ error: 'user_id, modification_id, action required' });
      }
      if (!VALID.includes(action)) {
        return res.status(400).json({ error: 'invalid action' });
      }

      // Load the row so we know whether it's an actionable proposal.
      const { data: mod, error: loadErr } = await supabase
        .from('block_modifications')
        .select('id, user_id, proposal_state, proposed_changes')
        .eq('id', modification_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!mod) return res.status(404).json({ error: 'modification_not_found' });

      const now = new Date().toISOString();

      if (action === 'apply') {
        if (mod.proposal_state !== 'proposed') {
          return res.status(409).json({ error: 'not_actionable', proposal_state: mod.proposal_state });
        }
        const result = await applyProposal(supabase, user_id, mod.proposed_changes ?? []);
        const { error: updErr } = await supabase
          .from('block_modifications')
          .update({ proposal_state: 'applied', acknowledged: true, acknowledged_at: now })
          .eq('id', modification_id)
          .eq('user_id', user_id);
        if (updErr) throw updErr;
        return res.status(200).json({ ok: true, applied: true, ...result });
      }

      // acknowledge / dispute / dismiss → clear the strip. A 'proposed' row that
      // is dismissed/disputed/acknowledged is recorded as 'dismissed' so it is
      // never silently applied; informational rows just get acknowledged.
      const nextState = mod.proposal_state === 'proposed' ? 'dismissed' : mod.proposal_state;
      const { error: updErr } = await supabase
        .from('block_modifications')
        .update({ proposal_state: nextState, acknowledged: true, acknowledged_at: now })
        .eq('id', modification_id)
        .eq('user_id', user_id);
      if (updErr) throw updErr;

      if (action === 'dispute') {
        console.log(
          `[coach-block-modifications] user ${user_id} disputed modification ${modification_id}.`
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
