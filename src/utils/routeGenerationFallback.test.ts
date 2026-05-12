import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  // Thenable query-builder mock — every chain method returns the same
  // builder, and the builder is awaitable at any point (matches the
  // real PostgREST client, where `.from().select().eq()` can be awaited
  // directly without `.limit()`).
  const make = () => {
    const state: { data: unknown; error: unknown } = { data: [], error: null };
    const builder: Record<string, unknown> = {};
    const chain = vi.fn(() => builder);
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'single', 'in']) {
      builder[m] = chain;
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: state.data, error: state.error });
    (builder as { __setResult: (d: unknown[], e?: unknown) => void }).__setResult = (
      data,
      error = null
    ) => {
      state.data = data;
      state.error = error;
    };
    return builder;
  };

  const fromMap: Record<string, ReturnType<typeof make>> = {
    routes: make(),
    track_points: make(),
  };

  return {
    supabase: {
      from: vi.fn((table: string) => fromMap[table] ?? make()),
      __fromMap: fromMap,
    },
  };
});

vi.mock('./smartCyclingRouter', () => ({
  getSmartCyclingRoute: vi.fn(),
}));

import { generateFallbackRoute } from './routeGenerationFallback';
import { supabase } from '../lib/supabase';
import { getSmartCyclingRoute } from './smartCyclingRouter';

type MockedBuilder = {
  __setResult(data: unknown[], error?: unknown): void;
  limit: ReturnType<typeof vi.fn>;
};

function routesTable(): MockedBuilder {
  // @ts-expect-error -- attached by the mock factory
  return supabase.__fromMap.routes as MockedBuilder;
}
function trackPointsTable(): MockedBuilder {
  // @ts-expect-error -- attached by the mock factory
  return supabase.__fromMap.track_points as MockedBuilder;
}

const startLocation: [number, number] = [-105.0, 40.0]; // Boulder-ish

beforeEach(() => {
  vi.clearAllMocks();
  routesTable().__setResult([]);
  trackPointsTable().__setResult([]);
});

describe('generateFallbackRoute — Tier 1 (familiar loop)', () => {
  it('returns a familiar route when the user has a matching past ride', async () => {
    routesTable().__setResult([
      {
        id: 'route-1',
        name: 'Morning Boulder Loop',
        distance_km: 30,
        elevation_gain_m: 350,
        elevation_loss_m: 340,
        start_latitude: 40.001,
        start_longitude: -105.001,
        training_goal: 'endurance',
        track_points_count: 200,
      },
    ]);
    const points = Array.from({ length: 50 }, (_, i) => ({
      latitude: 40.0 + i * 0.001,
      longitude: -105.0 + i * 0.001,
    }));
    trackPointsTable().__setResult(points);

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 30,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      userId: 'user-1',
      reason: 'claude_timeout',
    });

    expect(result.fallbackTier).toBe(1);
    expect(result.fallbackReason).toBe('claude_timeout');
    expect(result.isFallback).toBe(true);
    expect(result.coordinates.length).toBeGreaterThan(10);
    expect(result.distance).toBe(30);
    expect(result.source).toBe('fallback_familiar');
  });
});

describe('generateFallbackRoute — Tier 2 (radial loop)', () => {
  it('returns a radial route when the user has no matching past rides', async () => {
    routesTable().__setResult([]); // no familiar rides
    (getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      coordinates: Array.from({ length: 80 }, (_, i) => [
        -105.0 + i * 0.001,
        40.0 + i * 0.001,
      ]),
      distance_m: 30000,
      duration_s: 5400,
      elevation_gain_m: 240,
    });

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 30,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      userId: 'user-1',
      reason: 'claude_error',
    });

    expect(result.fallbackTier).toBe(2);
    expect(result.source).toBe('fallback_radial');
    expect(result.coordinates.length).toBeGreaterThanOrEqual(10);
    expect(getSmartCyclingRoute).toHaveBeenCalledOnce();
  });

  it('returns a radial route when no userId is supplied (skips Tier 1)', async () => {
    (getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      coordinates: Array.from({ length: 80 }, () => [-105.0, 40.0]),
      distance_m: 30000,
    });

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 30,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      reason: 'claude_empty',
    });

    expect(result.fallbackTier).toBe(2);
    expect(getSmartCyclingRoute).toHaveBeenCalledOnce();
  });
});

describe('generateFallbackRoute — Tier 3 (out-and-back)', () => {
  it('falls through to a straight out-and-back when the router is unavailable', async () => {
    routesTable().__setResult([]);
    (getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('all routers down')
    );

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 30,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      userId: 'user-1',
      reason: 'claude_error',
    });

    expect(result.fallbackTier).toBe(3);
    expect(result.source).toBe('fallback_outandback');
    expect(result.coordinates.length).toBeGreaterThan(10);
    // Tier 3 returns to the start point at the end
    const last = result.coordinates[result.coordinates.length - 1];
    expect(Math.abs(last[0] - startLocation[0])).toBeLessThan(1e-6);
    expect(Math.abs(last[1] - startLocation[1])).toBeLessThan(1e-6);
  });

  it('falls to Tier 3 when the router returns too few points', async () => {
    (getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      coordinates: [[-105, 40]], // too few — router degenerate response
      distance_m: 0,
    });

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 30,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      reason: 'claude_error',
    });

    expect(result.fallbackTier).toBe(3);
  });
});

describe('generateFallbackRoute — always returns a usable suggestion', () => {
  it('never throws even when everything fails', async () => {
    routesTable().__setResult([], new Error('db down'));
    (getSmartCyclingRoute as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('router down')
    );

    const result = await generateFallbackRoute({
      startLocation,
      targetDistanceKm: 25,
      trainingGoal: 'endurance',
      routeProfile: 'road',
      userId: 'user-1',
      reason: 'claude_error',
    });

    expect(result.isFallback).toBe(true);
    expect(result.fallbackTier).toBe(3);
    expect(result.coordinates.length).toBeGreaterThan(10);
  });
});
