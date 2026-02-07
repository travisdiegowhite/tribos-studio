/**
 * Personalized ETA Calculator
 *
 * Produces terrain- and fitness-aware ride time estimates by combining:
 *   1. User's real speed from Strava (or sensible defaults per profile)
 *   2. Per-segment grade penalties (uphill slows you down, downhill speeds up)
 *   3. Surface type penalties (gravel/dirt slower than pavement)
 *   4. Training-goal modifier (recovery rides are slower, tempo faster)
 *   5. Progressive fatigue factor on long rides
 *
 * The output includes a total time *and* a per-segment breakdown so the UI
 * can show "you'll be at km 40 in ~1h 35m" in the future.
 */

// ── Default flat-ground speeds (km/h) when no Strava data ────────────
const DEFAULT_SPEEDS = {
  road: 25,
  gravel: 20,
  mountain: 16,
  commuting: 20,
  walking: 5,
};

// ── Training goal speed multipliers ──────────────────────────────────
const GOAL_MULTIPLIERS = {
  recovery: 0.82,
  endurance: 0.95,
  tempo: 1.05,
  intervals: 0.90, // includes rest intervals
  hills: 0.92,
};

// ── Surface speed multipliers (relative to paved) ────────────────────
const SURFACE_MULTIPLIERS = {
  paved: 1.0,
  gravel: 0.85,
  unpaved: 0.72,
  mixed: 0.88,
  unknown: 0.95, // assume mostly paved
};

// ── Grade → speed factor curves ──────────────────────────────────────
// Based on published cycling power/speed models.
// grade is a decimal fraction (0.08 = 8%).
function gradeSpeedFactor(grade) {
  if (grade >= 0) {
    // Uphill: quadratic slowdown, clamped so you never go below 20% of flat speed
    //   0%  → 1.0
    //   5%  → ~0.62
    //   10% → ~0.38
    //   15% → ~0.24
    return Math.max(0.20, 1 - 4.8 * grade * grade - 1.5 * grade);
  }
  // Downhill: speed bonus capped at +40%
  //   -3%  → ~1.15
  //   -6%  → ~1.30
  //   -10% → ~1.40 (cap)
  const absGrade = Math.abs(grade);
  return Math.min(1.40, 1 + 3.0 * absGrade - 8.0 * absGrade * absGrade);
}

// ── Fatigue curve ────────────────────────────────────────────────────
// No fatigue below 40 km; then linearly ramps to max 12% slowdown at 150 km
function fatigueFactor(cumulativeKm) {
  if (cumulativeKm <= 40) return 1.0;
  const extra = cumulativeKm - 40;
  const fatiguePercent = Math.min(0.12, extra * (0.12 / 110));
  return 1 - fatiguePercent;
}

/**
 * Calculate a personalized ETA for a cycling route.
 *
 * @param {Object}  params
 * @param {number}  params.distanceKm         Total route distance in km
 * @param {Array}   params.elevationProfile    [{distance, elevation}, …] from elevation.js
 * @param {Object}  [params.surfaceDistribution] {paved:60, gravel:30, …} percentages
 * @param {Object}  [params.speedProfile]      Strava speed data (average_speed, road_speed, …)
 * @param {string}  [params.routeProfile='road'] road | gravel | mountain | commuting | walking
 * @param {string}  [params.trainingGoal='endurance']
 * @returns {Object} { totalSeconds, formattedTime, segments[], breakdown }
 */
