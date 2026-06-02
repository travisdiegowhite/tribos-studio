import { describe, it, expect } from 'vitest';
import { ROUTE_EDIT_TOOLS, normalizeRouteEdit } from './routeEditTools.js';

const SNAPSHOT = { stats: { distance_km: 28, elevation_gain_m: 320, duration_s: 3600 } };

describe('ROUTE_EDIT_TOOLS', () => {
  it('exposes a single apply_route_edit tool with intent + reasoning required', () => {
    expect(ROUTE_EDIT_TOOLS).toHaveLength(1);
    const tool = ROUTE_EDIT_TOOLS[0];
    expect(tool.name).toBe('apply_route_edit');
    expect(tool.input_schema.required).toEqual(['intent', 'reasoning']);
  });
});

describe('normalizeRouteEdit — validation', () => {
  it('rejects missing input', () => {
    expect(normalizeRouteEdit(null, SNAPSHOT).ok).toBe(false);
  });

  it('rejects a missing intent', () => {
    expect(normalizeRouteEdit({ reasoning: 'x' }, SNAPSHOT).ok).toBe(false);
  });

  it('rejects an unknown intent', () => {
    const r = normalizeRouteEdit({ intent: 'teleport', reasoning: 'x' }, SNAPSHOT);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown intent/);
  });

});

describe('normalizeRouteEdit — simple intents', () => {
  it('normalizes parameterless intents to a bare editIntent', () => {
    for (const intent of ['flatten', 'add_climbing', 'surface_gravel', 'surface_paved', 'scenic', 'faster', 'reverse']) {
      const r = normalizeRouteEdit({ intent, reasoning: 'because' }, SNAPSHOT);
      expect(r.ok).toBe(true);
      expect(r.editIntent).toEqual({ intent });
      expect(r.reasoning).toBe('because');
      expect(typeof r.summary).toBe('string');
    }
  });
});

describe('normalizeRouteEdit — distance intents', () => {
  it('converts an absolute target into a delta distanceModifier', () => {
    const r = normalizeRouteEdit(
      { intent: 'longer', target_distance_km: 45, reasoning: 'x' },
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent.intent).toBe('longer');
    expect(r.editIntent.distanceModifier).toBeCloseTo(17, 5);
  });

  it('handles a shorter target', () => {
    const r = normalizeRouteEdit(
      { intent: 'shorter', target_distance_km: 20, reasoning: 'x' },
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent.distanceModifier).toBeCloseTo(8, 5);
  });

  it('omits distanceModifier when no target is given (v1 uses its 20% default)', () => {
    const r = normalizeRouteEdit({ intent: 'longer', reasoning: 'x' }, SNAPSHOT);
    expect(r.ok).toBe(true);
    expect(r.editIntent.distanceModifier).toBeUndefined();
  });

  it('omits distanceModifier when current distance is unknown', () => {
    const r = normalizeRouteEdit(
      { intent: 'longer', target_distance_km: 45, reasoning: 'x' },
      { stats: {} },
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent.distanceModifier).toBeUndefined();
  });
});

describe('normalizeRouteEdit — location intents', () => {
  it('carries the location through for avoid/detour', () => {
    const r = normalizeRouteEdit(
      { intent: 'avoid', avoid_location: '  Highway 7  ', reasoning: 'x' },
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent).toEqual({ intent: 'avoid', location: 'Highway 7' });
  });

  it('rejects avoid/detour without a location so Claude asks', () => {
    for (const intent of ['avoid', 'detour']) {
      const r = normalizeRouteEdit({ intent, reasoning: 'x' }, SNAPSHOT);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/needs a location/);
    }
  });
});

describe('normalizeRouteEdit — shift_direction', () => {
  it('carries a valid compass direction through (case-insensitive)', () => {
    const r = normalizeRouteEdit(
      { intent: 'shift_direction', direction: 'West', reasoning: 'x' },
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent).toEqual({ intent: 'shift_direction', direction: 'west' });
  });

  it('rejects a missing or invalid direction so Claude asks', () => {
    for (const direction of [undefined, 'up', 'norteast']) {
      const r = normalizeRouteEdit(
        { intent: 'shift_direction', direction, reasoning: 'x' },
        SNAPSHOT,
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/compass direction/);
    }
  });
});

describe('normalizeRouteEdit — add_waypoint', () => {
  it('carries a valid [lng, lat] coordinate through', () => {
    const r = normalizeRouteEdit(
      { intent: 'add_waypoint', waypoint_coords: [-105.27, 40.01], reasoning: 'x' },
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    expect(r.editIntent).toEqual({ intent: 'add_waypoint', waypoint: [-105.27, 40.01] });
  });

  it('rejects missing or out-of-range coordinates', () => {
    for (const waypoint_coords of [undefined, [200, 10], [-105], ['x', 'y']]) {
      const r = normalizeRouteEdit(
        { intent: 'add_waypoint', waypoint_coords, reasoning: 'x' },
        SNAPSHOT,
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/longitude, latitude/);
    }
  });
});
