/**
 * comfortClass — road comfort class 1–5 (or X, closed to bikes) for one OSM
 * way. This is the routing contract (docs/COMFORT-ROUTING-SPEC.md §1); LTS
 * (`trafficStress.ts`) stays an input-side tool, not the output.
 *
 *   1  Paths and quiet streets
 *   2  Quiet connectors, bike lanes
 *   3  Busier roads with room for you
 *   4  Fast roads with a shoulder
 *   5  Fast roads with no space
 *   X  Closed to bikes
 *
 * Confidence:
 *   tagged   speed (and the road's type) come from data
 *   assumed  class defaults that are reliable for the road type (a
 *            residential street, a primary, an unpaved road)
 *   unknown  a paved unclassified/tertiary/secondary road with no speed
 *            limit — could be a 25 mph lane or a 55 mph county road. The
 *            class is computed from the default speed for display; the
 *            validator treats it as "flag, don't block" (decision
 *            2026-11-02) and `worstCaseCls` says what it could be.
 *
 * Unpaved roads are low traffic (decision 2026-11-02): `highway=track` is 1,
 * any other unpaved road is capped at `unpavedMaxClass` (2).
 *
 * `reasons[]` are shown to riders on heads-up cards; every string comes from
 * `REASONS` or a speed/lane formatter, and the copy test greps them.
 *
 * Pure: no I/O. Browser and Node.
 */

import type { ComfortClass } from './comfortLevels';
import { assumedLanes, assumedSpeedKph, bikeFacility, parseMaxspeedKph, type BikeFacility } from './trafficStress';
import { inferSurface } from './surfaceInference';

export type { ComfortClass } from './comfortLevels';
export type ComfortConfidence = 'tagged' | 'assumed' | 'unknown';

/**
 * Conflated per-way data (spec §6) that overrides OSM. Every field is
 * optional; whatever is present wins over the tag.
 */
export interface ComfortExtras {
  maxspeed_mph?: number | null;
  lanes?: number | null;
  shoulder_ft?: number | null;
  aadt?: number | null;
}

export interface ComfortClassResult {
  cls: ComfortClass;
  confidence: ComfortConfidence;
  /** Short plain strings a rider can read: "40 mph", "bike lane", "no shoulder". */
  reasons: string[];
  /**
   * The class if the unknowns are as bad as they plausibly get (55 mph, no
   * shoulder). Equals `cls` unless confidence is `unknown`.
   */
  worstCaseCls: ComfortClass;
  /** Effective speed used, mph (rounded); null for paths. */
  speedMph: number | null;
}

/**
 * Thresholds, in mph. Starting values; the harness tunes them. Comparisons
 * allow `speedSlackMph` because BRouter's lookup table (lookups.dat) buckets
 * maxspeed and reports the bucket's first value: 40 = 25 mph, 50 = 30 mph,
 * 60 = 35 OR 40 mph, 70 = 45, 80 = 50, 90 = 55, 100 = 60–65 mph.
 *
 * The 60 bucket can't tell 35 from 40 mph, so BRouter-sourced 35 mph roads
 * read as 40 (one class worse in mixed traffic). That's the cautious
 * direction; Overpass tags and conflated data (§6) carry the exact value.
 */
export const COMFORT_CLASS_CONFIG = {
  speedSlackMph: 2,
  quietMph: 25,
  lowMph: 30,
  midMph: 35,
  busyMph: 40,
  ruralShoulderMph: 45,
  fastMph: 55,
  /** Assumed speed for an unknown paved rural road in the worst case. */
  worstCaseMph: 55,
  manyLanes: 4,
  /** Unpaved roads (not tracks) never rate above this. */
  unpavedMaxClass: 2 as 1 | 2 | 3,
  /** Shoulder width (ft) that counts as room to ride, from conflated data. */
  minShoulderFt: 3,
} as const;

