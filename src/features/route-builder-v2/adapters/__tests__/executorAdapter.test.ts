import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../elevationEnrichment', () => ({
  enrichElevation: vi.fn((r: unknown) => Promise.resolve(r)),
  enrichElevationBatch: vi.fn((rs: unknown) => Promise.resolve(rs)),
}));

import {
  generateRoute,
  applyMutation,
  applyManualAction,
  interpretChatInput,
  toGenerationConstraints,
} from '../executorAdapter';
import { enrichElevation, enrichElevationBatch } from '../elevationEnrichment';
import type { FullRouteContext } from '../assembleRouteContext';
import { setExecutor, type ExecutorResult, type RouteSnapshot } from '../../../../routing/executor';

const mockEnrich = vi.mocked(enrichElevation);
const mockEnrichBatch = vi.mocked(enrichElevationBatch);

function makeContext(): FullRouteContext {
  return {
    user_id: 'u1',
    start_coord: [-105, 40],
    current_region_bbox: [-106, 39, -104, 41],
    training_goal: 'endurance',
    persistent_facts: [],
    session_facts: [],
    time_of_day: '2026-05-16T00:00:00Z',
  };
}

function makeRouteSnapshot(): RouteSnapshot {
  return {
    geometry: [
      [-105, 40],
      [-105.1, 40.1],
    ],
    waypoints: [
      { coordinate: [-105, 40] },
      { coordinate: [-105.1, 40.1] },
    ],
    stats: {
      distance_km: 10,
      elevation_gain_m: 100,
      elevation_loss_m: 100,
      duration_s: 1800,
    },
  };
}

function makeSuccessResult(): ExecutorResult {
  return {
    ok: true,
    route: makeRouteSnapshot(),
    metadata: {
      provider_used: 'stadia',
      duration_ms: 42,
      cache_hit: false,
      attempts_tried: 1,
    },
  };
}

describe('toGenerationConstraints', () => {
  it('maps form input fields one-to-one', () => {
    const c = toGenerationConstraints({
      goal: 'endurance',
      duration_minutes: 60,
      distance_km: 30,
      elevation_gain_m: 500,
      start_coord: [-105, 40],
      surface_mix: { road: 1 },
      like_ride_id: 'r1',
    });
    expect(c).toEqual({
      goal: 'endurance',
      duration_minutes: 60,
      distance_km: 30,
      elevation_gain_m: 500,
      surface_mix: { road: 1 },
      start_coord: [-105, 40],
      like_ride_id: 'r1',
    });
  });

  it('omits keys not present (returns undefined)', () => {
    const c = toGenerationConstraints({ goal: 'fitness' });
    expect(c.goal).toBe('fitness');
    expect(c.duration_minutes).toBeUndefined();
  });
});

describe('interpretChatInput', () => {
  it('is a stub that returns null in P1.2', () => {
    expect(interpretChatInput('make it flatter')).toBeNull();
    expect(interpretChatInput('')).toBeNull();
  });
});

