/**
 * Comfort level ↔ traffic_tolerance for the API (migration 139).
 *
 * Mirrors the mappings in src/utils/comfortLevels.ts, which is TypeScript and
 * not bundled into the serverless runtime. comfortLevel.test.js checks the
 * two agree; change both together.
 *
 *   tolerance → level  low 2 · medium 3 · high 4   (spec §5.4 backfill)
 *   level → tolerance  1–2 low · 3 medium · 4–5 high
 */

export const COMFORT_LEVELS = [1, 2, 3, 4, 5];

/** A rider with no saved preference (spec: new riders default to Comfort 2). */
export const DEFAULT_COMFORT_LEVEL = 2;

export function isComfortLevel(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/** @param {'low'|'medium'|'high'|null|undefined} tolerance */
export function comfortLevelFromTolerance(tolerance) {
  if (tolerance === 'low') return 2;
  if (tolerance === 'medium') return 3;
  if (tolerance === 'high') return 4;
  return DEFAULT_COMFORT_LEVEL;
}

/** @param {number} level */
export function toleranceForComfortLevel(level) {
  if (level <= 2) return 'low';
  if (level === 3) return 'medium';
  return 'high';
}

/**
 * The level a stored row means: its comfort_level, else what its
 * traffic_tolerance maps to, else the new-rider default.
 * @returns {{ level: number, source: 'stored' | 'tolerance' | 'default' }}
 */
export function resolveComfortLevel(row) {
  if (row && isComfortLevel(row.comfort_level)) return { level: row.comfort_level, source: 'stored' };
  if (row && ['low', 'medium', 'high'].includes(row.traffic_tolerance)) {
    return { level: comfortLevelFromTolerance(row.traffic_tolerance), source: 'tolerance' };
  }
  return { level: DEFAULT_COMFORT_LEVEL, source: 'default' };
}
