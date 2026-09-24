/**
 * brouterProfiles — the Tribos routing profiles, rendered per rider and
 * uploaded to the BRouter server in use.
 *
 * A BRouter profile is a cost function over every OSM way tag (see
 * routing-profiles/*.brf, derived from the stock trekking profile). Rider
 * parameters are ordinary `assign name = value # %name% …` lines, exactly
 * the convention brouter-web's profile editor uses, so `renderProfile`
 * rewrites those lines and nothing else. The server accepts the text at
 * `POST /brouter/profile` and answers with a `custom_…` id that routes
 * immediately (verified on brouter.de and true of the self-hosted server,
 * which runs the same code). Ids are cached per server + rendered text in
 * memory and localStorage; a server that has forgotten one gets a fresh
 * upload on the next request.
 */

import roadTemplate from '../../routing-profiles/tribos-road.brf?raw';
import gravelTemplate from '../../routing-profiles/tribos-gravel.brf?raw';
import { fnv1a32 } from './stableHash';
import type { TrafficTolerance } from './trafficStress';

export type TribosTemplate = 'road' | 'gravel';

export interface TribosParams {
  template: TribosTemplate;
  /** 0 quiet, 1 balanced, 2 direct — the Road comfort setting. */
  traffic_tolerance: 0 | 1 | 2;
  /** Share of the ride wanted unpaved, 0–1; gravel template only. */
  gravel_target?: number;
}

export const TEMPLATES: Record<TribosTemplate, string> = {
  road: roadTemplate,
  gravel: gravelTemplate,
};

const STORAGE_KEY = 'tribos_brouter_profile_ids';
const memory = new Map<string, string>();

/** Rewrite the `assign name = value # %name% …` parameter lines only. */
export function renderProfile(template: string, params: Record<string, number | boolean | string>): string {
  return template.replace(
    /^(assign\s+(\w+)\s*=\s*)([^\s#]+)(\s*#\s*%\2%.*)$/gm,
    (line, head: string, name: string, _value: string, tail: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? `${head}${String(params[name])}${tail}` : line,
  );
}

export function toleranceLevel(tolerance: TrafficTolerance | null | undefined): 0 | 1 | 2 {
  if (tolerance === 'low') return 0;
  if (tolerance === 'high') return 2;
  return 1;
}

/** Rider settings → profile parameters. */
export function tribosParamsFor(input: {
  surface?: string | null;
  trafficTolerance?: TrafficTolerance | null;
  gravelTargetPct?: number | null;
}): TribosParams {
  const gravel = input.surface === 'gravel' || input.surface === 'mixed' || input.surface === 'mountain' || input.surface === 'mtb';
  const params: TribosParams = {
    template: gravel ? 'gravel' : 'road',
    traffic_tolerance: toleranceLevel(input.trafficTolerance),
  };
  if (gravel) {
    const pct = typeof input.gravelTargetPct === 'number' && Number.isFinite(input.gravelTargetPct) ? input.gravelTargetPct : 50;
    params.gravel_target = Math.round(Math.max(0, Math.min(100, pct))) / 100;
  }
  return params;
}

/** The profile text for these params. */
export function renderTribosProfile(params: TribosParams): string {
  const values: Record<string, number> = { traffic_tolerance: params.traffic_tolerance };
  if (params.template === 'gravel') values.gravel_target = params.gravel_target ?? 0.5;
  return renderProfile(TEMPLATES[params.template], values);
}

function cacheKey(serverBase: string, text: string): string {
  return `${serverBase}|${fnv1a32(text)}`;
}

function readStorage(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStorage(entries: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable: memory cache still works */
  }
}

export interface EnsureProfileOptions {
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The `custom_…` id for these params on this server, uploading once and
 * caching. Throws when the upload fails (callers fall back to a named
 * profile).
 */
export async function ensureProfileId(
  serverBase: string,
  params: TribosParams,
  options: EnsureProfileOptions = {},
): Promise<string> {
  const text = renderTribosProfile(params);
  const key = cacheKey(serverBase, text);
  const cached = memory.get(key) ?? readStorage()[key];
  if (cached) {
    memory.set(key, cached);
    return cached;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const resp = await fetchImpl(`${serverBase}/brouter/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  });
  if (!resp.ok) throw new Error(`BRouter profile upload failed: ${resp.status}`);
  const data = (await resp.json()) as { profileid?: string };
  if (!data?.profileid) throw new Error('BRouter profile upload returned no id');
  memory.set(key, data.profileid);
  writeStorage({ ...readStorage(), [key]: data.profileid });
  return data.profileid;
}

/** Drop a cached id (the server no longer knows it). */
export function forgetProfileId(serverBase: string, params: TribosParams): void {
  const key = cacheKey(serverBase, renderTribosProfile(params));
  memory.delete(key);
  const entries = readStorage();
  if (key in entries) {
    delete entries[key];
    writeStorage(entries);
  }
}

export function clearProfileIdCache(): void {
  memory.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
