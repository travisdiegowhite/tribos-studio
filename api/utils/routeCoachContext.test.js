import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildRouteCoachSystemPrompt,
  collectRouteCoachContext,
} from './routeCoachContext.js';

// Keep getRouteWeather inert (it short-circuits to null without a key) so
// the collect tests never hit the network.
beforeEach(() => {
  vi.stubEnv('OPENWEATHER_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const ROUTE_SNAPSHOT = {
  geometry: {
    type: 'LineString',
    coordinates: [
      [-105.27, 40.01],
      [-105.28, 40.02],
    ],
  },
  stats: { distance_km: 97.7, elevation_gain_m: 1147, duration_s: 14400 },
  routeProfile: 'road',
  startLocation: [-105.27, 40.01],
};

const PRESCRIPTION = {
  name: 'Z2 Endurance Ride',
  category: 'endurance',
  durationMin: 60,
  targetRSS: 55,
  coachNotes: null,
};

const FITNESS_STATE = {
  weeklyLoadRSS: 320,
  tfi: 62,
  afi: 55,
  formScore: 4,
  formBand: 'grey zone',
  fsConfidence: 0.9,
  fsConfidenceTier: 'high',
  lastHardDayDaysAgo: 2,
  rssSource: 'power',
  latestDate: '2026-08-09',
};

function buildPrompt(overrides = {}) {
  return buildRouteCoachSystemPrompt({
    persona: null,
    prescription: PRESCRIPTION,
    fitnessState: FITNESS_STATE,
    familiarRoads: null,
    weather: null,
    routeSnapshot: ROUTE_SNAPSHOT,
    userLocalDate: { dateString: 'Monday, August 10, 2026' },
    ...overrides,
  });
}

describe('buildRouteCoachSystemPrompt — plan-aware mode (default)', () => {
  it('includes the prescription and fitness blocks', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('PRESCRIBED WORKOUT');
    expect(prompt).toContain('Z2 Endurance Ride');
    expect(prompt).toContain('FITNESS STATE');
  });

  it('frames the prescription as context, not a constraint', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('context, not a constraint');
    expect(prompt).toContain('always outranks the plan');
    expect(prompt).not.toContain('should remain compatible with this prescription');
  });
});

describe('buildRouteCoachSystemPrompt — free ride mode (planAware: false)', () => {
  it('omits prescription and fitness blocks even when the data is present', () => {
    const prompt = buildPrompt({ planAware: false });
    expect(prompt).not.toContain('PRESCRIBED WORKOUT');
    expect(prompt).not.toContain('Z2 Endurance Ride');
    expect(prompt).not.toContain('FITNESS STATE');
  });

  it('adds the free-ride section telling the coach to stay off the plan', () => {
    const prompt = buildPrompt({ planAware: false });
    expect(prompt).toContain('FREE RIDE');
    expect(prompt).toContain('NOT linked to a\ntraining plan');
  });

  it('still includes the current route stats', () => {
    const prompt = buildPrompt({ planAware: false });
    expect(prompt).toContain('CURRENT ROUTE');
    expect(prompt).toContain('97.7 km');
  });
});

describe('buildRouteCoachSystemPrompt — units', () => {
  it('defaults to metric narration', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('Distance: 97.7 km');
    expect(prompt).toContain('Elevation gain: 1,147 m');
    expect(prompt).toContain('KILOMETERS and METERS');
  });

  it('renders the current route in miles/feet for imperial riders', () => {
    const prompt = buildPrompt({ units: 'imperial' });
    // 97.7 km ≈ 60.7 mi; 1147 m ≈ 3763 ft
    expect(prompt).toContain('Distance: 60.7 mi');
    expect(prompt).toContain('Elevation gain: 3,763 ft');
    expect(prompt).toContain('MILES and FEET');
  });

  it('always pins tool parameters to metric', () => {
    for (const units of ['metric', 'imperial']) {
      const prompt = buildPrompt({ units });
      expect(prompt).toContain('Tool parameters are ALWAYS metric');
    }
  });
});

describe('buildRouteCoachSystemPrompt — restore guidance', () => {
  it('tells the coach how to handle undo/revert requests', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain("intent 'restore_previous'");
  });
});

describe('collectRouteCoachContext — planAware: false', () => {
  it('does not query planned_workouts or training_load_daily', async () => {
    const queriedTables = [];
    const fakeSupabase = {
      from(table) {
        queriedTables.push(table);
        // Minimal thenable query builder: every method chains, awaiting
        // resolves to an empty result.
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (resolve) => resolve({ data: null, error: null }),
        };
        return builder;
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };

    const ctx = await collectRouteCoachContext(fakeSupabase, 'user-1', ROUTE_SNAPSHOT, {
      planAware: false,
    });

    expect(queriedTables).not.toContain('planned_workouts');
    expect(queriedTables).not.toContain('training_load_daily');
    expect(ctx.prescription).toBeNull();
    expect(ctx.fitnessState).toBeNull();
  });

  it('queries both plan tables when planAware is true (default)', async () => {
    const queriedTables = [];
    const fakeSupabase = {
      from(table) {
        queriedTables.push(table);
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (resolve) => resolve({ data: null, error: null }),
        };
        return builder;
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };

    await collectRouteCoachContext(fakeSupabase, 'user-1', ROUTE_SNAPSHOT);

    expect(queriedTables).toContain('planned_workouts');
    expect(queriedTables).toContain('training_load_daily');
  });
});
