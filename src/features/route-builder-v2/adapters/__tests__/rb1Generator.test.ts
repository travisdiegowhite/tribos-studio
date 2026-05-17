import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/aiRouteGenerator.js', () => ({
  generateAIRoutes: vi.fn(),
}));
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

import { generateRouteViaRb1 } from '../rb1Generator';
import { generateAIRoutes } from '../../../../utils/aiRouteGenerator.js';

const mockedGen = generateAIRoutes as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedGen.mockReset();
});

describe('generateRouteViaRb1', () => {
  it('returns context_missing failure when start_coord is absent', async () => {
    const res = await generateRouteViaRb1({}, 1);
    expect(Array.isArray(res)).toBe(false);
    expect((res as { ok: boolean }).ok).toBe(false);
    expect((res as { reason: { kind: string } }).reason.kind).toBe('context_missing');
  });

  it('returns one ExecutorResult on success and threads params to RB1', async () => {
    mockedGen.mockResolvedValue([
      {
        name: 'Loop A',
        distance: 30,
        elevationGain: 250,
        elevationLoss: 250,
        coordinates: [
          [-105, 40],
          [-105.1, 40.1],
          [-105, 40],
        ],
      },
    ]);
    const res = await generateRouteViaRb1(
      {
        start_coord: [-105, 40],
        duration_minutes: 90,
        goal: 'endurance',
        route_shape: 'loop',
      },
      1,
    );
    expect(Array.isArray(res)).toBe(false);
    expect((res as { ok: boolean }).ok).toBe(true);
    expect(mockedGen).toHaveBeenCalledWith(
      expect.objectContaining({
        startLocation: [-105, 40],
        timeAvailable: 90,
        trainingGoal: 'endurance',
        routeType: 'loop',
        userId: 'user-1',
      }),
      null,
    );
  });

  it('returns failure when RB1 produces zero routes', async () => {
    mockedGen.mockResolvedValue([]);
    const res = await generateRouteViaRb1({ start_coord: [-105, 40] }, 1);
    expect((res as { ok: boolean }).ok).toBe(false);
    expect((res as { reason: { kind: string } }).reason.kind).toBe('internal_error');
  });

  it('returns 3 results when count=3 (padding when RB1 returns fewer)', async () => {
    mockedGen.mockResolvedValue([
      {
        name: 'A',
        distance: 20,
        coordinates: [
          [-105, 40],
          [-105.1, 40.1],
        ],
      },
    ]);
    const res = await generateRouteViaRb1({ start_coord: [-105, 40] }, 3);
    expect(Array.isArray(res)).toBe(true);
    expect((res as Array<unknown>).length).toBe(3);
  });

  it('derives timeAvailable from distance_km when duration_minutes is absent', async () => {
    mockedGen.mockResolvedValue([
      { distance: 56, coordinates: [[-105, 40], [-105.1, 40.1]] },
    ]);
    await generateRouteViaRb1({ start_coord: [-105, 40], distance_km: 56 }, 1);
    const call = mockedGen.mock.calls[0][0];
    // 56km / 28kph * 60 = 120 minutes
    expect(call.timeAvailable).toBe(120);
  });
});