export const REASONS = {
  closedToBikes: 'closed to bikes',
  bikePath: 'bike path',
  separatedLane: 'separated bike lane',
  quietStreet: 'quiet street',
  bikeLane: 'bike lane',
  shoulder: 'paved shoulder',
  sharrow: 'shared lane markings',
  noShoulder: 'no shoulder',
  noBikeSpace: 'no bike lane or shoulder',
  busyHighway: 'main highway',
  bikesAllowedHighway: 'highway shoulder, bikes allowed',
  gravelRoad: 'gravel road, light traffic',
  track: 'dirt or farm track',
  speedNotMapped: 'speed limit not mapped',
} as const;

const MPH_PER_KPH = 1 / 1.609344;

const SEPARATED = new Set(['cycleway', 'path', 'footway', 'pedestrian', 'track', 'bridleway', 'steps']);
const MAIN_HIGHWAYS = new Set(['primary', 'primary_link', 'trunk', 'trunk_link']);
const QUIET_HIGHWAYS = new Set(['residential', 'unclassified', 'living_street', 'service', 'road']);
/** Paved classes where a missing maxspeed means "we don't know". */
const UNKNOWN_SPEED_HIGHWAYS = new Set(['unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link']);
const UNBUILT = new Set(['proposed', 'construction', 'abandoned', 'razed', 'disused']);
const BIKE_YES = new Set(['yes', 'designated', 'permissive', 'official']);
const NO_ACCESS = new Set(['no', 'private']);

/** "40 mph" — rounded to the nearest 5, which is how limits are posted. */
export function speedReason(mph: number): string {
  return `${Math.round(mph / 5) * 5} mph`;
}

export function lanesReason(lanes: number): string {
  return `${lanes} lanes`;
}

function atMost(mph: number, limit: number): boolean {
  return mph <= limit + COMFORT_CLASS_CONFIG.speedSlackMph;
}

function parseLaneCount(tags: Record<string, string>, highway: string, extras?: ComfortExtras): { lanes: number; tagged: boolean } {
  if (typeof extras?.lanes === 'number' && extras.lanes > 0) return { lanes: extras.lanes, tagged: true };
  const n = Number.parseInt(tags.lanes ?? '', 10);
  if (Number.isFinite(n) && n > 0) return { lanes: n, tagged: true };
  return { lanes: assumedLanes(highway), tagged: false };
}

function isClosedToBikes(tags: Record<string, string>): boolean {
  const bicycle = tags.bicycle;
  if (bicycle === 'no' || bicycle === 'private' || bicycle === 'use_sidepath') return true;
  if (bicycle && BIKE_YES.has(bicycle)) return false;
  if (NO_ACCESS.has(tags.access ?? '') || NO_ACCESS.has(tags.vehicle ?? '')) return true;
  return false;
}

const SIDE_SHOULDER_KEYS = ['shoulder:right', 'shoulder:left', 'shoulder:both'];
const CYCLEWAY_KEYS = ['cycleway', 'cycleway:both', 'cycleway:right', 'cycleway:left'];
/**
 * `cycleway=shoulder` is the US convention for a rideable shoulder, and
 * bare `cycleway=yes` is mostly used the same way; neither is a marked lane,
 * so both read as a shoulder (the cautious reading).
 */
const CYCLEWAY_AS_SHOULDER = new Set(['shoulder', 'yes']);

function facilityFor(tags: Record<string, string>, extras?: ComfortExtras): BikeFacility {
  const f = bikeFacility(tags);
  if (f !== 'none' && f !== 'shared') return f;
  // bikeFacility (LTS) reads only `shoulder`; OSM also tags each side.
  for (const k of CYCLEWAY_KEYS) {
    if (CYCLEWAY_AS_SHOULDER.has(tags[k] ?? '')) return 'shoulder';
  }
  for (const k of SIDE_SHOULDER_KEYS) {
    const v = tags[k];
    if (v && v !== 'no' && v !== 'none') return 'shoulder';
  }
  if (typeof extras?.shoulder_ft === 'number' && extras.shoulder_ft >= COMFORT_CLASS_CONFIG.minShoulderFt) {
    return 'shoulder';
  }
  return f;
}

