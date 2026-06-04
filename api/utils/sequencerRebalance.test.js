import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable fixtures the mocked generators read.
let sessionsFixture = [];
let gatingFn = () => ({ gated: false });

vi.mock('./sequencerBlockOps.js', () => ({
  generateSessionsForBlock: () => sessionsFixture,
  evaluateGating: (_ctx, s) => gatingFn(s),
}));
vi.mock('./sequencerContext.js', () => ({
  buildSequencerContext: async () => ({ upcoming_events: [], coefficients: {}, daily_stats: [] }),
}));

const { proposeBlockRebalance } = await import('./sequencerRebalance.js');

const TODAY = '2026-06-10';

// Configurable Supabase stub. `seq` controls the active-sequence lookup;
// block_instances / session_prescriptions resolve to the given fixtures;
// block_modifications.insert is captured.
function makeSupabase({ seq = { id: 'seq1' }, blocks = [], existing = [], capture }) {
  return {
    from(table) {
      const b = {
        select: () => b,
        eq: () => b,
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
        maybeSingle: () =>
          Promise.resolve({ data: table === 'sequences' ? seq : null, error: null }),
        then: (resolve) => {
          let data = [];
          if (table === 'block_instances') data = blocks;
          else if (table === 'session_prescriptions') data = existing;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return b;
    },
  };
}

const block = {
  id: 'b1',
  block_type: 'threshold',
  start_date: TODAY,
  end_date: '2026-06-30',
  parent_event_id: null,
  parent_event_tier: null,
};

beforeEach(() => {
  sessionsFixture = [
    { date: TODAY, session_type: 'threshold', target_rss: 90, target_duration_min: 75 },
  ];
  gatingFn = () => ({ gated: false });
});

describe('proposeBlockRebalance', () => {
  it('returns no proposal when there is no active sequence', async () => {
    const supabase = makeSupabase({ seq: null });
    const out = await proposeBlockRebalance({ supabase, user_id: 'u1', fromDate: TODAY });
    expect(out).toEqual({ proposed: false, reason: 'no_active_sequence' });
  });

  it('proposes a change (no write to prescriptions) when gating downgrades a day', async () => {
    gatingFn = () => ({
      gated: true,
      reason: 'FS ≤ -15: no quality work today. Substituting Z2.',
      substitute: { session_type: 'z2', target_rss: 50, target_duration_min: 60 },
    });
    const existing = [{ date: TODAY, session_type: 'threshold', target_rss: 90, target_duration_min: 75 }];
    const inserts = [];
    const supabase = makeSupabase({
      blocks: [block],
      existing,
      capture: (table, payload) => inserts.push({ table, payload }),
    });

    const out = await proposeBlockRebalance({ supabase, user_id: 'u1', fromDate: TODAY });

    expect(out.proposed).toBe(true);
    expect(out.change_count).toBe(1);
    // It wrote a block_modifications proposal — and nothing to session_prescriptions.
    const modInsert = inserts.find((i) => i.table === 'block_modifications');
    expect(modInsert.payload.proposal_state).toBe('proposed');
    expect(modInsert.payload.proposed_changes).toHaveLength(1);
    expect(modInsert.payload.proposed_changes[0].after.session_type).toBe('z2');
    expect(inserts.some((i) => i.table === 'session_prescriptions')).toBe(false);
  });

  it('proposes nothing when the regenerated day matches the existing prescription', async () => {
    // Gating passes → generated equals what is already scheduled.
    const existing = [{ date: TODAY, session_type: 'threshold', target_rss: 90, target_duration_min: 75 }];
    const supabase = makeSupabase({ blocks: [block], existing });
    const out = await proposeBlockRebalance({ supabase, user_id: 'u1', fromDate: TODAY });
    expect(out).toEqual({ proposed: false, reason: 'no_changes' });
  });
});
