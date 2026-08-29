/**
 * Coach changes the server withheld for the athlete to accept or reject.
 *
 * THE HALF THAT WAS MISSING
 * ------------------------
 * `calendarChangeTool.js` decides that a coach change needs the athlete —
 * because it touches more than one existing session, a session they had
 * already adjusted, or one already marked done — and `persistProposal` writes
 * it to `calendar_change_proposals`. Nothing read that table. So the coach
 * would tell the athlete "I've put that up for you to accept" and there was no
 * accept button anywhere: their two-day swap went into a queue and stayed
 * there. This module and the banner on /train are the other half.
 *
 * TARGETS ARE PINNED AT PROPOSE TIME, not resolved at apply time — the ops
 * carry concrete `calendar_entries` ids, chosen when the proposal was written.
 * `check-in-apply.js` resolves selectors like 'next_quality' when the athlete
 * taps, which means with any approval delay they accept one session and a
 * different one changes. That is the failure this design exists to avoid, so
 * nothing here re-resolves anything.
 *
 * A TARGET CAN VANISH between proposing and accepting: the athlete may have
 * deleted or moved the session in the meantime. Each op is applied
 * independently and a missing target is reported as SKIPPED, never as an
 * error and never silently.
 */

import { supabase } from '../supabase';
import { moveEntry, updateEntry, deleteEntry, setEntryStatus, createEntry } from './calendarMutations';
import type { CalendarEntryStatus } from './getCalendarRange';

export type ProposalOutcome = 'pending' | 'accepted' | 'rejected' | 'partial' | 'expired';
export type ProposalReason = 'multi_entry' | 'pinned' | 'completed' | 'mixed';

/** One operation inside a proposal, as persistProposal wrote it. */
export interface ProposalOp {
  op: 'create' | 'update' | 'move' | 'delete' | 'set_status';
  /** The concrete entry this changes. Null for a create. */
  entry_id: string | null;
  /** The `sess_` handle the coach used. Kept for display only. */
  handle: string | null;
  /** The entry as it was when the proposal was written — the "before" side. */
  before: Record<string, unknown> | null;
  /** The fields to write. Null for a delete. */
  after: Record<string, unknown> | null;
  /** One sentence in the coach's voice. */
  reason: string | null;
}

export interface CalendarProposal {
  id: string;
  user_id: string;
  reason_code: ProposalReason;
  summary: string | null;
  ops: ProposalOp[];
  outcome: ProposalOutcome;
  created_at: string;
}

export interface ApplyResult {
  success: boolean;
  applied: number;
  skipped: number;
  failed: number;
  /** Per-op outcome, in the proposal's own order, for the toast and the log. */
  results: Array<{ op: string; label: string; ok: boolean; skipped?: boolean; error?: string }>;
  error?: string;
}

/** Why the server withheld this, in the athlete's language. */
export function explainReason(code: ProposalReason): string {
  switch (code) {
    case 'multi_entry':
      return 'changes more than one session';
    case 'pinned':
      return 'touches a session you already adjusted';
    case 'completed':
      return 'touches a session already marked done';
    default:
      return 'needs your say-so';
  }
}

/** A short human label for one op, for the diff card and the result toast. */
export function describeOp(op: ProposalOp): string {
  const name = (op.before?.title as string) || (op.after?.title as string) || 'that session';
  switch (op.op) {
    case 'move': {
      const from = op.before?.date as string | undefined;
      const to = op.after?.date as string | undefined;
      return from && to ? `Move ${name} from ${from} to ${to}` : `Move ${name}`;
    }
    case 'delete':
      return `Remove ${name}`;
    case 'set_status': {
      const status = op.after?.status as string | undefined;
      return status === 'done' ? `Mark ${name} done` : `Mark ${name} ${status ?? 'changed'}`;
    }
    case 'create':
      return `Add ${name}${op.after?.date ? ` on ${op.after.date}` : ''}`;
    default:
      return `Edit ${name}`;
  }
}

/** Pending proposals for this athlete, newest first. */
export async function listPendingProposals(userId: string): Promise<CalendarProposal[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('calendar_change_proposals')
    .select('id, user_id, reason_code, summary, ops, outcome, created_at')
    .eq('user_id', userId)
    .eq('outcome', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('listPendingProposals failed', error.message);
    return [];
  }
  return (data ?? []) as CalendarProposal[];
}

