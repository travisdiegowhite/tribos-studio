/**
 * routeCues — shared turn-by-turn cue shape + Valhalla maneuver mapping.
 *
 * Cues are produced by the Stadia (Valhalla) router (the only provider we
 * request maneuvers from), stored on the route-builder store, listed in the
 * Cues panel, and exported as TCX <CoursePoint> / FIT course_point so
 * devices give turn prompts instead of a bare breadcrumb line.
 */

export interface RouteCue {
  /** Valhalla maneuver type (official enum, 0–37). */
  type: number;
  direction: 'left' | 'right' | 'straight' | 'uturn' | 'depart' | 'arrive' | 'other';
  instruction: string;
  streetNames: string[];
  /** Cumulative distance along the route at this cue, km. */
  distance_km: number;
  /** [lng, lat] on the route line. */
  coordinate: [number, number];
}

// Official Valhalla maneuver type enum (tripdirections.proto):
// 0 none, 1 start, 2 startRight, 3 startLeft, 4 destination,
// 5 destinationRight, 6 destinationLeft, 7 becomes, 8 continue,
// 9 slightRight, 10 right, 11 sharpRight, 12 uturnRight, 13 uturnLeft,
// 14 sharpLeft, 15 left, 16 slightLeft, 17 rampStraight, 18 rampRight,
// 19 rampLeft, 20 exitRight, 21 exitLeft, 22 stayStraight, 23 stayRight,
// 24 stayLeft, 25 merge, 26 roundaboutEnter, 27 roundaboutExit,
// 28 ferryEnter, 29 ferryExit, 30–36 transit, 37 mergeRight.
const RIGHT_TYPES = new Set([9, 10, 11, 18, 20, 23, 37]);
const LEFT_TYPES = new Set([14, 15, 16, 19, 21, 24]);
const UTURN_TYPES = new Set([12, 13]);
const STRAIGHT_TYPES = new Set([7, 8, 17, 22, 25]);
const DEPART_TYPES = new Set([1, 2, 3]);
const ARRIVE_TYPES = new Set([4, 5, 6]);

export function valhallaTypeToDirection(type: number): RouteCue['direction'] {
  if (UTURN_TYPES.has(type)) return 'uturn';
  if (RIGHT_TYPES.has(type)) return 'right';
  if (LEFT_TYPES.has(type)) return 'left';
  if (STRAIGHT_TYPES.has(type)) return 'straight';
  if (DEPART_TYPES.has(type)) return 'depart';
  if (ARRIVE_TYPES.has(type)) return 'arrive';
  return 'other';
}

/** Cues worth prompting a rider about (skip depart/continue noise). */
export function isTurnCue(cue: Pick<RouteCue, 'direction'>): boolean {
  return cue.direction === 'left' || cue.direction === 'right' || cue.direction === 'uturn';
}

/** TCX CoursePoint PointType for a cue. */
export function cueToTcxPointType(cue: Pick<RouteCue, 'direction'>): string {
  switch (cue.direction) {
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    case 'straight':
      return 'Straight';
    case 'uturn':
      return 'Danger';
    default:
      return 'Generic';
  }
}

/** FIT course_point type for a cue (fitsdk string enum). */
export function cueToFitPointType(cue: Pick<RouteCue, 'direction'>): string {
  switch (cue.direction) {
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'straight':
      return 'straight';
    case 'uturn':
      return 'uTurn';
    default:
      return 'generic';
  }
}

/** Short label for cue lists and CoursePoint names. */
export function cueShortLabel(cue: Pick<RouteCue, 'direction'>): string {
  switch (cue.direction) {
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    case 'straight':
      return 'Straight';
    case 'uturn':
      return 'U-turn';
    case 'depart':
      return 'Start';
    case 'arrive':
      return 'Finish';
    default:
      return 'Cue';
  }
}
