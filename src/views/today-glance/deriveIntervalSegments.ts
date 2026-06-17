/**
 * deriveIntervalSegments — map a prescription's effort structure onto route
 * geometry so the hard-effort stretches can be styled in effort-orange.
 *
 * GATING DEPENDENCY (per spec): the interval-on-terrain coloring must be REAL —
 * derived from the prescription structure mapped onto the route, not
 * decorative. That requires the segment schema (length, sustained gradient,
 * interruption density via src/utils/segmentDetector.ts) to be enriched and
 * confirmed ready. Until then we ship the route line only.
 *
 * This module is wired but gated: `intervalColoringEnabled()` reads a build
 * flag (VITE_TODAY_GLANCE_INTERVALS). When off (the default), it returns an
 * empty array and the hero renders the plain teal route line. When on, it
 * produces a first-pass even distribution of work/recovery blocks along the
 * route from the prescription's interval count — a placeholder for the real
 * terrain-aware placement that lands once segment enrichment is ready.
 */

import type { IntervalSegment, TodayPrescription } from './types';

/** Build-time sub-flag for the interval-coloring gating dependency. */
export function intervalColoringEnabled(): boolean {
  return import.meta.env?.VITE_TODAY_GLANCE_INTERVALS === 'true';
}

/**
 * Parse a structure string like "4x8min @ threshold, 4min recovery" into a
 * rough (repeats, zone) hint. Deliberately tolerant — returns null when it
 * can't find a repeat count, in which case no segments are produced.
 */
function parseStructure(
  structure: string | null | undefined,
): { repeats: number; zone: string } | null {
  if (!structure) return null;
  const m = structure.match(/(\d+)\s*[x×]\s*/i);
  if (!m) return null;
  const repeats = Number(m[1]);
  if (!Number.isFinite(repeats) || repeats < 1 || repeats > 30) return null;
  const zoneMatch = structure.match(
    /(recovery|endurance|tempo|sweet\s*spot|threshold|vo2|anaerobic|sprint)/i,
  );
  const zone = zoneMatch ? zoneMatch[1].toLowerCase().replace(/\s+/g, ' ') : 'work';
  return { repeats, zone };
}

/**
 * Produce interval segments as fractions [0..1] along the route geometry.
 *
 * @param prescription today's workout (provides structure + type)
 * @param pointCount   number of coordinates in the decoded route geometry
 *                     (used to ensure we only emit segments when geometry exists)
 */
export function deriveIntervalSegments(
  prescription: TodayPrescription | null,
  pointCount: number,
): IntervalSegment[] {
  if (!intervalColoringEnabled()) return [];
  if (!prescription || prescription.type === 'rest') return [];
  if (pointCount < 4) return [];

  const parsed = parseStructure(prescription.structure);
  if (!parsed) return [];

  // First-pass placement: lay the work blocks evenly across the central 80%
  // of the route, separated by recovery gaps. This is intentionally a
  // placeholder until terrain-aware placement (segmentDetector) is wired.
  const { repeats, zone } = parsed;
  const usable = 0.8;
  const startOffset = 0.1;
  const slot = usable / repeats;
  const workWidth = slot * 0.6;

  const segments: IntervalSegment[] = [];
  for (let i = 0; i < repeats; i++) {
    const slotStart = startOffset + i * slot;
    segments.push({
      startFraction: slotStart,
      endFraction: slotStart + workWidth,
      kind: 'work',
      zone,
    });
  }
  return segments;
}
