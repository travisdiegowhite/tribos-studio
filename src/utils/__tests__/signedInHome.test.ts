import { describe, it, expect } from 'vitest';
import { resolveSignedInHome, HOME_WITH_PLAN, HOME_WITHOUT_PLAN } from '../signedInHome';

function client(result: { data: unknown[] | null; error: unknown } | Error) {
  const calls: Array<[string, string]> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: string) => {
      calls.push([col, val]);
      return calls.length === 2
        ? result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result)
        : builder;
    },
  };
  return { client: { from: () => builder } as never, calls };
}

describe('resolveSignedInHome', () => {
  it('sends a rider with a current active plan to /today', async () => {
    const { client: c, calls } = client({
      data: [{ start_date: '2026-11-01', duration_weeks: 8 }],
      error: null,
    });
    expect(await resolveSignedInHome(c, 'u1', '2026-11-27')).toBe(HOME_WITH_PLAN);
    expect(calls).toEqual([
      ['user_id', 'u1'],
      ['status', 'active'],
    ]);
  });

  it('sends a rider without a plan to the route builder', async () => {
    const { client: c } = client({ data: [], error: null });
    expect(await resolveSignedInHome(c, 'u1', '2026-11-27')).toBe(HOME_WITHOUT_PLAN);
  });

  it("ignores a stale 'active' plan whose end has passed", async () => {
    const { client: c } = client({ data: [{ end_date: '2026-06-01' }], error: null });
    expect(await resolveSignedInHome(c, 'u1', '2026-11-27')).toBe(HOME_WITHOUT_PLAN);
  });

  it('keeps today’s behaviour on an error', async () => {
    expect(await resolveSignedInHome(client({ data: null, error: { message: 'x' } }).client, 'u1')).toBe(HOME_WITH_PLAN);
    expect(await resolveSignedInHome(client(new Error('network')).client, 'u1')).toBe(HOME_WITH_PLAN);
  });
});
