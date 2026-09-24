import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TEMPLATES,
  renderProfile,
  renderTribosProfile,
  toleranceLevel,
  tribosParamsFor,
  ensureProfileId,
  forgetProfileId,
  clearProfileIdCache,
} from '../brouterProfiles';
import { fnv1a32 } from '../stableHash';

const SERVER = 'https://brouter.example';

function okResponse(profileid: string) {
  return { ok: true, status: 200, json: async () => ({ profileid }) } as unknown as Response;
}

beforeEach(() => {
  clearProfileIdCache();
});

describe('templates', () => {
  it('ship the Tribos parameter lines and the tags the LTS scorer wants', () => {
    for (const text of Object.values(TEMPLATES)) {
      expect(text).toMatch(/^assign traffic_tolerance = \d\s+# %traffic_tolerance%/m);
      expect(text).toMatch(/tribos_road_penalty/);
      for (const tag of ['maxspeed=', 'lanes=', 'shoulder=', 'lit=', 'cycleway:right=']) expect(text).toContain(tag);
    }
    expect(TEMPLATES.gravel).toMatch(/^assign gravel_target = [\d.]+\s+# %gravel_target%/m);
    expect(TEMPLATES.road).not.toMatch(/%gravel_target%/);
  });
});

describe('renderProfile', () => {
  it('rewrites only the parameter lines and leaves every other byte alone', () => {
    const out = renderProfile(TEMPLATES.gravel, { traffic_tolerance: 2, gravel_target: 0.8 });
    const before = TEMPLATES.gravel.split('\n');
    const after = out.split('\n');
    expect(after.length).toBe(before.length);
    const changed = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);
    expect(changed.length).toBe(2);
    for (const i of changed as number[]) expect(before[i]).toMatch(/# %(traffic_tolerance|gravel_target)%/);
    expect(out).toMatch(/^assign traffic_tolerance = 2\s+# %traffic_tolerance%/m);
    expect(out).toMatch(/^assign gravel_target = 0\.8\s+# %gravel_target%/m);
  });

  it('ignores unknown parameters and keeps the trailing comment intact', () => {
    const tpl = 'assign a = 1 # %a% | doc | number\nassign b = 2\n';
    expect(renderProfile(tpl, { a: 3, zzz: 9 })).toBe('assign a = 3 # %a% | doc | number\nassign b = 2\n');
  });
});

describe('tribosParamsFor / toleranceLevel', () => {
  it('maps tolerance to 0/1/2 with balanced as the default', () => {
    expect(toleranceLevel('low')).toBe(0);
    expect(toleranceLevel('medium')).toBe(1);
    expect(toleranceLevel('high')).toBe(2);
    expect(toleranceLevel(null)).toBe(1);
    expect(toleranceLevel(undefined)).toBe(1);
  });

  it('picks the gravel template for unpaved surfaces with a 0–1 target', () => {
    expect(tribosParamsFor({ surface: 'road', trafficTolerance: 'low' })).toEqual({ template: 'road', traffic_tolerance: 0 });
    expect(tribosParamsFor({ surface: null })).toEqual({ template: 'road', traffic_tolerance: 1 });
    expect(tribosParamsFor({ surface: 'gravel', trafficTolerance: 'high', gravelTargetPct: 70 })).toEqual({
      template: 'gravel',
      traffic_tolerance: 2,
      gravel_target: 0.7,
    });
    expect(tribosParamsFor({ surface: 'mixed' }).gravel_target).toBe(0.5);
    expect(tribosParamsFor({ surface: 'gravel', gravelTargetPct: 250 }).gravel_target).toBe(1);
    expect(tribosParamsFor({ surface: 'gravel', gravelTargetPct: Number.NaN }).gravel_target).toBe(0.5);
  });
});

describe('ensureProfileId', () => {
  const params = { template: 'road' as const, traffic_tolerance: 0 as const };

  it('uploads the rendered text once per server and caches the id', async () => {
    const fetchImpl = vi.fn(async () => okResponse('custom_1'));
    expect(await ensureProfileId(SERVER, params, { fetchImpl })).toBe('custom_1');
    expect(await ensureProfileId(SERVER, params, { fetchImpl })).toBe('custom_1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SERVER}/brouter/profile`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(renderTribosProfile(params));
    // Another server or other params is another upload.
    await ensureProfileId('https://other.example', params, { fetchImpl });
    await ensureProfileId(SERVER, { ...params, traffic_tolerance: 2 }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('reads an id remembered in localStorage without uploading', async () => {
    const key = `${SERVER}|${fnv1a32(renderTribosProfile(params))}`;
    localStorage.setItem('tribos_brouter_profile_ids', JSON.stringify({ [key]: 'custom_stored' }));
    const fetchImpl = vi.fn(async () => okResponse('custom_new'));
    expect(await ensureProfileId(SERVER, params, { fetchImpl })).toBe('custom_stored');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('persists a fresh id to localStorage and forgets it on request', async () => {
    const fetchImpl = vi.fn(async () => okResponse('custom_2'));
    await ensureProfileId(SERVER, params, { fetchImpl });
    const stored = JSON.parse(localStorage.getItem('tribos_brouter_profile_ids') ?? '{}');
    expect(Object.values(stored)).toContain('custom_2');
    forgetProfileId(SERVER, params);
    expect(Object.values(JSON.parse(localStorage.getItem('tribos_brouter_profile_ids') ?? '{}'))).not.toContain('custom_2');
    await ensureProfileId(SERVER, params, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws when the server refuses or answers without an id', async () => {
    const refuse = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    await expect(ensureProfileId(SERVER, params, { fetchImpl: refuse })).rejects.toThrow(/500/);
    const empty = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response);
    await expect(ensureProfileId(SERVER, params, { fetchImpl: empty })).rejects.toThrow(/no id/);
  });
});
