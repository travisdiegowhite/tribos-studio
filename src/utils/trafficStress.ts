/**
 * trafficStress — Level of Traffic Stress (LTS) from OSM way tags.
 *
 * LTS is the published cycling-comfort classification (Mekuria, Furth &
 * Nixon 2012; used by PeopleForBikes' Bicycle Network Analysis and many
 * DOTs). Four levels:
 *
 *   1  Calm         separated path, or a quiet street almost anyone rides
 *   2  Comfortable  most adults are fine: low speed, few lanes, or a lane
 *   3  Busy         "enthused and confident" riders only
 *   4  High stress  only the "strong and fearless"
 *   0  Unknown      no `highway` tag / not a road
 *
 * The inputs are exactly the tags we can get from Overpass or a BRouter
 * `taggedWays` run: highway class, maxspeed, lanes, cycleway*, shoulder,
 * parking. This replaces three guesses that lived in the codebase: a
 * street-name regex, a constant derived from the rider's own tolerance
 * setting, and a keyword scan of the route name.
 *
 * Pure: no I/O, no React. Unit-tested from tag fixtures. Distances are
 * metres via the canonical haversine (CLAUDE.md distance convention).
 */

import { haversineMeters } from './distanceUnits';

export type Lts = 0 | 1 | 2 | 3 | 4;

export type TrafficTolerance = 'low' | 'medium' | 'high';

export const LTS_COLORS: Record<Lts, string> = {
  1: '#3D8B50', // moss
  2: '#507052', // sage
  3: '#D4820A', // ochre
  4: '#C17C60', // terracotta
  0: '#9A9C90', // muted
};

export const LTS_LABELS: Record<Lts, string> = {
  1: 'Calm',
  2: 'Comfortable',
  3: 'Busy',
  4: 'High stress',
  0: 'Unknown',
};

/** Highway classes that carry no motor traffic worth scoring. */
const SEPARATED_HIGHWAYS = new Set([
  'cycleway',
  'path',
  'footway',
  'pedestrian',
  'track',
  'bridleway',
  'steps',
]);

/** Assumed posted speed (km/h) when `maxspeed` is missing. */
const ASSUMED_SPEED_KPH: Record<string, number> = {
  motorway: 110,
  motorway_link: 80,
  trunk: 90,
  trunk_link: 70,
  primary: 70,
  primary_link: 60,
  secondary: 60,
  secondary_link: 50,
  tertiary: 50,
  tertiary_link: 50,
  unclassified: 50,
  residential: 40,
  living_street: 20,
  service: 20,
  road: 50,
};

/** Assumed total lane count when `lanes` is missing. */
const ASSUMED_LANES: Record<string, number> = {
  motorway: 4,
  motorway_link: 2,
  trunk: 4,
  trunk_link: 2,
  primary: 4,
  primary_link: 2,
  secondary: 2,
  secondary_link: 2,
  tertiary: 2,
  tertiary_link: 2,
  unclassified: 2,
  residential: 2,
  living_street: 2,
  service: 1,
  road: 2,
};

const MPH_TO_KPH = 1.609344;

// Speed bands in km/h with a little slack so the common US postings land
// where a planner would put them: 25 mph = 40.2, 30 mph = 48.3, 40 mph = 64.4.
const SLOW_KPH = 41; // ≤ 25 mph / 40 km/h
const MID_KPH = 51; // ≤ 30 mph / 50 km/h
const FAST_KPH = 66; // ≤ 40 mph / 65 km/h

/**
 * Parse an OSM `maxspeed` value to km/h. Handles `"50"`, `"25 mph"`,
 * `"30 km/h"`, `"30 kph"`. `walk`, `none`, `signals` and anything else
 * unparseable return null so the caller falls back to the class default.
 */
export function parseMaxspeedKph(value: string | undefined | null): number | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  const m = v.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kph|kmh)?$/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === 'mph' ? n * MPH_TO_KPH : n;
}

export function assumedSpeedKph(highway: string | undefined): number {
  if (!highway) return 0;
  if (SEPARATED_HIGHWAYS.has(highway)) return 0;
  return ASSUMED_SPEED_KPH[highway] ?? 50;
}

export function assumedLanes(highway: string | undefined): number {
  if (!highway) return 0;
  if (SEPARATED_HIGHWAYS.has(highway)) return 0;
  return ASSUMED_LANES[highway] ?? 2;
}

function parseLanes(tags: Record<string, string>, highway: string): number {
  const raw = tags.lanes;
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : assumedLanes(highway);
}

export type BikeFacility = 'separated' | 'lane' | 'shoulder' | 'shared' | 'none';

const CYCLEWAY_KEYS = ['cycleway', 'cycleway:both', 'cycleway:right', 'cycleway:left'];

