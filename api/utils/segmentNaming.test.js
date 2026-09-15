import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const matchRoadNames = vi.fn();
vi.mock('./mapboxMapMatching.js', async () => {
  const actual = await vi.importActual('./mapboxMapMatching.js');
  return { ...actual, matchRoadNames: (...args) => matchRoadNames(...args) };
});

import {
  composeSegmentName,
  isGenericSegmentName,
  nameTrainingSegment,
  nameTrainingSegments,
  reverseGeocodePlace,
} from './segmentNaming.js';

/** A tiny supabase stand-in: one table, filter chain, maybeSingle/update. */
function fakeSupabase(rows) {
  const updates = [];
  const from = () => {
    const filters = [];
    const chain = {
      select: () => chain,
      eq: (col, val) => {
        filters.push([col, val]);
        return chain;
      },
      maybeSingle: async () => {
        const row = rows.find((r) => filters.every(([c, v]) => r[c] === v));
        return { data: row ?? null, error: null };
      },
      update: (patch) => ({
        eq: async (col, val) => {
          const row = rows.find((r) => r[col] === val);
          if (row) Object.assign(row, patch);
          updates.push({ [col]: val, ...patch });
          return { error: null };
        },
      }),
    };
    return chain;
  };
  return { from, updates };
}

const geo = [
  [-105.0582, 40.0294],
  [-105.06, 40.03],
];

function segmentRow(over = {}) {
  return {
    id: 's1',
    user_id: 'u1',
    geojson: { type: 'LineString', coordinates: geo },
    auto_name: 'Rolling 14.7km',
    custom_name: null,
    start_lat: 40.0294,
    start_lng: -105.0582,
    terrain_type: 'rolling',
    distance_meters: 14694,
    ...over,
  };
}

describe('isGenericSegmentName', () => {
  it("recognises the detector's own names, with or without a place prefix", () => {
    expect(isGenericSegmentName('Rolling 14.7km')).toBe(true);
    expect(isGenericSegmentName('Flat 2.1km')).toBe(true);
    expect(isGenericSegmentName('Descent 21.5km')).toBe(true);
    expect(isGenericSegmentName('115 min Climb 4.6%')).toBe(true);
    expect(isGenericSegmentName('Climb 1.2km 6.0%')).toBe(true);
    expect(isGenericSegmentName('Niwot Rolling 14.7km')).toBe(true);
    expect(isGenericSegmentName(null)).toBe(true);
    expect(isGenericSegmentName('  ')).toBe(true);
  });

  it('treats road names and athlete names as meaningful', () => {
    expect(isGenericSegmentName('Nelson Rd → 63rd St')).toBe(false);
    expect(isGenericSegmentName('Lookout loop')).toBe(false);
    expect(isGenericSegmentName('Flatirons Vista')).toBe(false);
  });
});

describe('composeSegmentName', () => {
  it('prefers roads, then place + terrain + distance, then nothing', () => {
    expect(composeSegmentName({ roads: ['Nelson Rd', '63rd St'], place: 'Niwot' })).toEqual({
      name: 'Nelson Rd → 63rd St',
      source: 'roads',
    });
    expect(composeSegmentName({ roads: [], place: 'Niwot', terrainType: 'rolling', distanceMeters: 14694 })).toEqual({
      name: 'Niwot Rolling 14.7km',
      source: 'place',
    });
    expect(composeSegmentName({ roads: [], place: 'Niwot', terrainType: 'climb', distanceMeters: null })).toEqual({
      name: 'Niwot Climb',
      source: 'place',
    });
    expect(composeSegmentName({ roads: [], place: null })).toEqual({ name: null, source: 'none' });
  });
});

describe('reverseGeocodePlace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the feature text and swallows failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ text: 'Niwot' }] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await reverseGeocodePlace(40.03, -105.06, { token: 'pk.t' })).toBe('Niwot');
    expect(fetchMock.mock.calls[0][0]).toContain('/-105.06,40.03.json');
    expect(await reverseGeocodePlace(40.03, -105.06, { token: 'pk.t' })).toBeNull();
    expect(await reverseGeocodePlace(40.03, -105.06, { token: 'pk.t' })).toBeNull();
    expect(await reverseGeocodePlace(NaN, -105.06, { token: 'pk.t' })).toBeNull();
  });
});