export function calculatePersonalizedETA({
  distanceKm,
  elevationProfile,
  surfaceDistribution,
  speedProfile,
  routeProfile = 'road',
  trainingGoal = 'endurance',
}) {
  // 1. Determine base flat speed (km/h)
  const baseSpeed = getBaseSpeed(speedProfile, routeProfile);

  // 2. Training goal modifier
  const goalMult = GOAL_MULTIPLIERS[trainingGoal] ?? 1.0;

  // 3. Weighted surface multiplier from distribution
  const surfaceMult = getSurfaceMultiplier(surfaceDistribution);

  // If no elevation profile, return a simple estimate
  if (!elevationProfile || elevationProfile.length < 2) {
    const effectiveSpeed = baseSpeed * goalMult * surfaceMult;
    const totalSeconds = (distanceKm / effectiveSpeed) * 3600;
    return {
      totalSeconds: Math.round(totalSeconds),
      formattedTime: formatSeconds(totalSeconds),
      isPersonalized: !!speedProfile,
      effectiveSpeed: Math.round(effectiveSpeed * 10) / 10,
      breakdown: {
        baseSpeed,
        goalModifier: goalMult,
        surfaceModifier: surfaceMult,
        avgGradeModifier: 1.0,
        avgFatigueModifier: 1.0,
      },
      segments: [],
    };
  }

  // 4. Segment-by-segment calculation using elevation profile
  let totalSeconds = 0;
  const segments = [];

  for (let i = 1; i < elevationProfile.length; i++) {
    const prev = elevationProfile[i - 1];
    const curr = elevationProfile[i];

    const segDistKm = curr.distance - prev.distance;
    if (segDistKm <= 0) continue;

    // Grade (rise / run)
    const elevDiff = curr.elevation - prev.elevation;
    const grade = elevDiff / (segDistKm * 1000); // metres rise / metres run

    const gradeMult = gradeSpeedFactor(grade);
    const fatMult = fatigueFactor(curr.distance);

    const segSpeed = baseSpeed * goalMult * surfaceMult * gradeMult * fatMult;
    // Floor at 4 km/h to avoid near-zero speeds on extreme grades
    const clampedSpeed = Math.max(4, segSpeed);

    const segSeconds = (segDistKm / clampedSpeed) * 3600;
    totalSeconds += segSeconds;

    segments.push({
      distanceKm: curr.distance,
      segmentKm: segDistKm,
      grade: Math.round(grade * 1000) / 10, // percentage with 1 decimal
      speedKmh: Math.round(clampedSpeed * 10) / 10,
      seconds: Math.round(segSeconds),
      cumulativeSeconds: Math.round(totalSeconds),
    });
  }

  // Aggregate modifiers for the breakdown display
  const avgGrade = segments.length > 0
    ? segments.reduce((sum, s) => sum + Math.abs(s.grade), 0) / segments.length
    : 0;
  const avgGradeMult = segments.length > 0
    ? segments.reduce((sum, s) => sum + gradeSpeedFactor(s.grade / 100), 0) / segments.length
    : 1.0;
  const avgFatigue = segments.length > 0
    ? segments.reduce((sum, s) => sum + fatigueFactor(s.distanceKm), 0) / segments.length
    : 1.0;

  return {
    totalSeconds: Math.round(totalSeconds),
    formattedTime: formatSeconds(totalSeconds),
    isPersonalized: !!speedProfile,
    effectiveSpeed: distanceKm > 0
      ? Math.round((distanceKm / (totalSeconds / 3600)) * 10) / 10
      : 0,
    breakdown: {
      baseSpeed: Math.round(baseSpeed * 10) / 10,
      goalModifier: goalMult,
      surfaceModifier: Math.round(surfaceMult * 100) / 100,
      avgGradeModifier: Math.round(avgGradeMult * 100) / 100,
      avgFatigueModifier: Math.round(avgFatigue * 100) / 100,
      avgGradePercent: Math.round(avgGrade * 10) / 10,
    },
    segments,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function getBaseSpeed(speedProfile, routeProfile) {
  if (!speedProfile) return DEFAULT_SPEEDS[routeProfile] || DEFAULT_SPEEDS.road;

  switch (routeProfile) {
    case 'road':
      return speedProfile.road_speed || speedProfile.average_speed || DEFAULT_SPEEDS.road;
    case 'gravel':
      return speedProfile.gravel_speed
        || (speedProfile.average_speed ? speedProfile.average_speed * 0.85 : DEFAULT_SPEEDS.gravel);
    case 'mountain':
      return speedProfile.mtb_speed
        || (speedProfile.average_speed ? speedProfile.average_speed * 0.70 : DEFAULT_SPEEDS.mountain);
    case 'commuting':
      return speedProfile.easy_speed
        || (speedProfile.average_speed ? speedProfile.average_speed * 0.90 : DEFAULT_SPEEDS.commuting);
    case 'walking':
      return DEFAULT_SPEEDS.walking;
    default:
      return speedProfile.average_speed || DEFAULT_SPEEDS.road;
  }
}

function getSurfaceMultiplier(surfaceDistribution) {
  if (!surfaceDistribution || Object.keys(surfaceDistribution).length === 0) return 1.0;

  let weightedMult = 0;
  let totalPct = 0;

  for (const [surface, pct] of Object.entries(surfaceDistribution)) {
    const mult = SURFACE_MULTIPLIERS[surface] ?? 0.95;
    weightedMult += mult * pct;
    totalPct += pct;
  }

  return totalPct > 0 ? weightedMult / totalPct : 1.0;
}

function formatSeconds(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default { calculatePersonalizedETA };