function isUnpaved(tags: Record<string, string>): boolean {
  const inf = inferSurface(tags);
  if (inf.category !== 'gravel' && inf.category !== 'unpaved') return false;
  // `highway=path|bridleway` alone is a guess about the path, not the road;
  // those are separated anyway.
  return inf.evidence === 'surface' || inf.evidence === 'tracktype' || inf.evidence === 'smoothness' || tags.highway === 'track';
}

/** Class for a paved, open road from speed, lanes and facility. */
function classForRoad(
  highway: string,
  mph: number,
  lanes: number,
  facility: BikeFacility,
): { cls: 1 | 2 | 3 | 4 | 5; reasons: string[] } {
  const C = COMFORT_CLASS_CONFIG;
  const speed = speedReason(mph);
  const many = lanes >= C.manyLanes;

  if (facility === 'lane') {
    if (many) return { cls: atMost(mph, C.midMph) ? 3 : 4, reasons: [lanesReason(lanes), REASONS.bikeLane, speed] };
    if (atMost(mph, C.midMph)) return { cls: 2, reasons: [REASONS.bikeLane, speed] };
    if (atMost(mph, C.busyMph)) return { cls: 3, reasons: [speed, REASONS.bikeLane] };
    if (atMost(mph, C.fastMph)) return { cls: 4, reasons: [speed, REASONS.bikeLane] };
    return { cls: 5, reasons: [speed, REASONS.bikeLane] };
  }

  if (facility === 'shoulder') {
    if (atMost(mph, C.lowMph) && !many) return { cls: 2, reasons: [speed, REASONS.shoulder] };
    if (atMost(mph, C.busyMph)) return { cls: many ? 4 : 3, reasons: many ? [speed, lanesReason(lanes), REASONS.shoulder] : [speed, REASONS.shoulder] };
    if (atMost(mph, C.ruralShoulderMph) && lanes <= 2) return { cls: 3, reasons: [speed, REASONS.shoulder] };
    if (atMost(mph, C.fastMph)) return { cls: 4, reasons: [speed, REASONS.shoulder] };
    return { cls: 5, reasons: [speed, REASONS.shoulder] };
  }

  // Mixed traffic (sharrows count as mixed).
  const extra = facility === 'shared' ? [REASONS.sharrow] : [];
  if (MAIN_HIGHWAYS.has(highway)) return { cls: 5, reasons: [REASONS.busyHighway, speed, REASONS.noBikeSpace] };
  if (many) return { cls: 5, reasons: [lanesReason(lanes), speed, REASONS.noBikeSpace] };
  if (!atMost(mph, C.busyMph)) return { cls: 5, reasons: [speed, REASONS.noShoulder] };
  if (!atMost(mph, C.midMph)) return { cls: 4, reasons: [speed, REASONS.noBikeSpace, ...extra] };
  if (!atMost(mph, C.lowMph)) return { cls: 3, reasons: [speed, REASONS.noBikeSpace, ...extra] };
  if (!atMost(mph, C.quietMph)) return { cls: 2, reasons: [speed, ...extra] };
  if (QUIET_HIGHWAYS.has(highway) && lanes <= 2) return { cls: 1, reasons: [REASONS.quietStreet] };
  return { cls: 2, reasons: [speed, ...extra] };
}

/**
 * Comfort class for one way. `tags` are OSM tags (Overpass or BRouter
 * `WayTags`); `extras` override them with conflated data.
 *
 * Returns null when the way isn't something you can ride on at all (no
 * `highway` tag); unbuilt roads are X.
 */
