import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  POI_CATEGORIES,
  buildPOIQuery,
  classifyPOI,
  queryPOIsAlongRoute,
  clearPOICache,
} from '../routePOIService';

const BBOX = { south: 39.9, west: -105.3, north: 40.1, east: -105.1 };

describe('routePOIService — coffee category', () => {
  it('defines coffee so the RB2 Coffee toggle has a query', () => {
    expect(POI_CATEGORIES.coffee).toBeDefined();
    const q = buildPOIQuery(BBOX, ['coffee']);
    expect(q).toContain('node[amenity=cafe];');
    expect(q).toContain('node[shop=coffee];');
  });

  it('classifies a café as coffee when coffee is requested', () => {
    expect(classifyPOI({ amenity: 'cafe' }, ['coffee'])).toBe('coffee');
  });

  it('still classifies a café as food when only food is requested', () => {
    expect(classifyPOI({ amenity: 'cafe' }, ['food'])).toBe('food');
  });

  it('prefers coffee over food when both are requested, restaurants stay food', () => {
    expect(classifyPOI({ amenity: 'cafe' }, ['food', 'coffee'])).toBe('coffee');
    expect(classifyPOI({ amenity: 'restaurant' }, ['food', 'coffee'])).toBe('food');
  });

  it('returns null for an element none of the requested categories accept', () => {
    expect(classifyPOI({ amenity: 'restaurant' }, ['coffee'])).toBeNull();
    expect(classifyPOI(undefined as unknown as Record<string, string>, ['coffee'])).toBeNull();
  });
});

describe('queryPOIsAlongRoute — coffee', () => {
  const route: [number, number][] = [
    [-105.27, 40.01],
    [-105.25, 40.02],
  ];

  beforeEach(() => {
    clearPOICache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          elements: [
            { id: 1, lat: 40.0101, lon: -105.2699, tags: { amenity: 'cafe', name: 'Spoke Coffee' } },
            { id: 2, lat: 40.0151, lon: -105.2601, tags: { amenity: 'restaurant', name: 'Diner' } },
          ],
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns cafés for the coffee layer and does not mutate the categories array', async () => {
    const categories = ['coffee'];
    const pois = await queryPOIsAlongRoute(route, categories);
    expect(pois.map((p: { name: string }) => p.name)).toEqual(['Spoke Coffee']);
    expect(pois[0].category).toBe('coffee');
    expect(categories).toEqual(['coffee']);
  });
});
