/**
 * Heuristic fallback for route generation when Claude AI is unavailable.
 *
 * Three tiers, tried in order:
 *   Tier 1 — Familiar loop: pick a past ride near the start, in target distance band.
 *   Tier 2 — Radial loop:    cardinal-direction loop snapped via smart cycling router.
 *   Tier 3 — Out-and-back:   straight-line geometry, no router call (always succeeds).
 *
 * Returned suggestion carries `isFallback` / `fallbackTier` / `fallbackReason`
 * so the UI can show a tier-appropriate banner. See T1.3 spec for context.
 */

import type { Coordinate } from '../types/geo';
import { haversineKm } from './distanceUnits';
import { supabase } from '../lib/supabase';
import { getSmartCyclingRoute } from './smartCyclingRouter';

export type FallbackTier = 1 | 2 | 3;

export type FallbackReason =
  | 'claude_timeout'
  | 'claude_error'
  | 'claude_empty'
  | 'claude_invalid'
  | 'unknown';

export interface FallbackInput {
  startLocation: Coordinate;
  targetDistanceKm: number;
  trainingGoal: string;
  routeProfile: string;
  userId?: string | null;
  reason?: FallbackReason;
}

export interface FallbackSuggestion {
  name: string;
  description: string;
  distance: number;            // km — matches existing AISuggestion shape
  elevationGain: number;       // m
  elevationLoss: number;       // m
  coordinates: Coordinate[];
  difficulty: 'easy' | 'moderate' | 'hard';
  trainingGoal: string;
  estimatedTime: number;       // minutes
  confidence: number;
  source: string;
  isFallback: true;
  fallbackTier: FallbackTier;
  fallbackReason: FallbackReason;
}

const FAMILIAR_SEARCH_RADIUS_KM = 25;
const DISTANCE_TOLERANCE = 0.25; // ±25%

/**
 * Top-level fallback orchestrator. Always returns a usable suggestion;
 * the very worst case (Tier 3) generates a deterministic out-and-back
 * with no external dependencies.
 */
export async function generateFallbackRoute(
  input: FallbackInput
): Promise<FallbackSuggestion> {
  const reason: FallbackReason = input.reason ?? 'claude_error';

  // Tier 1 — familiar loop from user history
  if (input.userId) {
    try {
      const tier1 = await tryFamiliarLoop(input);
      if (tier1) {
        return { ...tier1, isFallback: true, fallbackTier: 1, fallbackReason: reason };
      }
    } catch (err) {
      console.warn('[fallback] Tier 1 (familiar loop) failed:', err);
    }
  }

  // Tier 2 — radial loop snapped to roads
  try {
    const tier2 = await tryRadialLoop(input);
    if (tier2) {
      return { ...tier2, isFallback: true, fallbackTier: 2, fallbackReason: reason };
    }
  } catch (err) {
    console.warn('[fallback] Tier 2 (radial loop) failed:', err);
  }

  // Tier 3 — straight-line out-and-back, always succeeds
  return {
    ...generateOutAndBack(input),
    isFallback: true,
    fallbackTier: 3,
    fallbackReason: reason,
  };
}

// ---------------------------------------------------------------------------
// Tier 1 — familiar loop
// ---------------------------------------------------------------------------

interface FamiliarRideRow {
  id: string;
  name: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  start_latitude: number | null;
  start_longitude: number | null;
  training_goal: string | null;
  track_points_count: number | null;
}

interface TrackPointRow {
  latitude: number | null;
  longitude: number | null;
}

