import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMapillaryImage, mapillaryEnabled, mapillaryTileUrl, mapillaryViewerUrl } from '../mapillary';

afterEach(() => vi.unstubAllEnvs());

describe('mapillary', () => {
  it('is off without a token', async () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', '');
    expect(mapillaryEnabled()).toBe(false);
    const fetchImpl = vi.fn();
    expect(await fetchMapillaryImage('123', fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('builds tile and viewer URLs', () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    expect(mapillaryTileUrl()).toContain('mly1_public/2/{z}/{x}/{y}?access_token=MLY%7Cabc');
    expect(mapillaryViewerUrl('42')).toBe('https://www.mapillary.com/app/?pKey=42');
  });

  it('fetches an image and maps the fields', async () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '42', thumb_1024_url: 'https://img/42.jpg', captured_at: 1700000000000, compass_angle: 90 }),
    });
    const img = await fetchMapillaryImage('42', fetchImpl as unknown as typeof fetch);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('graph.mapillary.com/42?fields=');
    expect(img).toEqual({
      id: '42',
      thumbUrl: 'https://img/42.jpg',
      capturedAt: new Date(1700000000000).toISOString(),
      compassAngle: 90,
    });
  });

  it('rejects non-numeric ids and failed responses', async () => {
    vi.stubEnv('VITE_MAPILLARY_TOKEN', 'MLY|abc');
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchMapillaryImage('../x', fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchMapillaryImage('42', fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