describe('nameTrainingSegment', () => {
  beforeEach(() => {
    matchRoadNames.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [{ text: 'Niwot' }] }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes the road name over a generic one and reports it', async () => {
    matchRoadNames.mockResolvedValue({ roads: ['Nelson Rd', '63rd St', 'Niwot Rd', 'Nelson Rd'], confidence: 0.8 });
    const db = fakeSupabase([segmentRow()]);
    const out = await nameTrainingSegment(db, 's1', { userId: 'u1', token: 'pk.t' });
    expect(out).toMatchObject({
      segmentId: 's1',
      auto_name: 'Nelson Rd → 63rd St → Niwot Rd',
      display_name: 'Nelson Rd → 63rd St → Niwot Rd',
      custom_name: null,
      source: 'roads',
    });
    expect(db.updates).toEqual([{ id: 's1', auto_name: 'Nelson Rd → 63rd St → Niwot Rd' }]);
    // No geocode needed when the roads are known.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the athlete name on top and never touches custom_name', async () => {
    matchRoadNames.mockResolvedValue({ roads: ['Nelson Rd'], confidence: 0.8 });
    const db = fakeSupabase([segmentRow({ custom_name: 'Tuesday loop' })]);
    const out = await nameTrainingSegment(db, 's1', { userId: 'u1' });
    expect(out.display_name).toBe('Tuesday loop');
    expect(out.auto_name).toBe('Nelson Rd');
    expect(db.updates).toEqual([{ id: 's1', auto_name: 'Nelson Rd' }]);
  });

  it('falls back to the place when the matcher has nothing', async () => {
    matchRoadNames.mockResolvedValue(null);
    const db = fakeSupabase([segmentRow()]);
    const out = await nameTrainingSegment(db, 's1', { userId: 'u1' });
    expect(out).toMatchObject({ auto_name: 'Niwot Rolling 14.7km', source: 'place' });
  });

  it('leaves a meaningful name alone when the matcher fails, and says why', async () => {
    matchRoadNames.mockRejectedValue(new Error('MapMatching 422: bad'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeSupabase([segmentRow({ auto_name: 'Spine Rd → 36th St' })]);
    const out = await nameTrainingSegment(db, 's1', { userId: 'u1' });
    expect(out).toMatchObject({ auto_name: 'Spine Rd → 36th St', source: 'unchanged', error: 'MapMatching 422: bad' });
    expect(db.updates).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not rewrite an unchanged generic name and scopes the read to the user', async () => {
    matchRoadNames.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    const db = fakeSupabase([segmentRow()]);
    expect((await nameTrainingSegment(db, 's1', { userId: 'u1' })).source).toBe('unchanged');
    expect(db.updates).toEqual([]);
    expect((await nameTrainingSegment(db, 's1', { userId: 'someone-else' })).source).toBe('missing');
  });

  it('skips a segment without drawable geometry', async () => {
    const db = fakeSupabase([segmentRow({ geojson: null })]);
    expect((await nameTrainingSegment(db, 's1')).source).toBe('unchanged');
    expect(matchRoadNames).not.toHaveBeenCalled();
  });
});

describe('nameTrainingSegments', () => {
  beforeEach(() => matchRoadNames.mockReset());

  it('walks the list in order and stops at the time budget, reporting the rest', async () => {
    matchRoadNames.mockResolvedValue({ roads: ['Rd'], confidence: 0.9 });
    const db = fakeSupabase([segmentRow({ id: 'a' }), segmentRow({ id: 'b' }), segmentRow({ id: 'c' })]);
    let t = 0;
    const now = () => {
      t += 5000;
      return t;
    };
    const out = await nameTrainingSegments(db, 'u1', ['a', 'b', 'c'], { budgetMs: 9000, delayMs: 0, now });
    expect(out.processed).toBe(2);
    expect(out.remaining).toEqual(['c']);
    expect(out.results.map((r) => r.segmentId)).toEqual(['a', 'b']);
  });

  it('always names at least the first segment even on a tiny budget', async () => {
    matchRoadNames.mockResolvedValue({ roads: ['Rd'], confidence: 0.9 });
    const db = fakeSupabase([segmentRow({ id: 'a' })]);
    const out = await nameTrainingSegments(db, 'u1', ['a'], { budgetMs: 0, delayMs: 0 });
    expect(out.processed).toBe(1);
    expect(out.remaining).toEqual([]);
  });
});
