/**
 * surfaceInference — what a way is made of, with a confidence, from its tags.
 *
 * `surface=*` is the answer when it is there. When it is not (a third of
 * rural ways, most of them the county roads gravel riders actually want),
 * the other tags still say a lot: `tracktype=grade3` is unpaved,
 * `highway=track` is almost always unpaved, a `primary` road is paved. The
 * ladder below is ordered by how strong each piece of evidence is and stops
 * at the first match. Anything not covered stays `unknown` on purpose:
 * an untagged `residential` or `unclassified` road in the mountains is
 * exactly the road we must not guess about (the GraphHopper
 * `TERTIARY && surface==MISSING` mistake this replaces).
 *
 * Pure. The map from `surface` values to categories is `SURFACE_MAP` in
 * surfaceOverlay.js so the two never disagree.
 */

import { classifySurface } from './surfaceOverlay.js';
import { haversineMeters } from './distanceUnits';

export type SurfaceCategory = 'paved' | 'gravel' | 'unpaved' | 'unknown';
export type SurfaceEvidence = 'surface' | 'tracktype' | 'smoothness' | 'highway' | 'none';

export interface SurfaceInference {
  category: SurfaceCategory;
  /** 0 for unknown, up to 0.95 for an explicit surface tag. */
  confidence: number;
  evidence: SurfaceEvidence;
  /** The tag that decided it, e.g. `surface=gravel`, `tracktype=grade3`. Empty when unknown. */
  detail: string;
}

const UNKNOWN: SurfaceInference = { category: 'unknown', confidence: 0, evidence: 'none', detail: '' };

const ROUGH_SMOOTHNESS = new Set(['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable']);
const PAVED_HIGHWAYS = new Set([
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
]);
const UNPAVED_PATH_HIGHWAYS = new Set(['path', 'bridleway']);

export function inferSurface(tags: Record<string, string> | null | undefined): SurfaceInference {
  if (!tags) return UNKNOWN;

  const surface = tags.surface;
  if (surface) {
    const category = classifySurface(surface) as SurfaceCategory;
    if (category !== 'unknown') {
      return { category, confidence: 0.95, evidence: 'surface', detail: `surface=${surface}` };
    }
  }

  const tracktype = tags.tracktype;
  if (tracktype === 'grade1') {
    return { category: 'paved', confidence: 0.7, evidence: 'tracktype', detail: 'tracktype=grade1' };
  }
  if (tracktype === 'grade2') {
    return { category: 'gravel', confidence: 0.8, evidence: 'tracktype', detail: 'tracktype=grade2' };
  }
  if (tracktype === 'grade3' || tracktype === 'grade4' || tracktype === 'grade5') {
    return { category: 'unpaved', confidence: 0.8, evidence: 'tracktype', detail: `tracktype=${tracktype}` };
  }

  const smoothness = tags.smoothness;
  if (smoothness && ROUGH_SMOOTHNESS.has(smoothness)) {
    return { category: 'unpaved', confidence: 0.7, evidence: 'smoothness', detail: `smoothness=${smoothness}` };
  }

  const highway = tags.highway;
  if (highway === 'track') {
    return { category: 'unpaved', confidence: 0.6, evidence: 'highway', detail: 'highway=track' };
  }
  if (highway && UNPAVED_PATH_HIGHWAYS.has(highway)) {
    return { category: 'unpaved', confidence: 0.5, evidence: 'highway', detail: `highway=${highway}` };
  }
  if (highway && PAVED_HIGHWAYS.has(highway)) {
    return { category: 'paved', confidence: 0.85, evidence: 'highway', detail: `highway=${highway}` };
  }

  return UNKNOWN;
}

export interface SurfaceSummary {
  totalKm: number;
  knownKm: number;
  kmByCategory: Record<SurfaceCategory, number>;
  /** Share (0–100) of the TOTAL distance per known category; unknown omitted. Same shape `computeSurfaceDistribution` emits. */
  distribution: Record<string, number>;
  /** gravel + unpaved share (0–100) of the total distance. */
  gravelPct: number;
  /** Share (0–100) of the total distance decided by an explicit `surface` tag. */
  taggedPct: number;
  /** Share (0–100) of the total distance inferred from other tags. */
  inferredPct: number;
  /** Share (0–100) of the total distance with no verdict. */
  unknownPct: number;
  /** km per deciding tag, per category, for the provenance tooltip. */
  evidenceKm: Record<SurfaceCategory, Record<string, number>>;
}

/**
 * Distance-weighted roll-up of per-segment inferences. `inferences` has one
 * entry per coordinate segment (`coordinates.length - 1`); when the lengths
 * don't line up every segment is weighted equally.
 */
export function summarizeSurface(
  inferences: ReadonlyArray<SurfaceInference>,
  coordinates: ReadonlyArray<ReadonlyArray<number>> | null,
): SurfaceSummary {
  const kmByCategory: Record<SurfaceCategory, number> = { paved: 0, gravel: 0, unpaved: 0, unknown: 0 };
  const evidenceKm: Record<SurfaceCategory, Record<string, number>> = { paved: {}, gravel: {}, unpaved: {}, unknown: {} };
  const useLengths = Array.isArray(coordinates) && coordinates.length === inferences.length + 1;

  let totalKm = 0;
  let taggedKm = 0;
  let inferredKm = 0;
  for (let i = 0; i < inferences.length; i++) {
    let km = 0.001;
    if (useLengths && coordinates) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      km = haversineMeters(a[1], a[0], b[1], b[0]) / 1000;
    }
    const inf = inferences[i] ?? UNKNOWN;
    kmByCategory[inf.category] += km;
    totalKm += km;
    if (inf.evidence === 'surface') taggedKm += km;
    else if (inf.evidence !== 'none') inferredKm += km;
    if (inf.detail) {
      const bucket = evidenceKm[inf.category];
      bucket[inf.detail] = (bucket[inf.detail] ?? 0) + km;
    }
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  const pct = (km: number) => (totalKm > 0 ? Math.round((km / totalKm) * 100) : 0);
  const distribution: Record<string, number> = {};
  for (const cat of ['paved', 'gravel', 'unpaved'] as const) {
    if (kmByCategory[cat] > 0) distribution[cat] = pct(kmByCategory[cat]);
  }
  for (const cat of Object.keys(evidenceKm) as SurfaceCategory[]) {
    for (const k of Object.keys(evidenceKm[cat])) evidenceKm[cat][k] = round(evidenceKm[cat][k]);
  }
  const knownKm = totalKm - kmByCategory.unknown;
  return {
    totalKm: round(totalKm),
    knownKm: round(knownKm),
    kmByCategory: {
      paved: round(kmByCategory.paved),
      gravel: round(kmByCategory.gravel),
      unpaved: round(kmByCategory.unpaved),
      unknown: round(kmByCategory.unknown),
    },
    distribution,
    gravelPct: pct(kmByCategory.gravel + kmByCategory.unpaved),
    taggedPct: pct(taggedKm),
    inferredPct: pct(inferredKm),
    unknownPct: totalKm > 0 ? pct(kmByCategory.unknown) : 100,
    evidenceKm,
  };
}