async function tryFamiliarLoop(
  input: FallbackInput
): Promise<Omit<FallbackSuggestion, 'isFallback' | 'fallbackTier' | 'fallbackReason'> | null> {
  if (!input.userId) return null;

  const [startLng, startLat] = input.startLocation;
  const target = input.targetDistanceKm;
  const minDist = target * (1 - DISTANCE_TOLERANCE);
  const maxDist = target * (1 + DISTANCE_TOLERANCE);

  // Rough bounding box for the start point (degrees). 1 deg lat ≈ 111 km.
  const dLat = FAMILIAR_SEARCH_RADIUS_KM / 111;
  const cosLat = Math.cos((startLat * Math.PI) / 180) || 1;
  const dLng = FAMILIAR_SEARCH_RADIUS_KM / (111 * Math.abs(cosLat));

  const { data, error } = await supabase
    .from('routes')
    .select(
      'id, name, distance_km, elevation_gain_m, elevation_loss_m, start_latitude, start_longitude, training_goal, track_points_count'
    )
    .eq('user_id', input.userId)
    .gte('start_latitude', startLat - dLat)
    .lte('start_latitude', startLat + dLat)
    .gte('start_longitude', startLng - dLng)
    .lte('start_longitude', startLng + dLng)
    .gte('distance_km', minDist)
    .lte('distance_km', maxDist)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('[fallback] familiar-loop query error:', error);
    return null;
  }
  const rows = (data ?? []) as FamiliarRideRow[];
  if (rows.length === 0) return null;

  // Prefer rides matching training goal; fall back to any goal if too few.
  const goalMatches = rows.filter(
    r => r.training_goal && r.training_goal.toLowerCase() === input.trainingGoal?.toLowerCase()
  );
  const candidates = goalMatches.length > 0 ? goalMatches : rows;

  // Pick the candidate whose distance is closest to target.
  const ranked = candidates
    .filter(r => r.distance_km != null && (r.track_points_count ?? 0) > 0)
    .sort(
      (a, b) =>
        Math.abs((a.distance_km ?? 0) - target) -
        Math.abs((b.distance_km ?? 0) - target)
    );

  for (const pick of ranked) {
    const coords = await fetchTrackPointsAsCoordinates(pick.id);
    if (coords.length < 10) continue;

    const distanceKm = pick.distance_km ?? target;
    const elevationGain = pick.elevation_gain_m ?? Math.round(distanceKm * 15);
    const elevationLoss = pick.elevation_loss_m ?? elevationGain;
    const estimatedTime = Math.round((distanceKm / averageSpeedKmh(input.trainingGoal)) * 60);

    return {
      name: pick.name ? `${pick.name} (familiar)` : 'A route you have ridden before',
      description:
        'Based on a route you have ridden before — picked from your history while the AI assistant is unavailable.',
      distance: distanceKm,
      elevationGain: Math.round(elevationGain),
      elevationLoss: Math.round(elevationLoss),
      coordinates: coords,
      difficulty: difficultyFor(distanceKm, elevationGain),
      trainingGoal: input.trainingGoal,
      estimatedTime,
      confidence: 0.7,
      source: 'fallback_familiar',
    };
  }

  return null;
}

async function fetchTrackPointsAsCoordinates(routeId: string): Promise<Coordinate[]> {
  const { data, error } = await supabase
    .from('track_points')
    .select('latitude, longitude')
    .eq('route_id', routeId)
    .order('time_seconds', { ascending: true });

  if (error) {
    console.warn('[fallback] track_points fetch failed:', error);
    return [];
  }

  const rows = (data ?? []) as TrackPointRow[];
  const coords: Coordinate[] = [];
  for (const pt of rows) {
    if (typeof pt.longitude === 'number' && typeof pt.latitude === 'number') {
      coords.push([pt.longitude, pt.latitude]);
    }
  }
  return coords;
}

// ---------------------------------------------------------------------------
// Tier 2 — radial loop
// ---------------------------------------------------------------------------

