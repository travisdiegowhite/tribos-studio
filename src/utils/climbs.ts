/**
 * Climbs: find, categorise and label them (Phase 2, ROUTE-BUILDER-COMPETITIVE-PLAN §3.1).
 *
 * Detection reuses `summarizeClimbs` (elevation.js: 100 m bins, ≥3% grade,
 * ≥300 m long, short dips allowed). Categories follow the common cycling
 * convention of length × average grade (the score Strava and most head units
 * use): Cat 4 from 8,000, Cat 3 16,000, Cat 2 32,000, Cat 1 64,000, HC 80,000.
 * Smaller climbs are kept, uncategorised.
 *
 * Distances are km (`_km`) and meters (`_m`); coordinates are canonical
 * [lng, lat] (CLAUDE.md conventions).
 */
import { summarizeClimbs, coordinateAtDistanceKm } from './elevation';
import { haversineMeters } from './distanceUnits';

export type ClimbCategory = 'HC' | '1' | '2' | '3' | '4';

export interface RouteClimb {
  start_km: number;
  end_km: number;
  length_km: number;
  gain_m: number;
  avg_grade_pct: number;
  max_grade_pct: number;
  /** length_m × avg grade %. */
  score: number;
  category: ClimbCategory | null;
  /** Where the climb starts and tops out, on the route line (when coordinates were given). */
  start_coordinate: [number, number] | null;
  top_coordinate: [number, number] | null;
}

const CATEGORY_THRESHOLDS: Array<[number, ClimbCategory]> = [
  [80_000, 'HC'],
  [64_000, '1'],
  [32_000, '2'],
  [16_000, '3'],
  [8_000, '4'],
];

export function climbScore(length_m: number, avgGradePct: number): number {
  return Math.max(0, length_m) * Math.max(0, avgGradePct);
}

export function categorizeClimb(length_m: number, avgGradePct: number): ClimbCategory | null {
  const score = climbScore(length_m, avgGradePct);
  for (const [min, cat] of CATEGORY_THRESHOLDS) if (score >= min) return cat;
  return null;
}

/** "HC", "Cat 1" … "Cat 4", or "Climb" when uncategorised. */
export function climbLabel(category: ClimbCategory | null): string {
  if (!category) return 'Climb';
  return category === 'HC' ? 'HC' : `Cat ${category}`;
}

/** TCX CoursePoint PointType for a climb start. */
export function climbTcxPointType(category: ClimbCategory | null): string {
  switch (category) {
    case 'HC':
      return 'Hors Category';
    case '1':
      return '1st Category';
    case '2':
      return '2nd Category';
    case '3':
      return '3rd Category';
    case '4':
      return '4th Category';
    default:
      return 'Generic';
  }
}

/** FIT course_point type for a climb start (@garmin/fitsdk enum strings). */
export function climbFitPointType(category: ClimbCategory | null): string {
  switch (category) {
    case 'HC':
      return 'horsCategory';
    case '1':
      return 'firstCategory';
    case '2':
      return 'secondCategory';
    case '3':
      return 'thirdCategory';
    case '4':
      return 'fourthCategory';
    default:
      return 'generic';
  }
}

interface ProfilePoint {
  distance_km?: number;
  distance?: number;
  elevation?: number;
  elevation_m?: number;
}

/**
 * Every climb on a profile, in route order. `coordinates` (optional, same
 * route) adds start and top positions for map markers and course points.
 */
export function detectClimbs(
  profile: ReadonlyArray<ProfilePoint> | null | undefined,
  coordinates?: ReadonlyArray<readonly number[]> | null,
): RouteClimb[] {
  if (!profile || profile.length < 2) return [];
  const points = profile
    .map((p) => ({ distance_km: p.distance_km ?? p.distance, elevation: p.elevation ?? p.elevation_m }))
    .filter((p): p is { distance_km: number; elevation: number } =>
      Number.isFinite(p.distance_km) && Number.isFinite(p.elevation));
  if (points.length < 2) return [];
  const found = summarizeClimbs(points, { maxClimbs: 100 }) as Array<{
    start_km: number;
    length_km: number;
    gain_m: number;
    avg_grade_pct: number;
    max_grade_pct: number;
  }>;
  const coords = coordinates && coordinates.length >= 2 ? (coordinates as Array<[number, number]>) : null;
  return found
    .map((c) => {
      const end_km = Math.round((c.start_km + c.length_km) * 10) / 10;
      const length_m = c.length_km * 1000;
      const at = (km: number): [number, number] | null => {
        if (!coords) return null;
        const p = coordinateAtDistanceKm(coords, km) as number[] | null;
        return p ? [p[0], p[1]] : null;
      };
      return {
        start_km: c.start_km,
        end_km,
        length_km: c.length_km,
        gain_m: c.gain_m,
        avg_grade_pct: c.avg_grade_pct,
        max_grade_pct: c.max_grade_pct,
        score: Math.round(climbScore(length_m, c.avg_grade_pct)),
        category: categorizeClimb(length_m, c.avg_grade_pct),
        start_coordinate: at(c.start_km),
        top_coordinate: at(end_km),
      };
    })
    .sort((a, b) => a.start_km - b.start_km);
}

/**
 * Climbs straight from route coordinates that carry elevation ([lng, lat, ele]),
 * as exports have after `withElevations`. Empty when there's no elevation.
 */
export function detectClimbsFromCoordinates(coordinates: ReadonlyArray<readonly number[]> | null | undefined): RouteClimb[] {
  if (!coordinates || coordinates.length < 2) return [];
  if (!coordinates.every((c) => Number.isFinite(c[2]))) return [];
  const profile: ProfilePoint[] = [];
  let at_m = 0;
  for (let i = 0; i < coordinates.length; i++) {
    if (i > 0) {
      const a = coordinates[i - 1];
      const b = coordinates[i];
      at_m += haversineMeters(a[1], a[0], b[1], b[0]);
    }
    profile.push({ distance_km: at_m / 1000, elevation: coordinates[i][2] });
  }
  return detectClimbs(profile, coordinates);
}

/** Short course-point name for a head unit (FIT allows 16 chars, TCX 10). */
export function climbCoursePointName(climb: RouteClimb, maxChars: number): string {
  const label = climbLabel(climb.category);
  const full = `${label} ${climb.length_km.toFixed(1)}km`;
  return (full.length <= maxChars ? full : label).slice(0, maxChars);
}

/** Longer note: "Cat 3 climb: 4.2 km at 5.1% (max 9%), +215 m". */
export function climbNote(climb: RouteClimb): string {
  return `${climbLabel(climb.category)} climb: ${climb.length_km.toFixed(1)} km at ${climb.avg_grade_pct.toFixed(1)}% (max ${Math.round(climb.max_grade_pct)}%), +${Math.round(climb.gain_m)} m`;
}
