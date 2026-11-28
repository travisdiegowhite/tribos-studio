import { describe, it, expect } from 'vitest';
import { DEVICE_GUIDES } from '../deviceGuides';

describe('device guides', () => {
  it('COROS gets a GPX, Hammerhead a FIT', () => {
    expect(DEVICE_GUIDES.coros.format).toBe('gpx');
    expect(DEVICE_GUIDES.hammerhead.format).toBe('fit');
  });

  it('rider copy has no absolutes', () => {
    for (const g of Object.values(DEVICE_GUIDES)) {
      for (const line of [g.title, g.menuLabel, ...g.steps]) {
        expect(line).not.toMatch(/\\b(never|always|guarantee[sd]?|guaranteed)\\b/i);
      }
    }
  });
});