/** What the way offers a cyclist besides the general traffic lane. */
export function bikeFacility(tags: Record<string, string>): BikeFacility {
  const highway = tags.highway;
  if (highway && SEPARATED_HIGHWAYS.has(highway)) return 'separated';
  if (highway === 'path' && tags.bicycle === 'designated') return 'separated';

  let best: BikeFacility = 'none';
  const rank: Record<BikeFacility, number> = { separated: 4, lane: 3, shoulder: 2, shared: 1, none: 0 };
  const consider = (f: BikeFacility) => {
    if (rank[f] > rank[best]) best = f;
  };

  for (const key of CYCLEWAY_KEYS) {
    const v = tags[key];
    if (!v || v === 'no' || v === 'none') continue;
    if (v === 'track' || v === 'separate' || v === 'sidepath') consider('separated');
    else if (v === 'lane' || v === 'opposite_lane' || v === 'share_busway') consider('lane');
    else if (v === 'shared_lane' || v === 'shared' || v === 'opposite') consider('shared');
  }

  const shoulder = tags.shoulder;
  if (shoulder && shoulder !== 'no') consider('shoulder');
  const shoulderWidth = Number.parseFloat(tags['shoulder:width'] ?? '');
  if (Number.isFinite(shoulderWidth) && shoulderWidth >= 1) consider('shoulder');

  return best;
}

/** True when cars park in the lane beside the cyclist (door-zone risk). */
function hasAdjacentParking(tags: Record<string, string>): boolean {
  const PARKING_KEYS = [
    'parking:lane:both',
    'parking:lane:right',
    'parking:lane:left',
    'parking:both',
    'parking:right',
    'parking:left',
  ];
  for (const key of PARKING_KEYS) {
    const v = tags[key];
    if (!v) continue;
    if (v === 'parallel' || v === 'lane' || v === 'street_side' || v === 'diagonal' || v === 'perpendicular') {
      return true;
    }
  }
  return false;
}

function clampLts(n: number): Lts {
  return Math.max(1, Math.min(4, Math.round(n))) as Lts;
}

/**
 * LTS 1–4 for a way's tags, 0 when the way isn't a road at all.
 *
 * Rule ladder, in order:
 *  1. Separated from traffic (cycleway, path, track, cycleway=track) → 1.
 *  2. Motorway → 4.
 *  3. Bike lane / paved shoulder: by speed and lanes; a sharrow is one step
 *     worse than a lane; adjacent parking adds one.
 *  4. Mixed traffic: quiet streets → 1–2, then speed and lane count push
 *     to 3–4; primary/trunk are always 4 without a facility.
 */
export function ltsForTags(tags: Record<string, string> | null | undefined): Lts {
  if (!tags) return 0;
  const highway = tags.highway;
  if (!highway) return 0;
  if (highway === 'proposed' || highway === 'construction' || highway === 'abandoned') return 0;

  const facility = bikeFacility(tags);
  if (facility === 'separated') return 1;
  if (highway === 'motorway' || highway === 'motorway_link') return 4;

  const speed = parseMaxspeedKph(tags.maxspeed) ?? assumedSpeedKph(highway);
  const lanes = parseLanes(tags, highway);
  const parking = hasAdjacentParking(tags) ? 1 : 0;

  if (facility === 'lane' || facility === 'shoulder' || facility === 'shared') {
    let lts: number;
    if (speed <= SLOW_KPH && lanes <= 2) lts = 1;
    else if (speed <= MID_KPH) lts = 2;
    else if (speed <= FAST_KPH) lts = 3;
    else lts = 4;
    if (facility === 'shoulder') lts = Math.max(lts, 2);
    if (facility === 'shared') lts += 1;
    return clampLts(lts + parking);
  }

  // Mixed traffic, no facility.
  if (highway === 'primary' || highway === 'primary_link' || highway === 'trunk' || highway === 'trunk_link') {
    return 4;
  }
  if (highway === 'living_street' || highway === 'service' || speed <= 30) {
    return clampLts(1 + parking);
  }
  if (lanes >= 4 || speed > MID_KPH) return 4;
  if (speed <= SLOW_KPH && lanes <= 2 && (highway === 'residential' || highway === 'unclassified')) {
    return clampLts(2 + parking);
  }
  return clampLts(3 + parking);
}

/** The highest LTS a rider with the given tolerance is happy to ride. */
export function maxLtsForTolerance(tolerance: TrafficTolerance | null | undefined): 2 | 3 | 4 {
  switch (tolerance) {
    case 'low':
      return 2;
    case 'high':
      return 4;
    default:
      return 3;
  }
}

export interface StressSummary {
  totalKm: number;
  knownKm: number;
  kmByLts: Record<Lts, number>;
  /** Share (0–100) of the KNOWN distance at LTS 1–2. */
  quietPct: number;
  /** Share (0–100) of the total distance with no LTS. */
  unknownPct: number;
  /** Mean of (lts − 1) / 3 over known distance; 0 = all calm, 1 = all LTS 4. */
  stressScore: number;
  /** Total km at LTS 4. */
  lts4Km: number;
  /** Longest unbroken stretch at LTS 4, km. */
  maxContinuousLts4Km: number;
}

/**
 * Distance-weighted roll-up of per-segment LTS values. `ltsSegments` has one
 * entry per coordinate segment (`coordinates.length - 1`); when the lengths
 * don't line up every segment is weighted equally.
 */
