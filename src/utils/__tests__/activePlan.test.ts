import { describe, it, expect } from 'vitest';
import { resolveActivePlan } from '../activePlan';

// Minimal chainable Supabase stub: the query builder is a thenable resolving to {data}.
function mockSupabase(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['eq', 'order']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return { from: () => ({ select: () => chain }) } as any;
}

describe('resolveActivePlan', () => {
  it('returns null when the athlete has no active plans', async () => {
    expect(await resolveActivePlan(mockSupabase([]), 'u1')).toBeNull();
  });

  it('returns null when userId is missing', async () => {
    expect(await resolveActivePlan(mockSupabase([{ id: 'x' }]), '')).toBeNull();
  });

  it('returns the top row (DB orders primary-first, then recency)', async () => {
    const rows = [
      { id: 'p1', priority: 'primary' },
      { id: 'p2', priority: 'secondary' },
    ];
    const res = await resolveActivePlan(mockSupabase(rows), 'u1');
    expect(res?.id).toBe('p1');
  });

  it('filters by sport when provided, treating null sport_type as cycling', async () => {
    const rows = [
      { id: 'r1', sport_type: 'running' },
      { id: 'c1', sport_type: null },
    ];
    const res = await resolveActivePlan(mockSupabase(rows), 'u1', 'cycling');
    expect(res?.id).toBe('c1');
  });

  it('returns null when a sport filter matches nothing', async () => {
    const rows = [{ id: 'c1', sport_type: 'cycling' }];
    const res = await resolveActivePlan(mockSupabase(rows), 'u1', 'running');
    expect(res).toBeNull();
  });
});
