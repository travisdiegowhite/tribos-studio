/**
 * Personalized ETA Calculator
 *
 * Produces terrain- and fitness-aware time estimates by combining:
 *   1. User's real speed from Strava/running profile (or sensible defaults per profile)
 *   2. Per-segment grade penalties (uphill slows you down, downhill speeds up)
 *   3. Surface type penalties (gravel/dirt slower than pavement)
 *   4. Training-goal modifier (recovery is slower, tempo faster)
 *   5. Progressive fatigue factor on long efforts
 *
 * Supports both cycling and running via the `sportType` parameter.
 */

// ── Default flat-ground speeds (km/h) when no Strava data ────────────
const DEFAULT_SPEEDS = {
  road: 25,
  gravel: 20,
  mountain: 16,
  commuting: 20,
  walking: 5,
};

// ── Running default speeds (km/h) ───────────────────────────────────
const RUNNING_DEFAULT_SPEEDS = {
  road: 10,     // ~6:00/km
  trail: 8,     // ~7:30/km
  track: 12,    // ~5:00/km
  mixed: 9,     // ~6:40/km
};

// ── Training goal speed multipliers (cycling) ───────────────────────
const GOAL_MULTIPLIERS = {
  recovery: 0.82,
  endurance: 0.95,
  tempo: 1.05,
  intervals: 0.90, // includes rest intervals
  hills: 0.92,
};

// ── Training goal speed multipliers (running) ───────────────────────
const RUNNING_GOAL_MULTIPLIERS = {
  recovery: 0.75,    // very easy pace
  easy_run: 0.90,
  long_run: 0.88,
  tempo: 1.05,
  intervals: 0.85,   // includes recovery jogs
  hills: 0.80,
};

// ── Surface speed multipliers (relative to paved) ────────────────────
const SURFACE_MULTIPLIERS = {
  paved: 1.0,
  gravel: 0.85,
  unpaved: 0.72,
  mixed: 0.88,
  unknown: 0.95, // assume mostly paved
};

// ── Grade → speed factor curves (cycling) ────────────────────────────
// Based on published cycling power/speed models.
// grade is a decimal fraction (0.08 = 8%).
function gradeSpeedFactor(grade) {
  if (grade >= 0) {
    // Uphill: quadratic slowdown, clamped so you never go below 20% of flat speed
    return Math.max(0.20, 1 - 4.8 * grade * grade - 1.5 * grade);
  }
  // Downhill: speed bonus capped at +40%
  const absGrade = Math.abs(grade);
  return Math.min(1.40, 1 + 3.0 * absGrade - 8.0 * absGrade * absGrade);
}

// ── Grade → speed factor curves (running) ────────────────────────────
// Runners slow down more on uphills and gain less on downhills than cyclists
function runningGradeSpeedFactor(grade) {
  if (grade >= 0) {
    // Runners slow down more steeply on uphills
    return Math.max(0.15, 1 - 6.0 * grade * grade - 2.0 * grade);
  }
  // Runners gain less on downhills (limited by biomechanics)
  const absGrade = Math.abs(grade);
  return Math.min(1.20, 1 + 2.0 * absGrade - 6.0 * absGrade * absGrade);
}

// ── Fatigue curve (cycling) ──────────────────────────────────────────
// No fatigue below 40 km; then linearly ramps to max 12% slowdown at 150 km
function fatigueFactor(cumulativeKm) {
  if (cumulativeKm <= 40) return 1.0;
  const extra = cumulativeKm - 40;
  const fatiguePercent = Math.min(0.12, extra * (0.12 / 110));
  return 1 - fatiguePercent;
}

// ── Fatigue curve (running) ──────────────────────────────────────────
// Running fatigue kicks in earlier (~15km) and has greater impact (20% max)
function runningFatigueFactor(cumulativeKm) {
  if (cumulativeKm <= 15) return 1.0;
  const extra = cumulativeKm - 15;
  const fatiguePercent = Math.min(0.20, extra * (0.20 / 85)); // 20% max at 100km
  return 1 - fatiguePercent;
}

/**
 * Calculate a personalized ETA for a route.
 *
 * @param {Object}  params
 * @param {number}  params.distanceKm         Total route distance in km
 * @param {Array}   params.elevationProfile    [{distance, elevation}, ...] from elevation.js
 * @param {Object}  [params.surfaceDistribution] {paved:60, gravel:30, ...} percentages
 * @param {Object}  [params.speedProfile]      Strava speed data (average_speed, road_speed, ...)
 * @param {string}  [params.routeProfile='road'] road | gravel | mountain | commuting | walking | trail | track | mixed
 * @param {string}  [params.trainingGoal='endurance']
 * @param {string}  [params.sportType='cycling'] cycling | running
 * @returns {Object} { totalSeconds, formattedTime, segments[], breakdown }
 */
export function calculatePersonalizedETA({
  distanceKm,
  elevationProfile,
  surfaceDistribution,
  speedProfile,
  routeProfile = 'road',
  trainingGoal = 'endurance',
  sportType = 'cycling',
}) {
  const isRunning = sportType === 'running';

  // 1. Determine base flat speed (km/h)
  const baseSpeed = isRunning
    ? getRunningBaseSpeed(routeProfile)
    : getBaseSpeed(speedProfile, routeProfile);

  // 2. Training goal modifier
  const goalMultipliers = isRunning ? RUNNING_GOAL_MULTIPLIERS : GOAL_MULTIPLIERS;
  const goalMult = goalMultipliers[trainingGoal] ?? 1.0;

  // 3. Weighted surface multiplier from distribution
  const surfaceMult = getSurfaceMultiplier(surfaceDistribution);

  // Select sport-appropriate grade and fatigue functions
  const gradeFn = isRunning ? runningGradeSpeedFactor : gradeSpeedFactor;
  const fatigueFn = isRunning ? runningFatigueFactor : fatigueFactor;
  // Running has a lower minimum speed floor
  const minSpeed = isRunning ? 3 : 4;

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

    const gradeMult = gradeFn(grade);
    const fatMult = fatigueFn(curr.distance);

    const segSpeed = baseSpeed * goalMult * surfaceMult * gradeMult * fatMult;
    const clampedSpeed = Math.max(minSpeed, segSpeed);

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
    ? segments.reduce((sum, s) => sum + gradeFn(s.grade / 100), 0) / segments.length
    : 1.0;
  const avgFatigue = segments.length > 0
    ? segments.reduce((sum, s) => sum + fatigueFn(s.distanceKm), 0) / segments.length
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

/**
 * Get running base speed from RunningProfile (localStorage) or defaults
 */
function getRunningBaseSpeed(routeProfile) {
  try {
    const runningProfile = JSON.parse(localStorage.getItem('runningProfile') || '{}');
    if (runningProfile.thresholdPaceSec && runningProfile.thresholdPaceSec > 0) {
      // Convert threshold pace (sec/km) to speed (km/h)
      const thresholdSpeedKmh = 3600 / runningProfile.thresholdPaceSec;
      // Adjust for route profile (trail is slower, track is faster)
      const profileMultiplier = { road: 1.0, trail: 0.80, track: 1.10, mixed: 0.90 };
      return thresholdSpeedKmh * (profileMultiplier[routeProfile] || 1.0);
    }
  } catch (e) {
    // Fallback to defaults
  }
  return RUNNING_DEFAULT_SPEEDS[routeProfile] || RUNNING_DEFAULT_SPEEDS.road;
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