async function tryRadialLoop(
  input: FallbackInput
): Promise<Omit<FallbackSuggestion, 'isFallback' | 'fallbackTier' | 'fallbackReason'> | null> {
  const [startLng, startLat] = input.startLocation;
  const target = input.targetDistanceKm;

  // Pick a starting cardinal bearing that varies by day-of-week so users
  // who hit the fallback twice in a row do not get the same loop.
  const cardinals = [0, 90, 180, 270]; // N, E, S, W
  const startBearing = cardinals[new Date().getDay() % cardinals.length];

  // Build four waypoints — start, leg1, leg2, return-to-start — at 90°
  // turns. Each leg is target / 4.
  const legKm = target / 4;
  const cosLat = Math.cos((startLat * Math.PI) / 180) || 1;
  const offset = (km: number, bearingDeg: number): Coordinate => {
    const θ = (bearingDeg * Math.PI) / 180;
    const dLat = (km / 111) * Math.cos(θ);
    const dLng = (km / (111 * Math.abs(cosLat))) * Math.sin(θ);
    return [startLng + dLng, startLat + dLat];
  };

  const wp1 = offset(legKm, startBearing);
  const wp2Bearing = (startBearing + 90) % 360;
  const wp2: Coordinate = [
    wp1[0] + ((legKm / (111 * Math.abs(cosLat))) * Math.sin((wp2Bearing * Math.PI) / 180)),
    wp1[1] + ((legKm / 111) * Math.cos((wp2Bearing * Math.PI) / 180)),
  ];
  const wp3Bearing = (startBearing + 180) % 360;
  const wp3: Coordinate = [
    wp2[0] + ((legKm / (111 * Math.abs(cosLat))) * Math.sin((wp3Bearing * Math.PI) / 180)),
    wp2[1] + ((legKm / 111) * Math.cos((wp3Bearing * Math.PI) / 180)),
  ];

  const waypoints: Coordinate[] = [input.startLocation, wp1, wp2, wp3, input.startLocation];

  // smartCyclingRouter is plain JS and types its waypoints as mutable
  // [lon, lat] tuples; cast to satisfy the call site since Coordinate is
  // readonly.
  // smartCyclingRouter is JS — its JSDoc parameter type names every
  // option as required, but at runtime every option is optional. Cast
  // the options to bypass the over-strict inferred type.
  const result = (await getSmartCyclingRoute(
    waypoints as unknown as [number, number][],
    {
      profile: input.routeProfile || 'road',
      trainingGoal: input.trainingGoal,
    } as unknown as Parameters<typeof getSmartCyclingRoute>[1]
  )) as
    | {
        coordinates?: Coordinate[];
        distance_m?: number;
        elevation_gain_m?: number;
      }
    | null
    | undefined;

  if (!result || !Array.isArray(result.coordinates) || result.coordinates.length < 10) {
    return null;
  }

  const distanceKm =
    typeof result.distance_m === 'number'
      ? result.distance_m / 1000
      : target;
  const elevationGain =
    typeof result.elevation_gain_m === 'number'
      ? result.elevation_gain_m
      : Math.round(distanceKm * 12);

  return {
    name: 'Quick loop while AI is offline',
    description:
      'Generic loop generated while the AI assistant is unavailable. Try again for a personalized version.',
    distance: distanceKm,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationGain),
    coordinates: result.coordinates,
    difficulty: difficultyFor(distanceKm, elevationGain),
    trainingGoal: input.trainingGoal,
    estimatedTime: Math.round((distanceKm / averageSpeedKmh(input.trainingGoal)) * 60),
    confidence: 0.5,
    source: 'fallback_radial',
  };
}

// ---------------------------------------------------------------------------
// Tier 3 — out-and-back, always succeeds
// ---------------------------------------------------------------------------

function generateOutAndBack(
  input: FallbackInput
): Omit<FallbackSuggestion, 'isFallback' | 'fallbackTier' | 'fallbackReason'> {
  const [startLng, startLat] = input.startLocation;
  const halfKm = input.targetDistanceKm / 2;

  // Direction varies by day-of-week so the same user doesn't get the same
  // straight-line route twice in a row.
  const bearing = ((new Date().getDay() * 73) % 360) * (Math.PI / 180);
  const cosLat = Math.cos((startLat * Math.PI) / 180) || 1;
  const endLat = startLat + (halfKm / 111) * Math.cos(bearing);
  const endLng = startLng + (halfKm / (111 * Math.abs(cosLat))) * Math.sin(bearing);
  const end: Coordinate = [endLng, endLat];

  // Sample ~30 points each way so consumers don't filter it as "geometric".
  const points: Coordinate[] = [];
  const SEGMENTS = 30;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    points.push([startLng + (endLng - startLng) * t, startLat + (endLat - startLat) * t]);
  }
  for (let i = 1; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    points.push([endLng + (startLng - endLng) * t, endLat + (startLat - endLat) * t]);
  }

  const distanceKm = haversineKm(startLat, startLng, endLat, endLng) * 2;
  const elevationGain = Math.round(distanceKm * 5); // flat assumption

  return {
    name: 'Basic out-and-back (limited connectivity)',
    description:
      'Limited connectivity — basic out-and-back generated. Try again in a moment for a real route.',
    distance: distanceKm,
    elevationGain,
    elevationLoss: elevationGain,
    coordinates: points,
    difficulty: 'easy',
    trainingGoal: input.trainingGoal,
    estimatedTime: Math.round((distanceKm / averageSpeedKmh(input.trainingGoal)) * 60),
    confidence: 0.3,
    source: 'fallback_outandback',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function averageSpeedKmh(trainingGoal: string): number {
  switch (trainingGoal) {
    case 'recovery':
      return 16;
    case 'endurance':
      return 20;
    case 'intervals':
    case 'tempo':
      return 24;
    case 'hills':
      return 15;
    default:
      return 19;
  }
}

function difficultyFor(distanceKm: number, elevationGainM: number): 'easy' | 'moderate' | 'hard' {
  const metersPerKm = elevationGainM / Math.max(distanceKm, 1);
  if (distanceKm < 20 && metersPerKm < 10) return 'easy';
  if (distanceKm > 60 || metersPerKm > 20) return 'hard';
  return 'moderate';
}