export function summarizeStress(
  ltsSegments: ReadonlyArray<number>,
  coordinates: ReadonlyArray<ReadonlyArray<number>> | null,
): StressSummary {
  const kmByLts: Record<Lts, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const useLengths =
    Array.isArray(coordinates) && coordinates.length === ltsSegments.length + 1;

  let totalKm = 0;
  let weightedStress = 0;
  let run = 0;
  let maxRun = 0;

  for (let i = 0; i < ltsSegments.length; i++) {
    let km = 0.001; // equal weight fallback (1 m) keeps ratios meaningful
    if (useLengths && coordinates) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      km = haversineMeters(a[1], a[0], b[1], b[0]) / 1000;
    }
    const raw = ltsSegments[i];
    const lts = (raw >= 1 && raw <= 4 ? Math.round(raw) : 0) as Lts;
    kmByLts[lts] += km;
    totalKm += km;
    if (lts > 0) weightedStress += ((lts - 1) / 3) * km;
    if (lts === 4) {
      run += km;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }

  const knownKm = totalKm - kmByLts[0];
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    totalKm: round(totalKm),
    knownKm: round(knownKm),
    kmByLts: {
      0: round(kmByLts[0]),
      1: round(kmByLts[1]),
      2: round(kmByLts[2]),
      3: round(kmByLts[3]),
      4: round(kmByLts[4]),
    },
    quietPct: knownKm > 0 ? Math.round(((kmByLts[1] + kmByLts[2]) / knownKm) * 100) : 0,
    unknownPct: totalKm > 0 ? Math.round((kmByLts[0] / totalKm) * 100) : 100,
    stressScore: knownKm > 0 ? Math.round((weightedStress / knownKm) * 1000) / 1000 : 0,
    lts4Km: round(kmByLts[4]),
    maxContinuousLts4Km: round(maxRun),
  };
}

// ---------------------------------------------------------------------------
// Bike-lane / shoulder coverage: what a rider can point at on the map.
//
// `bikeFacility` treats every car-free way as `separated`, which is right
// for stress but would let a gravel farm track count as a "bike lane". The
// coverage stat therefore splits `separated` into `protected` (a cycleway,
// a cycle track beside the road, a path signed for bikes) and `trail`
// (tracks, footways, bridleways, unsigned paths) and counts only
// protected + lane + shoulder.
// ---------------------------------------------------------------------------

export type FacilityKind = 'protected' | 'lane' | 'shoulder' | 'shared' | 'trail' | 'none' | 'unknown';

const PROTECTED_CYCLEWAY_VALUES = new Set(['track', 'separate', 'sidepath']);

export function facilityForTags(tags: Record<string, string> | null | undefined): FacilityKind {
  if (!tags || !tags.highway) return 'unknown';
  const facility = bikeFacility(tags);
  if (facility !== 'separated') return facility;
  if (tags.highway === 'cycleway') return 'protected';
  if (tags.highway === 'path' && tags.bicycle === 'designated') return 'protected';
  for (const key of CYCLEWAY_KEYS) {
    const v = tags[key];
    if (v && PROTECTED_CYCLEWAY_VALUES.has(v)) return 'protected';
  }
  return 'trail';
}

export interface FacilitySummary {
  totalKm: number;
  knownKm: number;
  kmByKind: Record<FacilityKind, number>;
  /** protected + lane + shoulder km. */
  facilityKm: number;
  /** Share (0–100) of the KNOWN distance on protected + lane + shoulder. */
  facilityPct: number;
}

/**
 * Distance-weighted roll-up of per-segment facility kinds. One entry per
 * coordinate segment; equal weights when the lengths don't line up.
 */
export function summarizeFacilities(
  kinds: ReadonlyArray<FacilityKind>,
  coordinates: ReadonlyArray<ReadonlyArray<number>> | null,
): FacilitySummary {
  const kmByKind: Record<FacilityKind, number> = {
    protected: 0, lane: 0, shoulder: 0, shared: 0, trail: 0, none: 0, unknown: 0,
  };
  const useLengths = Array.isArray(coordinates) && coordinates.length === kinds.length + 1;
  let totalKm = 0;
  for (let i = 0; i < kinds.length; i++) {
    let km = 0.001;
    if (useLengths && coordinates) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      km = haversineMeters(a[1], a[0], b[1], b[0]) / 1000;
    }
    kmByKind[kinds[i] ?? 'unknown'] += km;
    totalKm += km;
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const knownKm = totalKm - kmByKind.unknown;
  const facilityKm = kmByKind.protected + kmByKind.lane + kmByKind.shoulder;
  const out: Record<FacilityKind, number> = { ...kmByKind };
  for (const k of Object.keys(out) as FacilityKind[]) out[k] = round(out[k]);
  return {
    totalKm: round(totalKm),
    knownKm: round(knownKm),
    kmByKind: out,
    facilityKm: round(facilityKm),
    facilityPct: knownKm > 0 ? Math.round((facilityKm / knownKm) * 100) : 0,
  };
}
