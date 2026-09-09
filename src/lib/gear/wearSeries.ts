/**
 * assembleBikeHistory — the pure half of the Garage bike page.
 *
 * Takes one bike, its components (replaced ones included) and every ride
 * linked to it, and returns everything the page draws: a wear row per part
 * with a plain-language sentence, a cumulative wear series per part life for
 * the "wear over time" rows, a ride strip bucketed by day or week on the same
 * time domain, season totals, and the page's verdict sentence.
 *
 * No React, no Supabase, no Date.now(): `now` is an input so the whole thing
 * is unit-testable. Mirrors the queries/assembler split in
 * src/views/today-spine/getTodaySpine.ts.
 *
 * Units: every distance in and out is METERS (T1.1). Formatting for
 * sentences happens here once; components format axis ticks themselves.
 *
 * Wear model: effective wear = Σ distance × surface factor × wet factor
 * (api/utils/gearCatalog.js). Until weather is stamped on rides
 * (activity_conditions), wet is unknown for every ride and the effective
 * number is a floor — `isLowerBound` says so and the UI captions it.
 */

import {
  getCatalogPart,
  effectiveWearMeters,
  classifyRideSurface,
  METERS_PER_MILE,
  type Surface,
  type WearModel,
  type CatalogPart,
} from './catalog';
import { activityDateKey } from '../../utils/dateUtils';

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface RideInput {
  id: string;
  name: string | null;
  startDate: string | null;        // ISO, UTC
  startDateLocal: string | null;   // fake-UTC local wall time (string-slice it)
  distanceM: number;
  movingTimeS: number | null;
  type: string | null;             // 'Ride' | 'GravelRide' | 'VirtualRide' | …
  trainer: boolean;
  surfaceOverride: string | null;  // activity_gear.surface_override
  isWet: boolean | null;           // activity_conditions.is_wet; null = unknown
}

export interface ComponentInput {
  id: string;
  componentType: string;
  brand: string | null;
  model: string | null;
  status: 'active' | 'replaced';
  installedDate: string | null;    // YYYY-MM-DD
  replacedDate: string | null;     // YYYY-MM-DD
  distanceAtInstallM: number;
  warningThresholdM: number | null;
  replaceThresholdM: number | null;
  createdAt: string | null;        // fallback when installedDate is null
}

export interface BikeInput {
  id: string;
  name: string;
  category: string | null;
  totalDistanceLoggedM: number;
  isTrainerBike: boolean;
  purchasePrice: number | null;
}

// ── Outputs ────────────────────────────────────────────────────────────────

export type WearLevel = 'ok' | 'warning' | 'replace' | 'unknown';
export type WearWord = 'fresh' | 'wearing in' | 'nearly done' | 'past due';

export interface ComponentWear {
  componentId: string;
  componentType: string;
  label: string;
  brand: string | null;
  model: string | null;
  status: 'active' | 'replaced';
  wearModel: WearModel;
  /** odometer − distance_at_install: the number the alert engine uses today. */
  rawWearM: number;
  /** Σ effectiveWearMeters over the rides in this part's life. */
  effectiveWearM: number;
  wetM: number;
  offroadM: number;
  indoorM: number;
  warningM: number | null;
  replaceM: number | null;
  ageDays: number | null;
  serviceMonths: number | null;
  /** 0..1.25, effective/replace (or age/service). 0 for 'none'. */
  pct: number;
  level: WearLevel;
  word: WearWord | null;
  /** "Chain is nearly done — 1,380 of 1,500 miles." */
  sentence: string;
  isLowerBound: boolean;
}

export interface WearPoint { t: number; cumM: number }
export interface WearEvent { t: number; kind: 'install' | 'replace' }

export interface WearSeries {
  componentId: string;
  componentType: string;
  label: string;
  level: WearLevel;
  /** true for the part currently on the bike (drawn in colour; past lives in grey). */
  current: boolean;
  replaceM: number | null;
  startT: number;
  endT: number | null;
  /** cumulative wear at startT (rides before the domain window). */
  startM: number;
  points: WearPoint[];
  events: WearEvent[];
}

