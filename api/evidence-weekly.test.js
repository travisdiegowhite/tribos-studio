import { describe, it, expect } from 'vitest';
import { fetchEvidenceInputs, mondayOf, latestCompleteWeek } from './evidence-weekly.js';

// Recording supabase mock: every builder call is captured per table so the
// test can assert exactly which filters the job applies.
function recordingClient() {
  const calls = [];
  const client = {
    from(table) {
      const chain = { table, ops: [] };
      calls.push(chain);
      const builder = {};
      for (const m of ['select', 'eq', 'is', 'or', 'gte', 'lt', 'not', 'order', 'limit']) {
        builder[m] = (...args) => {
          chain.ops.push({ m, args });
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
      builder.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  };
  return { client, calls };
}

describe('cleaned-inputs invariant (encoded in the query, not a convention)', () => {
  it('the activities query always excludes duplicates and hidden rows', async () => {
    const { client, calls } = recordingClient();
    await fetchEvidenceInputs(client, 'user-1', '2026-07-27');

    const act = calls.find((c) => c.table === 'activities');
    expect(act).toBeDefined();
    expect(act.ops).toContainEqual({ m: 'is', args: ['duplicate_of', null] });
    expect(act.ops).toContainEqual({ m: 'or', args: ['is_hidden.is.null,is_hidden.eq.false'] });
    // Per-athlete baselines only.
    expect(act.ops).toContainEqual({ m: 'eq', args: ['user_id', 'user-1'] });
  });

  it('reads training_load_daily (canonical + legacy columns), never writes it', async () => {
    const { client, calls } = recordingClient();
    await fetchEvidenceInputs(client, 'user-1', '2026-07-27');

    const daily = calls.find((c) => c.table === 'training_load_daily');
    expect(daily).toBeDefined();
    const select = daily.ops.find((o) => o.m === 'select');
    expect(select.args[0]).toContain('tfi');
    expect(select.args[0]).toContain('ctl'); // legacy fallback stays in the SELECT list
    const writeOps = daily.ops.filter((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.m));
    expect(writeOps).toHaveLength(0);
  });

  it('segment traversals are scoped to the athlete', async () => {
    const { client, calls } = recordingClient();
    await fetchEvidenceInputs(client, 'user-1', '2026-07-27');
    const seg = calls.find((c) => c.table === 'training_segment_rides');
    expect(seg.ops).toContainEqual({ m: 'eq', args: ['training_segments.user_id', 'user-1'] });
  });
});

describe('week grid (Monday-start, aligned with fitness_snapshots)', () => {
  it('mondayOf maps any weekday to its Monday', () => {
    expect(mondayOf('2026-08-02')).toBe('2026-07-27'); // Sunday
    expect(mondayOf('2026-07-27')).toBe('2026-07-27'); // Monday
    expect(mondayOf('2026-07-30')).toBe('2026-07-27'); // Thursday
  });

  it('latestCompleteWeek is the week before the current one', () => {
    expect(latestCompleteWeek(new Date('2026-08-03T05:00:00Z'))).toBe('2026-07-27');
    expect(latestCompleteWeek(new Date('2026-08-09T23:00:00Z'))).toBe('2026-07-27');
    expect(latestCompleteWeek(new Date('2026-08-10T05:00:00Z'))).toBe('2026-08-03');
  });
});
