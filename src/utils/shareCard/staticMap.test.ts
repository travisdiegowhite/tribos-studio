import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShareMapUrl } from './staticMap';
import type { LngLat } from './geometry';

function syntheticRoute(points: number): LngLat[] {
  const coords: LngLat[] = [];
  for (let i = 0; i < points; i++) {
    // Wander so consecutive deltas stay non-trivial (worst-ish case encoding).
    coords.push([
      -105.27 + Math.sin(i / 7) * 0.2 + i * 0.0002,
      40.0 + Math.cos(i / 11) * 0.2 + i * 0.0001,
    ]);
  }
  return coords;
}

describe('buildShareMapUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'test-token');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for fewer than 2 coords', () => {
    expect(buildShareMapUrl({ coords: [], theme: 'dark', width_px: 476, height_px: 285 })).toBeNull();
    expect(
      buildShareMapUrl({ coords: [[-105.27, 40.0]], theme: 'dark', width_px: 476, height_px: 285 }),
    ).toBeNull();
  });

  it('stays under the URL length cap even for a 5000-point route', () => {
    const url = buildShareMapUrl({
      coords: syntheticRoute(5000),
      theme: 'dark',
      width_px: 476,
      height_px: 285,
    });
    expect(url).toBeTruthy();
    expect((url as string).length).toBeLessThan(7500);
  });

  it('selects the map style from the card theme', () => {
    const coords = syntheticRoute(10);
    const dark = buildShareMapUrl({ coords, theme: 'dark', width_px: 476, height_px: 285 });
    const light = buildShareMapUrl({ coords, theme: 'light', width_px: 476, height_px: 285 });
    expect(dark).toContain('/styles/v1/mapbox/dark-v11/');
    expect(light).toContain('/styles/v1/mapbox/outdoors-v12/');
  });

  it('requests retina output and suppresses the baked-in attribution (we draw our own)', () => {
    const url = buildShareMapUrl({
      coords: syntheticRoute(10),
      theme: 'dark',
      width_px: 476,
      height_px: 285,
    });
    expect(url).toContain('476x285@2x');
    expect(url).toContain('logo=false');
    expect(url).toContain('attribution=false');
  });

  it('returns null without a Mapbox token', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '');
    expect(
      buildShareMapUrl({ coords: syntheticRoute(10), theme: 'dark', width_px: 476, height_px: 285 }),
    ).toBeNull();
  });
});
