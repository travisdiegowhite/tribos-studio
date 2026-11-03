import { describe, it, expect } from 'vitest';
import type { Coordinate } from '../../types/geo';
import type { ComfortClass } from '../comfortLevels';
import type { ComfortClassResult } from '../comfortClass';
import { haversineMeters } from '../distanceUnits';
import { allComfortCopy } from '../comfortLevels';
import {
  planComfortRoute,
  returnedRoutes,
  meetsAcceptance,
  candidateNote,
  refusalMessage,
  LADDER_CONFIG,
  type RouteCall,
  type RoutedLine,
  type LadderDeps,
  type ComfortRouteRequest,
} from '../comfortLadder';

const START: Coordinate = [-105.2705, 40.015];
const ABSOLUTES = /\b(never|always|guaranteed)\b/i;

const result = (cls: ComfortClass, reasons: string[] = []): ComfortClassResult => ({
  cls,
  confidence: 'tagged',
  reasons,
  worstCaseCls: cls,
  speedMph: null,
});

/**
 * Fake engine: densify the waypoint polygon into ~100 m segments, report a
 * road distance of 1.3× the polygon (the loop generator's default road
 * factor, so a request lands on its target), and classify each segment with
 * `paint(call, segmentIndex, segmentCount)`.
 */
function fakeEngine(paint: (call: RouteCall, i: number, n: number) => ComfortClass, opts: { fail?: (call: RouteCall) => boolean } = {}) {
  const calls: RouteCall[] = [];
  const route = async (call: RouteCall): Promise<RoutedLine> => {
    calls.push(call);
    if (opts.fail?.(call)) throw new Error('brouter 400: target island detected for section 1');
    const coords: Coordinate[] = [];
    let polygon_m = 0;
    for (let k = 0; k < call.waypoints.length - 1; k++) {
      const a = call.waypoints[k];
      const b = call.waypoints[k + 1];
      const leg_m = haversineMeters(a[1], a[0], b[1], b[0]);
      polygon_m += leg_m;
      const steps = Math.max(1, Math.round(leg_m / 100));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        coords.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    coords.push(call.waypoints[call.waypoints.length - 1]);
    const n = coords.length - 1;
    const segmentClasses = Array.from({ length: n }, (_, i) => result(paint(call, i, n), ['45 mph', 'no shoulder']));
    return { coordinates: coords, distance_m: polygon_m * 1.3, segmentClasses };
  };
  return { route, calls };
}

const req = (over: Partial<ComfortRouteRequest> = {}): ComfortRouteRequest => ({
  start: START,
  targetDistance_km: 30,
  level: 2,
  surface: 'road',
  bearingDeg: 0,
  clockwise: true,
  ...over,
});

/** Loop direction as the fake can see it: is the second waypoint east or west of the start? */
const goesEast = (call: RouteCall) => call.waypoints[1][0] > call.waypoints[0][0];

function expectAllAccepted(plan: Awaited<ReturnType<typeof planComfortRoute>>) {
  for (const c of returnedRoutes(plan)) {
    expect(meetsAcceptance(c)).toBe(true);
    expect(c.validation.level).toBe(c.level);
  }
}

describe('planComfortRoute — step 1, warn and route', () => {
  it('returns ok in one call when the request passes', async () => {
    const eng = fakeEngine(() => 1);
    const plan = await planComfortRoute(req(), { route: eng.route });
    expect(plan.outcome).toBe('ok');
    expect(plan.route?.kind).toBe('primary');
    expect(plan.route?.validation.passes).toBe(true);
    expect(plan.calls).toBe(1);
    expect(eng.calls[0].level).toBe(2);
  });

  it('keeps short flagged stretches as heads-ups', async () => {
    // One 100 m class-3 segment at Comfort 2.
    const eng = fakeEngine((_, i) => (i === 10 ? 3 : 1));
    const plan = await planComfortRoute(req(), { route: eng.route });
    expect(plan.outcome).toBe('ok');
    expect(plan.route!.validation.headsUps.filter((h) => h.kind === 'flagged')).toHaveLength(1);
    expectAllAccepted(plan);
  });
});

describe('step 2, alternatives', () => {
  it('offers the other direction when the request crosses a blocked road', async () => {
    // Blocked road only on loops whose first leg heads the way the request's does.
    let badEast: boolean | null = null;
    const eng = fakeEngine((call, i) => {
      badEast ??= goesEast(call);
      return goesEast(call) === badEast && i === 20 ? 5 : 1;
    });
    const plan = await planComfortRoute(req({ clockwise: true }), { route: eng.route });
    expect(plan.outcome).toBe('alternatives');
    expect(plan.route).toBeNull();
    const shape = plan.alternatives.find((a) => a.kind === 'shape');
    expect(shape).toBeDefined();
    expect(shape!.note).toMatch(/instead|different loop/i);
    expectAllAccepted(plan);
  });

  it('never returns a failing route', async () => {
    // Only the 75% loop is clean.
    const eng = fakeEngine((call, i) => {
      const short = call.waypoints.length && haversineMeters(call.waypoints[0][1], call.waypoints[0][0], call.waypoints[1][1], call.waypoints[1][0]) < 5500;
      return !short && i === 5 ? 5 : 1;
    });
    const plan = await planComfortRoute(req(), { route: eng.route });
    expect(plan.outcome).toBe('alternatives');
    const d = plan.alternatives.find((a) => a.kind === 'distance');
    expect(d).toBeDefined();
    expect(d!.note).toMatch(/mi instead of 19 mi/);
    expectAllAccepted(plan);
  });

  it('offers "ride it at Comfort L+1" with what that adds, re-using a routed line', async () => {
    // Class 5 for 100 m everywhere: blocked at 2, a short flagged stretch at 3.
    const eng = fakeEngine((_, i) => (i === 30 ? 5 : 1));
    const plan = await planComfortRoute(req(), { route: eng.route });
    expect(plan.outcome).toBe('alternatives');
    const up = plan.alternatives.find((a) => a.kind === 'comfort_up');
    expect(up).toBeDefined();
    expect(up!.level).toBe(3);
    expect(up!.comfortUp?.fromLevel).toBe(2);
    expect(up!.note).toMatch(/^At Comfort 3: adds 0\.1 mi of 45 mph, no shoulder$/);
    expect(up!.validation.passes).toBe(true);
    expect(plan.alternatives.length).toBeLessThanOrEqual(LADDER_CONFIG.maxAlternatives);
    // No extra call steering for L+1 was needed.
    expect(eng.calls.every((c) => c.level === 2)).toBe(true);
    expectAllAccepted(plan);
  });

  it('has no comfort_up at Comfort 5', async () => {
    const eng = fakeEngine(() => 'X');
    const plan = await planComfortRoute(req({ level: 5 }), { route: eng.route });
    expect(plan.outcome).toBe('refused');
    expect(plan.refusal?.tryLevel).toBeNull();
  });
});

describe('step 3, refuse', () => {
  it('refuses with a plain message when nothing passes, within budget', async () => {
    const eng = fakeEngine(() => 'X');
    const plan = await planComfortRoute(req(), { route: eng.route, allowNearbyStart: true });
    expect(plan.outcome).toBe('refused');
    expect(plan.refusal?.message).toBe(refusalMessage(2));
    expect(plan.refusal?.tryLevel).toBe(3);
    expect(returnedRoutes(plan)).toHaveLength(0);
    expect(plan.calls).toBeLessThanOrEqual(LADDER_CONFIG.budget);
    expect(eng.calls.length).toBe(plan.calls);
  });

  it('suggests a nearby start that passes', async () => {
    // Clean only from starts away from the original.
    const eng = fakeEngine((call) => {
      const [lng, lat] = call.waypoints[0];
      return haversineMeters(lat, lng, START[1], START[0]) > 1000 ? 1 : 'X';
    });
    const plan = await planComfortRoute(req(), { route: eng.route, allowNearbyStart: true });
    expect(plan.outcome).toBe('refused');
    expect(plan.refusal?.nearbyStart?.kind).toBe('nearby_start');
    expect(plan.refusal?.nearbyStart?.note).toMatch(/^Start .* mi away$/);
    expectAllAccepted(plan);
  });

  it('skips the nearby-start search when not allowed (brouter.de fallback)', async () => {
    const eng = fakeEngine(() => 'X');
    const plan = await planComfortRoute(req(), { route: eng.route, allowNearbyStart: false });
    expect(plan.tried.some((t) => t.kind === 'nearby_start')).toBe(false);
  });

  it('suggests a shorter loop when that passes', async () => {
    const eng = fakeEngine((call) => (call.waypoints.length && haversineMeters(call.waypoints[0][1], call.waypoints[0][0], call.waypoints[1][1], call.waypoints[1][0]) < 4000 ? 1 : 'X'));
    const plan = await planComfortRoute(req(), { route: eng.route });
    expect(plan.outcome).toBe('refused');
    expect(plan.refusal?.shorter?.kind).toBe('shorter');
    expectAllAccepted(plan);
  });

  it('honours a smaller budget', async () => {
    const eng = fakeEngine(() => 'X');
    const plan = await planComfortRoute(req(), { route: eng.route, budget: 4, allowNearbyStart: true });
    expect(eng.calls.length).toBeLessThanOrEqual(4);
    expect(plan.calls).toBeLessThanOrEqual(4);
  });
});

describe('engine failures', () => {
  it('rethrows when nothing routed at all (an engine problem, not a refusal)', async () => {
    const eng = fakeEngine(() => 1, { fail: () => true });
    await expect(planComfortRoute(req(), { route: eng.route })).rejects.toThrow(/target island/);
  });

  it('treats some failed calls as "no route there" and carries on', async () => {
    let badEast: boolean | null = null;
    const eng = fakeEngine(() => 1, {
      fail: (c) => {
        badEast ??= goesEast(c);
        return goesEast(c) === badEast;
      },
    });
    const plan = await planComfortRoute(req({ clockwise: true }), { route: eng.route });
    expect(plan.outcome).toBe('alternatives');
    expect(plan.tried.some((t) => t.error)).toBe(true);
    expectAllAccepted(plan);
  });

  it('aborts on a fatal error (throttling)', async () => {
    const route = async () => {
      const e = new Error('slow down');
      e.name = 'ThrottledError';
      throw e;
    };
    const deps: LadderDeps = { route, isFatal: (e) => e instanceof Error && e.name === 'ThrottledError' };
    await expect(planComfortRoute(req(), deps)).rejects.toThrow('slow down');
  });
});

describe('copy', () => {
  it('has no absolutes', async () => {
    const eng = fakeEngine((_, i) => (i === 30 ? 5 : 1));
    const plan = await planComfortRoute(req(), { route: eng.route });
    const lines = [...plan.alternatives.map((a) => a.note ?? ''), refusalMessage(2), ...allComfortCopy()];
    for (const l of lines) expect(l).not.toMatch(ABSOLUTES);
  });

  it('names the direction change', () => {
    const base = {
      kind: 'shape' as const,
      level: 2 as const,
      start: START,
      targetDistance_km: 30,
      bearingDeg: 0,
      clockwise: false,
      waypoints: [],
      coordinates: [],
      distance_m: 30_000,
      validation: {} as never,
    };
    expect(candidateNote(base, req({ clockwise: true }))).toBe('Counter-clockwise instead');
  });
});