describe('generateRoute', () => {
  beforeEach(() => {
    setExecutor(null);
    mockEnrich.mockClear();
    mockEnrichBatch.mockClear();
  });

  it('forwards constraints and context to executor.generate (count=1)', async () => {
    const generate = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ generate } as any);
    const ctx = makeContext();
    const result = await generateRoute(
      { goal: 'endurance', duration_minutes: 60 },
      1,
      { contextOverride: ctx },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    const [passedCtx, passedConstraints, count] = generate.mock.calls[0];
    expect(passedCtx.user_id).toBe('u1');
    expect(passedCtx.training_goal).toBe('endurance');
    expect(passedConstraints).toMatchObject({
      goal: 'endurance',
      duration_minutes: 60,
    });
    expect(count).toBe(1);
  });

  it('forwards count=3 to executor.generate for alternatives', async () => {
    const generate = vi.fn().mockResolvedValue([makeSuccessResult(), makeSuccessResult(), makeSuccessResult()]);
    setExecutor({ generate } as any);
    const ctx = makeContext();
    const result = await generateRoute(
      { goal: 'endurance' },
      3,
      { contextOverride: ctx },
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as ExecutorResult[]).length).toBe(3);
    expect(generate.mock.calls[0][2]).toBe(3);
  });

  it('propagates executor failures verbatim', async () => {
    const failure: ExecutorResult = {
      ok: false,
      reason: { kind: 'router_unavailable', providers_tried: ['stadia', 'mapbox'] },
    };
    const generate = vi.fn().mockResolvedValue(failure);
    setExecutor({ generate } as any);
    const result = await generateRoute({}, 1, { contextOverride: makeContext() });
    expect((result as { ok: boolean }).ok).toBe(false);
  });

  it('runs elevation enrichment on the count=1 result', async () => {
    const generate = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ generate } as any);
    await generateRoute({}, 1, { contextOverride: makeContext() });
    expect(mockEnrich).toHaveBeenCalledTimes(1);
    expect(mockEnrichBatch).not.toHaveBeenCalled();
  });

  it('runs elevation enrichment on the count=3 batch', async () => {
    const generate = vi.fn().mockResolvedValue([
      makeSuccessResult(),
      makeSuccessResult(),
      makeSuccessResult(),
    ]);
    setExecutor({ generate } as any);
    await generateRoute({}, 3, { contextOverride: makeContext() });
    expect(mockEnrichBatch).toHaveBeenCalledTimes(1);
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});

describe('applyMutation', () => {
  beforeEach(() => {
    setExecutor(null);
    mockEnrich.mockClear();
  });

  it('forwards route, context, and mutation to executor.applyMutation', async () => {
    const applyMutationFn = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ applyMutation: applyMutationFn } as any);
    const route = makeRouteSnapshot();
    const result = await applyMutation(
      route,
      { type: 'extend_distance', delta_km: 5 },
      { contextOverride: makeContext() },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(applyMutationFn).toHaveBeenCalledTimes(1);
    const [passedRoute, passedCtx, passedMutation] = applyMutationFn.mock.calls[0];
    expect(passedRoute).toBe(route);
    expect(passedCtx.user_id).toBe('u1');
    expect(passedMutation).toEqual({ type: 'extend_distance', delta_km: 5 });
  });

  it('runs elevation enrichment on the result', async () => {
    const applyMutationFn = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ applyMutation: applyMutationFn } as any);
    await applyMutation(
      makeRouteSnapshot(),
      { type: 'extend_distance', delta_km: 5 },
      { contextOverride: makeContext() },
    );
    expect(mockEnrich).toHaveBeenCalledTimes(1);
  });
});

describe('applyManualAction', () => {
  beforeEach(() => {
    setExecutor(null);
    mockEnrich.mockClear();
  });

  it('forwards route, context, action and payload', async () => {
    const applyManualActionFn = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ applyManualAction: applyManualActionFn } as any);
    const route = makeRouteSnapshot();
    const result = await applyManualAction(
      route,
      'drag_waypoint',
      { action: 'drag_waypoint', waypoint_index: 0, new_coord: [-105.2, 40.2] },
      { contextOverride: makeContext() },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    const [passedRoute, , passedAction, payload] = applyManualActionFn.mock.calls[0];
    expect(passedRoute).toBe(route);
    expect(passedAction).toBe('drag_waypoint');
    expect(payload).toMatchObject({ waypoint_index: 0 });
  });

  it('runs elevation enrichment on the result', async () => {
    const applyManualActionFn = vi.fn().mockResolvedValue(makeSuccessResult());
    setExecutor({ applyManualAction: applyManualActionFn } as any);
    await applyManualAction(
      makeRouteSnapshot(),
      'drag_waypoint',
      { action: 'drag_waypoint', waypoint_index: 0, new_coord: [-105.2, 40.2] },
      { contextOverride: makeContext() },
    );
    expect(mockEnrich).toHaveBeenCalledTimes(1);
  });
});
