/**
 * Running pace maths: pace zones from threshold pace, and VDOT / threshold
 * pace estimated from a race result.
 *
 * Moved out of RunningProfileSettings.jsx so onboarding, the planner and the
 * run-load code (multisport phases 1–4) share one copy. Paces are seconds per
 * km throughout.
 */

export type RaceDistanceKey = '5k' | '10k' | 'half_marathon' | 'marathon';

export interface PaceZone {
  name: string;
  /** Faster bound of the zone, sec/km. */
  min: number;
  /** Slower bound of the zone, sec/km. */
  max: number;
}

export type PaceZones = Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6', PaceZone>;

export const RACE_DISTANCE_M: Record<RaceDistanceKey, number> = {
  '5k': 5000,
  '10k': 10000,
  half_marathon: 21097.5,
  marathon: 42195,
};

/** Six pace zones as multiples of threshold pace (slower pace = bigger number). */
export function calculatePaceZones(thresholdPaceSec: number | null | undefined): PaceZones | null {
  if (!thresholdPaceSec || thresholdPaceSec <= 0) return null;
  const tp = thresholdPaceSec;
  const zone = (name: string, fast: number, slow: number): PaceZone => ({
    name,
    min: Math.round(tp * fast),
    max: Math.round(tp * slow),
  });
  return {
    z1: zone('Recovery', 1.35, 1.5),
    z2: zone('Easy / Aerobic', 1.15, 1.35),
    z3: zone('Tempo / Marathon', 1.03, 1.15),
    z4: zone('Threshold', 0.97, 1.03),
    z5: zone('VO2max', 0.86, 0.97),
    z6: zone('Anaerobic / Speed', 0.7, 0.86),
  };
}

/** "4:30/km" from seconds per km; '-' when unknown. */
export function formatPacePerKm(secPerKm: number | null | undefined): string {
  if (!secPerKm) return '-';
  let mins = Math.floor(secPerKm / 60);
  let secs = Math.round(secPerKm % 60);
  if (secs === 60) {
    mins += 1;
    secs = 0;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

/**
 * VDOT from a race result, using Daniels' oxygen-cost and %VO2max curves.
 * Returns null for an unknown distance or a non-positive time.
 */
export function estimateVdot(distanceKey: RaceDistanceKey | string, timeSec: number | null | undefined): number | null {
  if (!timeSec || timeSec <= 0) return null;
  const d = RACE_DISTANCE_M[distanceKey as RaceDistanceKey];
  if (!d) return null;
  const minutes = timeSec / 60;
  const v = d / minutes; // m/min
  const pctVO2 =
    0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  return Math.round((vo2 / pctVO2) * 10) / 10;
}

/**
 * Threshold pace (sec/km) from VDOT, a linear fit to Daniels' tables
 * (VDOT 30 → 6:40/km, 40 → 5:15/km, 50 → 4:15/km, 60 → 3:35/km).
 */
export function estimateThresholdPaceFromVdot(vdot: number | null | undefined): number | null {
  if (!vdot || vdot <= 0) return null;
  return Math.round((10.77 - 0.119 * vdot) * 60);
}