export interface RideBucket {
  t: number;                 // bucket start, local midnight epoch ms
  key: string;               // YYYY-MM-DD of the bucket start
  distanceM: number;
  bySurface: Record<Surface, number>;
  wetM: number;
  rideIds: string[];
}

export interface SeasonTotals {
  distanceM: number;
  wetM: number;
  offroadM: number;
  indoorM: number;
  rides: number;
  partsReplaced: number;
  /** currency per unit distance (mi or km per `unit`), or null without a price. */
  costPerUnit: number | null;
}

export interface BikeHistory {
  componentWear: ComponentWear[];
  wearSeries: WearSeries[];
  rideStrip: RideBucket[];
  domain: { startT: number; endT: number; bucket: 'day' | 'week'; startKey: string; endKey: string };
  totals: SeasonTotals;
  verdict: string;
  unit: 'mi' | 'km';
  isLowerBound: boolean;
}

export interface AssembleInput {
  bike: BikeInput;
  components: ComponentInput[];
  rides: RideInput[];
  useImperial: boolean;
  now?: Date;
  /** How far back the timeline looks. Default 365 days. */
  windowDays?: number;
}

// ── Date helpers (local calendar days, YYYY-MM-DD keys) ────────────────────

const DAY_MS = 86_400_000;

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Local midnight for a YYYY-MM-DD key. */
export function keyToLocalMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key: string, n: number): string {
  const d = keyToLocalMidnight(key);
  d.setDate(d.getDate() + n);
  return dateKeyOf(d);
}
/** Monday of the week containing the key. */
function mondayOf(key: string): string {
  const d = keyToLocalMidnight(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return dateKeyOf(d);
}
function rideKey(r: RideInput): string | null {
  return activityDateKey({ start_date_local: r.startDateLocal, start_date: r.startDate });
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatWhole(m: number, useImperial: boolean): string {
  const v = useImperial ? m / METERS_PER_MILE : m / 1000;
  return Math.round(v).toLocaleString('en-US');
}
function unitWord(useImperial: boolean): string { return useImperial ? 'miles' : 'km'; }

// ── Classification ─────────────────────────────────────────────────────────

export function wordFor(pct: number, warningPct: number): WearWord {
  if (pct >= 1) return 'past due';
  if (pct >= warningPct) return 'nearly done';
  if (pct >= 0.5) return 'wearing in';
  return 'fresh';
}
function levelFor(word: WearWord | null): WearLevel {
  if (word === 'past due') return 'replace';
  if (word === 'nearly done') return 'warning';
  if (word === null) return 'unknown';
  return 'ok';
}

function lifeBounds(c: ComponentInput, bikeFallbackKey: string): { fromKey: string; toKey: string | null } {
  const fromKey = c.installedDate || (c.createdAt ? dateKeyOf(new Date(c.createdAt)) : bikeFallbackKey);
  return { fromKey, toKey: c.replacedDate };
}

// ── The assembler ──────────────────────────────────────────────────────────

export function assembleBikeHistory(input: AssembleInput): BikeHistory {
  const { bike, components, useImperial } = input;
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 365;
  const unit: 'mi' | 'km' = useImperial ? 'mi' : 'km';

  // Rides sorted ascending with their local day key and surface resolved once.
  const rides = input.rides
    .map((r) => ({ r, key: rideKey(r) }))
    .filter((x): x is { r: RideInput; key: string } => Boolean(x.key))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ r, key }) => ({
      r,
      key,
      surface: classifyRideSurface({
        surfaceOverride: r.surfaceOverride,
        activityType: r.type,
        trainer: r.trainer || bike.isTrainerBike,
        bikeCategory: bike.category,
      }) as Surface,
      wet: r.isWet === true,
    }));

  const isLowerBound = !rides.some((x) => x.r.isWet !== null);

  // Domain: last `windowDays`, clipped to the oldest ride when history is shorter.
  const todayKey = dateKeyOf(now);
  const oldestRideKey = rides[0]?.key ?? todayKey;
  const windowStartKey = addDays(todayKey, -(windowDays - 1));
  const startKey = oldestRideKey > windowStartKey ? oldestRideKey : windowStartKey;
  const spanDays = Math.round((keyToLocalMidnight(todayKey).getTime() - keyToLocalMidnight(startKey).getTime()) / DAY_MS) + 1;
  const bucket: 'day' | 'week' = spanDays <= 120 ? 'day' : 'week';
  const domainStartKey = bucket === 'week' ? mondayOf(startKey) : startKey;
  const domain = {
    startT: keyToLocalMidnight(domainStartKey).getTime(),
    endT: keyToLocalMidnight(todayKey).getTime() + DAY_MS,
    bucket,
    startKey: domainStartKey,
    endKey: todayKey,
  };

  // Ride strip: pre-seeded so empty days/weeks are real zeros.
  const buckets = new Map<string, RideBucket>();
  for (let k = domainStartKey; k <= todayKey; k = addDays(k, bucket === 'day' ? 1 : 7)) {
    buckets.set(k, { t: keyToLocalMidnight(k).getTime(), key: k, distanceM: 0, bySurface: { road: 0, offroad: 0, indoor: 0 }, wetM: 0, rideIds: [] });
  }
  const totals: SeasonTotals = { distanceM: 0, wetM: 0, offroadM: 0, indoorM: 0, rides: 0, partsReplaced: 0, costPerUnit: null };
  for (const x of rides) {
    if (x.key < domainStartKey) continue;
    const bk = bucket === 'day' ? x.key : mondayOf(x.key);
    const b = buckets.get(bk);
    if (!b) continue;
    const d = Math.max(0, x.r.distanceM || 0);
    b.distanceM += d;
    b.bySurface[x.surface] += d;
    if (x.wet) b.wetM += d;
    b.rideIds.push(x.r.id);
    totals.distanceM += d;
    totals.rides += 1;
    if (x.wet) totals.wetM += d;
    if (x.surface === 'offroad') totals.offroadM += d;
    if (x.surface === 'indoor') totals.indoorM += d;
  }
  const rideStrip = [...buckets.values()];

  // Per-component wear and series.
  const bikeFallbackKey = oldestRideKey;
  const componentWear: ComponentWear[] = [];
  const wearSeries: WearSeries[] = [];

  for (const c of components) {
    const part = getCatalogPart(c.componentType) as CatalogPart | null;
    const label = part?.label ?? c.componentType;
    const wearModel: WearModel = part?.wearModel ?? 'distance';
    const { fromKey, toKey } = lifeBounds(c, bikeFallbackKey);
    const replaceM = c.replaceThresholdM ?? part?.replaceMeters ?? null;
    const warningM = c.warningThresholdM ?? part?.warningMeters ?? null;

    let effectiveWearM = 0; let wetM = 0; let offroadM = 0; let indoorM = 0;
    const points: WearPoint[] = [];
    let startM = 0;

    if (wearModel === 'distance') {
      for (const x of rides) {
        if (x.key < fromKey) continue;
        if (toKey && x.key >= toKey) continue;
        const d = Math.max(0, x.r.distanceM || 0);
        effectiveWearM += effectiveWearMeters(c.componentType, d, { surface: x.surface, wet: x.wet });
        if (x.wet) wetM += d;
        if (x.surface === 'offroad') offroadM += d;
        if (x.surface === 'indoor') indoorM += d;
        if (x.key < domainStartKey) { startM = effectiveWearM; continue; }
        const t = keyToLocalMidnight(x.key).getTime();
        const last = points[points.length - 1];
        if (last && last.t === t) last.cumM = effectiveWearM;
        else points.push({ t, cumM: effectiveWearM });
      }
    }

    const rawWearM = Math.max(0, (bike.totalDistanceLoggedM || 0) - (c.distanceAtInstallM || 0));
    const ageDays = Math.max(0, Math.round((keyToLocalMidnight(toKey ?? todayKey).getTime() - keyToLocalMidnight(fromKey).getTime()) / DAY_MS));
    const serviceMonths = part?.serviceMonths ?? null;

    let pct = 0; let word: WearWord | null = null; let sentence: string;
    const units = unitWord(useImperial);
    if (wearModel === 'distance' && replaceM) {
      pct = Math.min(1.25, effectiveWearM / replaceM);
      word = wordFor(effectiveWearM / replaceM, warningM ? warningM / replaceM : 0.8);
      sentence = `${label} is ${word} — ${formatWhole(effectiveWearM, useImperial)} of ${formatWhole(replaceM, useImperial)} ${units}` +
        (wetM > 0 ? `, ${formatWhole(wetM, useImperial)} of them in the wet.` : '.');
    } else if ((wearModel === 'time' || wearModel === 'hours') && serviceMonths) {
      const months = ageDays / 30.44;
      pct = Math.min(1.25, months / serviceMonths);
      word = wordFor(months / serviceMonths, 0.8);
      sentence = `${label} is ${word} — ${Math.round(months)} of ${serviceMonths} months.`;
    } else {
      sentence = `${label} — tracked for its specs, not wear.`;
    }
    const level = levelFor(word);

    componentWear.push({
      componentId: c.id, componentType: c.componentType, label, brand: c.brand, model: c.model, status: c.status,
      wearModel, rawWearM, effectiveWearM, wetM, offroadM, indoorM, warningM, replaceM,
      ageDays: wearModel === 'distance' ? null : ageDays, serviceMonths, pct, level, word, sentence, isLowerBound,
    });

    if (wearModel === 'distance') {
      const startT = Math.max(domain.startT, keyToLocalMidnight(fromKey).getTime());
      const endT = toKey ? keyToLocalMidnight(toKey).getTime() : null;
      if (endT === null || endT >= domain.startT) {
        const events: WearEvent[] = [];
        if (keyToLocalMidnight(fromKey).getTime() >= domain.startT) events.push({ t: keyToLocalMidnight(fromKey).getTime(), kind: 'install' });
        if (endT !== null) events.push({ t: endT, kind: 'replace' });
        wearSeries.push({
          componentId: c.id, componentType: c.componentType, label, level, current: c.status === 'active',
          replaceM, startT, endT, startM, points, events,
        });
      }
    }
    if (c.status === 'replaced' && c.replacedDate && c.replacedDate >= domainStartKey) totals.partsReplaced += 1;
  }

  // Active parts first, then by how far along they are.
  componentWear.sort((a, b) => (a.status === b.status ? b.pct - a.pct : a.status === 'active' ? -1 : 1));

  if (bike.purchasePrice && bike.totalDistanceLoggedM > 0) {
    const dist = useImperial ? bike.totalDistanceLoggedM / METERS_PER_MILE : bike.totalDistanceLoggedM / 1000;
    totals.costPerUnit = bike.purchasePrice / dist;
  }

  return {
    componentWear, wearSeries, rideStrip, domain, totals, unit, isLowerBound,
    verdict: buildVerdict(componentWear.filter((c) => c.status === 'active'), useImperial),
  };
}

/** The page's one sentence. Worst part first; two problems get a lead-in. */
export function buildVerdict(active: ComponentWear[], useImperial: boolean): string {
  const due = active.filter((c) => c.level === 'replace');
  const soon = active.filter((c) => c.level === 'warning');
  const problems = [...due, ...soon];
  if (problems.length === 0) {
    return active.length === 0 ? 'No parts tracked yet. Show me the bike and I\'ll list them.' : 'Everything is fresh. Nothing needs doing.';
  }
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  if (problems.length === 1) return problems[0].sentence;
  const [a, b] = problems;
  const count = problems.length === 2 ? 'Two' : problems.length === 3 ? 'Three' : String(problems.length);
  const rest = problems.length > 2 ? ` And ${problems.length - 2} more.` : '';
  return `${count} things need doing. The ${lower(a.label)} is ${a.word}, and the ${lower(b.label)} is ${b.word} — ${formatWhole(b.effectiveWearM, useImperial)} of ${b.replaceM ? formatWhole(b.replaceM, useImperial) : '?'} ${unitWord(useImperial)}.${rest}`;
}
