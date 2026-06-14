import { describe, it, expect } from 'vitest';
import {
  buildRoutePlanningPrompt,
  parseRoutePlanningResponse,
} from '../naturalLanguagePrompt';

describe('buildRoutePlanningPrompt', () => {
  it('includes the region label and asks for 3 real-waypoint plans', () => {
    const prompt = buildRoutePlanningPrompt('50% gravel loop', {
      regionLabel: 'Longmont, Colorado',
    });
    expect(prompt).toContain('Longmont, Colorado');
    expect(prompt).toMatch(/3 route plans|EXACTLY 3/i);
    expect(prompt).toContain('gravelTargetPct');
    expect(prompt).toContain('"routes"');
    // Must demand real geocodable names, not coordinates.
    expect(prompt).toMatch(/geocodable/i);
  });

  it('falls back to a region-agnostic prompt with no region label', () => {
    const prompt = buildRoutePlanningPrompt('gravel loop', {});
    expect(prompt).toMatch(/region unknown/i);
    expect(prompt).toContain('gravelTargetPct');
  });
});

describe('parseRoutePlanningResponse', () => {
  it('parses a 3-plan response, keeping names, rationale, waypoints', () => {
    const json = JSON.stringify({
      direction: 'northeast',
      distance_km: 72.4,
      surfaceType: 'gravel',
      gravelTargetPct: 50,
      routeType: 'loop',
      routes: [
        { name: 'A', rationale: 'r1', waypoints: ['Hygiene', 'Berthoud'] },
        { name: 'B', rationale: 'r2', waypoints: ['Mead'] },
      ],
    });
    const parsed = parseRoutePlanningResponse(`Here you go:\n${json}\nDone.`);
    expect(parsed.direction).toBe('northeast');
    expect(parsed.distance_km).toBe(72.4);
    expect(parsed.gravelTargetPct).toBe(50);
    expect(parsed.routes).toHaveLength(2);
    expect(parsed.routes[0]).toMatchObject({ name: 'A', rationale: 'r1' });
    expect(parsed.routes[0].waypoints).toEqual(['Hygiene', 'Berthoud']);
  });

  it('drops plans with no waypoints and clamps the gravel target', () => {
    const json = JSON.stringify({
      gravelTargetPct: 150,
      routes: [
        { name: 'Good', waypoints: ['Niwot'] },
        { name: 'Empty', waypoints: [] },
        { name: 'Missing' },
      ],
    });
    const parsed = parseRoutePlanningResponse(json);
    expect(parsed.gravelTargetPct).toBe(100);
    expect(parsed.routes).toHaveLength(1);
    expect(parsed.routes[0].name).toBe('Good');
  });

  it('defaults gracefully and throws only when no JSON is present', () => {
    const parsed = parseRoutePlanningResponse('{"routes":[{"waypoints":["X"]}]}');
    expect(parsed.surfaceType).toBe('mixed');
    expect(parsed.routeType).toBe('loop');
    expect(parsed.gravelTargetPct).toBeNull();
    expect(() => parseRoutePlanningResponse('no json here')).toThrow();
  });
});
