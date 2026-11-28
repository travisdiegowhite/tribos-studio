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

describe('routePOIService — groceries, lodging, camping, repair stations', () => {
  it('queries areas (nwr) with centres for lodging, nodes only otherwise', () => {
    const lodging = buildPOIQuery(BBOX, ['lodging']);
    expect(lodging).toContain('nwr[tourism=hotel];');
    expect(lodging).toContain('out center;');
    const water = buildPOIQuery(BBOX, ['water']);
    expect(water).toContain('out body;');
    expect(water).not.toContain('nwr[');
  });

  it('a repair station is a repair station even with bike shops on', () => {
    expect(classifyPOI({ amenity: 'bicycle_repair_station' }, ['bike_shop', 'repair_station'])).toBe('repair_station');
    expect(classifyPOI({ amenity: 'bicycle_repair_station' }, ['bike_shop'])).toBe('bike_shop');
  });

  it('a convenience store is groceries when groceries are on, food otherwise', () => {
    expect(classifyPOI({ shop: 'convenience' }, ['food', 'groceries'])).toBe('groceries');
    expect(classifyPOI({ shop: 'convenience' }, ['food'])).toBe('food');
  });
});

describe('queryPOIsAlongRoute — areas and wider corridors', () => {
  const route: [number, number][] = [
    [-105.27, 40.01],
    [-105.25, 40.02],
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('places a hotel mapped as a building at its centre, ~1.5 km off the route', async () => {
    clearPOICache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          elements: [
            // ~1.4 km north of the route's start: inside lodging's 2 km corridor.
            { type: 'way', id: 77, center: { lat: 40.0226, lon: -105.27 }, tags: { tourism: 'hotel', name: 'Trail Inn' } },
            { type: 'node', id: 77, lat: 40.0101, lon: -105.2699, tags: { tourism: 'hostel', name: 'Bunkhouse' } },
          ],
        }),
      })),
    );
    const pois = await queryPOIsAlongRoute(route, ['lodging']);
    const names = pois.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['Bunkhouse', 'Trail Inn']);
    const ids = pois.map((p: { id: string | number }) => String(p.id)).sort();
    expect(ids).toEqual(['77', 'way/77']);
  });
});
