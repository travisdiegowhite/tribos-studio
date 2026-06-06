import { describe, it, expect, vi } from 'vitest';

let gen = () => [];
let gating = () => ({ gated: false });
let progression = () => ({ upgraded: false });

vi.mock('./sequencerBlockOps.js', () => ({
  generateSessionsForBlock: (...a) => gen(...a),
  evaluateGating: (...a) => gating(...a),
  evaluateProgression: (...a) => progression(...a),
}));
vi.mock('./sequencerContext.js', () => ({
  buildSequencerContext: async () => ({ daily_stats: [], upcoming_events: [], coefficients: {} }),
}));

const { proposeProgression } = await import('./sequencerProgression.js');

const TODAY = '2026-06-10';
const block = { id: 'b1', block_type: 'threshold', start_date: TODAY, end_date: '2026-06-30', parent_event_id: null, parent_event_tier: null };

function freshCtx(fs = 25) {
  return { daily_stats: [{ date: TODAY, form_score: fs, afi: 40, tfi: 60 }], upcoming_events: [], coefficients: {} };
}

function makeSupabase({ seq = { id: 'seq1' }, openProps = [], blocks = [], existing = [], estimatedFtp = null, ftp = 250, capture } = {}) {
  return {
    from(table) {
      const b = {
        select: () => b,
        eq: () => b,
        not: () => b,
        in: () => b,
        lte: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        insert: (payload) => {
          capture?.(table, payload);
          return b;
        },
        single: () => Promise.resolve({ data: { id: 'mod1' }, error: null }),
        maybeSingle: () => {
          if (table === 'sequences') return Promise.resolve({ data: seq, error: null });
          if (table === 'fitness_snapshots') return Promise.resolve({ data: estimatedFtp == null ? null : { estimated_ftp: estimatedFtp }, error: null });
          if (table === 'user_profiles') return Promise.resolve({ data: { ftp }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => {
          let data = [];
          if (table === 'block_instances') data = blocks;
          else if (table === 'session_prescriptions') data = existing;
          else if (table === 'block_modifications') data = openProps;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return b;
    },
  };
}

describe('proposeProgression', () => {
  it('no active sequence → no proposal', async () => {
    const out = await proposeProgression({ supabase: makeSupabase({ seq: null }), user_id: 'u1', fromDate: TODAY, ctx: freshCtx() });
    expect(out).toEqual({ proposed: false, reason: 'no_active_sequence' });
  });

  it('dedupes against an open proposal', async () => {
    const out = await proposeProgression({ supabase: makeSupabase({ openProps: [{ id: 'x' }] }), user_id: 'u1', fromDate: TODAY, ctx: freshCtx() });
    expect(out).toEqual({ proposed: false, reason: 'open_proposal_exists' });
  });

  it('no signal (not fresh, no FTP rise) → no proposal', async () => {
    const out = await proposeProgression({ supabase: makeSupabase({ blocks: [block] }), user_id: 'u1', fromDate: TODAY, ctx: freshCtx(5) });
    expect(out).toEqual({ proposed: false, reason: 'no_signal' });
  });

  it('fresh → writes one proposal and no prescription', async () => {
    gen = () => [{ date: TODAY, session_type: 'z2', target_rss: 55, target_duration_min: 75 }];
    gating = () => ({ gated: false });
    progression = () => ({
      upgraded: true,
      reason: 'Form Score +25 — nudging up.',
      substitute: { date: TODAY, session_type: 'tempo', target_rss: 62, target_duration_min: 75, prescribed_intervals: null, long_ride_flag: false, notes: '[progression]' },
    });
    const inserts = [];
    const supabase = makeSupabase({ blocks: [block], capture: (t, p) => inserts.push({ table: t, payload: p }) });

    const out = await proposeProgression({ supabase, user_id: 'u1', fromDate: TODAY, ctx: freshCtx(25) });

    expect(out.proposed).toBe(true);
    expect(out.change_count).toBe(1);
    const modInsert = inserts.find((i) => i.table === 'block_modifications');
    expect(modInsert.payload.proposal_state).toBe('proposed');
    expect(modInsert.payload.proposed_changes[0].after.session_type).toBe('tempo');
    expect(inserts.some((i) => i.table === 'session_prescriptions')).toBe(false);
  });
});