export function comfortClassForTags(
  tags: Record<string, string> | null | undefined,
  extras?: ComfortExtras,
): ComfortClassResult | null {
  if (!tags) return null;
  const highway = tags.highway;
  if (!highway) return null;

  const closed = (reason: string = REASONS.closedToBikes): ComfortClassResult => ({
    cls: 'X',
    confidence: 'tagged',
    reasons: [reason],
    worstCaseCls: 'X',
    speedMph: null,
  });

  if (UNBUILT.has(highway)) return closed();
  if (isClosedToBikes(tags)) return closed();

  if (highway === 'motorway' || highway === 'motorway_link') {
    if (!BIKE_YES.has(tags.bicycle ?? '')) return closed();
    return {
      cls: 5,
      confidence: 'tagged',
      reasons: [REASONS.bikesAllowedHighway],
      worstCaseCls: 5,
      speedMph: null,
    };
  }

  if (SEPARATED.has(highway)) {
    const reasons: string[] = highway === 'track' ? [REASONS.track] : [REASONS.bikePath];
    return { cls: 1, confidence: 'tagged', reasons, worstCaseCls: 1, speedMph: null };
  }

  const facility = facilityFor(tags, extras);
  if (facility === 'separated') {
    return { cls: 1, confidence: 'tagged', reasons: [REASONS.separatedLane], worstCaseCls: 1, speedMph: null };
  }

  const { lanes } = parseLaneCount(tags, highway, extras);

  const taggedKph = parseMaxspeedKph(tags.maxspeed);
  const extraMph = typeof extras?.maxspeed_mph === 'number' && extras.maxspeed_mph > 0 ? extras.maxspeed_mph : null;
  const knownMph = extraMph ?? (taggedKph != null ? taggedKph * MPH_PER_KPH : null);

  if (isUnpaved(tags) && !MAIN_HIGHWAYS.has(highway)) {
    const mph = knownMph ?? assumedSpeedKph(highway) * MPH_PER_KPH;
    const road = classForRoad(highway, mph, lanes, facility);
    const cap = COMFORT_CLASS_CONFIG.unpavedMaxClass;
    const cls = Math.min(road.cls, cap) as 1 | 2 | 3;
    return {
      cls,
      confidence: knownMph != null ? 'tagged' : 'assumed',
      reasons: [REASONS.gravelRoad],
      worstCaseCls: cls,
      speedMph: Math.round(mph),
    };
  }

  if (knownMph != null) {
    const road = classForRoad(highway, knownMph, lanes, facility);
    return { cls: road.cls, confidence: 'tagged', reasons: road.reasons, worstCaseCls: road.cls, speedMph: Math.round(knownMph) };
  }

  // A main highway with no posted limit is read as fast: its default
  // (70 km/h for a primary) would rate a shouldered primary as class 3.
  const classDefaultMph = assumedSpeedKph(highway) * MPH_PER_KPH;
  const defaultMph = MAIN_HIGHWAYS.has(highway)
    ? Math.max(classDefaultMph, COMFORT_CLASS_CONFIG.worstCaseMph)
    : classDefaultMph;
  const road = classForRoad(highway, defaultMph, lanes, facility);

  if (UNKNOWN_SPEED_HIGHWAYS.has(highway)) {
    const worst = classForRoad(highway, COMFORT_CLASS_CONFIG.worstCaseMph, lanes, facility);
    // Speed is the unknown; what we do know (lanes, a bike lane, a shoulder)
    // is still worth telling the rider.
    const known = road.reasons.filter((r) => !/ mph$/.test(r) && r !== REASONS.noShoulder);
    return {
      cls: road.cls,
      confidence: 'unknown',
      reasons: [REASONS.speedNotMapped, ...known],
      worstCaseCls: Math.max(road.cls, worst.cls) as 1 | 2 | 3 | 4 | 5,
      speedMph: null,
    };
  }

  // Residential / living_street / service / primary / trunk: the class
  // default is a fair read of the road.
  const reasons = road.cls === 1 ? road.reasons : road.reasons.filter((r) => !/ mph$/.test(r));
  return {
    cls: road.cls,
    confidence: 'assumed',
    reasons: reasons.length ? reasons : road.reasons,
    worstCaseCls: road.cls,
    speedMph: Math.round(defaultMph),
  };
}
