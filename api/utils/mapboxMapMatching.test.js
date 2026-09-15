import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildAutoNameFromGeometry, joinRoadNames, matchRoadNames, _internal } from './mapboxMapMatching.js';

const COORDS = [
  [-105.0582, 40.0294],
  [-105.06, 40.03],
  [-105.062, 40.031],
];

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const step = (name) => ({ name });

describe('matchRoadNames', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for steps (not a name annotation) with a snap radius per point', async () => {
    fetchMock.mockResolvedValue(
      response({ code: 'Ok', matchings: [{ confidence: 0.9, distance: 1000, legs: [{ steps: [step('Nelson Rd')] }] }] }),
    );
    await matchRoadNames(COORDS, { token: 'pk.test' });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/matching/v5/mapbox/cycling/');
    expect(url).toContain('steps=true');
    expect(url).not.toContain('annotations=name');
    expect(url).toContain(`radiuses=${_internal.SNAP_RADIUS_M};${_internal.SNAP_RADIUS_M};${_internal.SNAP_RADIUS_M}`);
    expect(url).toContain('access_token=pk.test');
  });

  it('reads road names off the steps in order, collapsing repeats and blanks', async () => {
    fetchMock.mockResolvedValue(
      response({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.8,
            distance: 5000,
            legs: [
              { steps: [step('Nelson Rd'), step('Nelson Rd'), step(''), step('63rd St')] },
              { steps: [step('63rd St'), step('Niwot Rd'), step('Nelson Rd')] },
            ],
          },
        ],
      }),
    );
    const match = await matchRoadNames(COORDS, { token: 'pk.test' });
    expect(match).toEqual({ roads: ['Nelson Rd', '63rd St', 'Niwot Rd', 'Nelson Rd'], confidence: 0.8 });
  });

  it('reads names across several matchings but judges confidence on the longest', async () => {
    fetchMock.mockResolvedValue(
      response({
        code: 'Ok',
        matchings: [
          { confidence: 0.05, distance: 100, legs: [{ steps: [step('Alley')] }] },
          { confidence: 0.7, distance: 9000, legs: [{ steps: [step('Main Rd')] }] },
        ],
      }),
    );
    const match = await matchRoadNames(COORDS, { token: 'pk.test' });
    expect(match).toEqual({ roads: ['Alley', 'Main Rd'], confidence: 0.7 });
  });

  it('returns null on a low-confidence match, no named steps, or a non-Ok body', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ code: 'Ok', matchings: [{ confidence: 0.1, distance: 900, legs: [{ steps: [step('Guess St')] }] }] }),
    );
    expect(await matchRoadNames(COORDS, { token: 'pk.test' })).toBeNull();
    fetchMock.mockResolvedValueOnce(
      response({ code: 'Ok', matchings: [{ confidence: 0.9, distance: 900, legs: [{ steps: [step(''), {}] }] }] }),
    );
    expect(await matchRoadNames(COORDS, { token: 'pk.test' })).toBeNull();
    fetchMock.mockResolvedValueOnce(response({ code: 'NoMatch', matchings: [] }));
    expect(await matchRoadNames(COORDS, { token: 'pk.test' })).toBeNull();
  });

  it('throws on an HTTP error so the caller can log it rather than write a bad name', async () => {
    fetchMock.mockResolvedValue(response({ message: 'Invalid input' }, false, 422));
    await expect(matchRoadNames(COORDS, { token: 'pk.test' })).rejects.toThrow(/MapMatching 422/);
  });

  it('refuses to run without a token and with fewer than two points', async () => {
    const saved = { a: process.env.MAPBOX_ACCESS_TOKEN, b: process.env.VITE_MAPBOX_TOKEN };
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.VITE_MAPBOX_TOKEN;
    try {
      await expect(matchRoadNames(COORDS)).rejects.toThrow(/not configured/);
    } finally {
      if (saved.a != null) process.env.MAPBOX_ACCESS_TOKEN = saved.a;
      if (saved.b != null) process.env.VITE_MAPBOX_TOKEN = saved.b;
    }
    expect(await matchRoadNames([COORDS[0]], { token: 'pk.test' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downsamples long tracks to the API limit of 100 points', async () => {
    fetchMock.mockResolvedValue(
      response({ code: 'Ok', matchings: [{ confidence: 0.9, distance: 100, legs: [{ steps: [step('Rd')] }] }] }),
    );
    const long = Array.from({ length: 700 }, (_, i) => [-105 + i / 10000, 40 + i / 10000]);
    await matchRoadNames(long, { token: 'pk.test' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    const points = url.pathname.split('/').pop().split(';');
    expect(points).toHaveLength(100);
    expect(url.searchParams.get('radiuses').split(';')).toHaveLength(100);
  });
});

describe('buildAutoNameFromGeometry / joinRoadNames', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('joins at most three roads with arrows', async () => {
    expect(joinRoadNames(['A', 'B', 'C', 'D'])).toBe('A → B → C');
    expect(joinRoadNames([])).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ code: 'Ok', matchings: [{ confidence: 0.9, distance: 100, legs: [{ steps: [step('Spine Rd'), step('36th St')] }] }] }),
      ),
    );
    expect(await buildAutoNameFromGeometry(COORDS, { token: 'pk.test' })).toBe('Spine Rd → 36th St');
  });
});