/** Record the athlete's decision. Separate so a failed write is visible. */
async function settle(
  userId: string,
  proposalId: string,
  outcome: ProposalOutcome,
): Promise<boolean> {
  const { error } = await supabase
    .from('calendar_change_proposals')
    .update({ outcome, outcome_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('user_id', userId);

  if (error) {
    console.error('settling the proposal failed', error.message);
    return false;
  }
  return true;
}

/**
 * Apply every op in a proposal.
 *
 * Each mutation goes through `calendarMutations`, which PINS what it writes —
 * correct here and nowhere else on the coach's path: an accepted change is a
 * decision the athlete made, so the next coach edit to the same session has to
 * ask again.
 *
 * Ops are applied in order and independently. One failure does not roll back
 * the ones before it: the list was adjudicated as a whole, but a session that
 * has since been deleted should not undo three moves that landed.
 */
export async function acceptProposal(
  userId: string,
  proposal: CalendarProposal,
): Promise<ApplyResult> {
  if (!userId) return { success: false, applied: 0, skipped: 0, failed: 0, results: [], error: 'Not signed in' };

  const results: ApplyResult['results'] = [];

  for (const op of proposal.ops ?? []) {
    const label = describeOp(op);

    // A create has no target to have vanished.
    if (op.op === 'create') {
      const date = op.after?.date as string | undefined;
      const title = op.after?.title as string | undefined;
      if (!date || !title) {
        results.push({ op: op.op, label, ok: false, error: 'That change is missing a date or a name.' });
        continue;
      }
      const created = await createEntry(userId, date, {
        ...(op.after as Record<string, unknown>),
        title,
        source: 'coach',
      } as Parameters<typeof createEntry>[2]);
      results.push({ op: op.op, label, ok: created.success, error: created.error });
      continue;
    }

    if (!op.entry_id) {
      results.push({ op: op.op, label, ok: false, error: 'That change has no session attached.' });
      continue;
    }

    // The athlete may have deleted or moved this since the coach proposed it.
    // A vanished target is a SKIP, reported plainly — not an error, and never
    // a silent no-op.
    const { data: live } = await supabase
      .from('calendar_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('id', op.entry_id)
      .maybeSingle();

    if (!live) {
      results.push({
        op: op.op,
        label,
        ok: false,
        skipped: true,
        error: 'That session is no longer on your calendar.',
      });
      continue;
    }

    let result: { success: boolean; error?: string };
    switch (op.op) {
      case 'move': {
        const to = op.after?.date as string | undefined;
        result = to
          ? await moveEntry(userId, op.entry_id, to)
          : { success: false, error: 'That move has no date.' };
        break;
      }
      case 'delete':
        result = await deleteEntry(userId, op.entry_id);
        break;
      case 'set_status': {
        const status = op.after?.status as CalendarEntryStatus | undefined;
        result = status
          ? await setEntryStatus(userId, op.entry_id, status)
          : { success: false, error: 'That change has no status.' };
        break;
      }
      default:
        result = await updateEntry(userId, op.entry_id, (op.after ?? {}) as Parameters<typeof updateEntry>[2]);
    }
    results.push({ op: op.op, label, ok: result.success, error: result.error });
  }

  const applied = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.length - applied - skipped;

  // 'partial' is a real outcome, not a rounding of 'accepted': the athlete
  // needs to be able to see later that some of what they accepted did not land.
  const outcome: ProposalOutcome = failed === 0 && skipped === 0 ? 'accepted' : 'partial';
  const settled = await settle(userId, proposal.id, outcome);

  return {
    success: failed === 0 && settled,
    applied,
    skipped,
    failed,
    results,
    error: settled ? undefined : 'The changes were made but the proposal could not be closed.',
  };
}

/** Decline a proposal outright. Nothing on the calendar changes. */
export async function rejectProposal(userId: string, proposalId: string): Promise<boolean> {
  if (!userId || !proposalId) return false;
  return settle(userId, proposalId, 'rejected');
}
