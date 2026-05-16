/**
 * RouteContext assembly per Doc 2b §9.1.
 *
 * Every executor call requires a RouteContext. This module is the
 * single place that builds it, gathering inputs from:
 *   - the Supabase user profile / preferences view
 *   - the current Zustand store (route builder session state)
 *   - the training context table
 *   - recent activities (cached 1hr keyed to user/bbox)
 *   - the memory layer (Doc 4 — stubbed in P1.2)
 *
 * The shape we return is wider than `RouteContext` defined in
 * `src/routing/executor/types.ts`. The executor only reads a subset
 * of fields today; the rest are documented in the spec and will be
 * read by the conversational pipeline (Doc 2b) once it lands. The
 * adapter narrows the shape to the executor's `RouteContext` at the
 * call site.
 *
 * Memory layer (Doc 4) is intentionally stubbed: `persistent_facts`
 * and `session_facts` return empty arrays. P1.4 wires real memory
 * when the chat surface needs it.
 */

import { supabase } from '../../../lib/supabase';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import type {
  Coordinate,
  RouteContext as ExecutorRouteContext,
  RideSummary,
} from '../../../routing/executor';
import type { SegmentId } from '../../../routing/executor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Bounding box in [west, south, east, north] order (GeoJSON convention).
 */
export type BBox = readonly [number, number, number, number];

/**
 * Full RouteContext per Doc 2b §9.1. Wider than the executor's local
 * `RouteContext`. The adapter narrows when calling the executor.
 */
export interface FullRouteContext {
  user_id: string;
  start_coord?: Coordinate;
  current_region_bbox?: BBox;
  training_goal?: string;
  duration_target_minutes?: number;
  distance_target_km?: number;
  speed_profile?: { flat_kph?: number };
  preferences?: unknown;
  familiar_segments?: SegmentId[];
  recent_rides?: RideSummary[];
  persistent_facts: unknown[];
  session_facts: unknown[];
  weather?: ExecutorRouteContext['weather'];
  time_of_day: string;
  /** Mapbox access token, required by MapboxProvider. */
  mapbox_token?: string;
}

export class RouteContextError extends Error {
  kind: 'no_user' | 'no_profile' | 'unknown';
  constructor(kind: 'no_user' | 'no_profile' | 'unknown', message?: string) {
    super(message ?? kind);
    this.name = 'RouteContextError';
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Auth resolver
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Past rides — minimal Supabase-backed implementation with 1hr cache
// ---------------------------------------------------------------------------

interface PastRidesResult {
  summaries: RideSummary[];
  familiar_segment_ids: SegmentId[];
}

interface CacheEntry {
  key: string;
  value: PastRidesResult;
  expiresAt: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const pastRidesCache = new Map<string, CacheEntry>();

function bboxKey(bbox: BBox | undefined): string {
  if (!bbox) return 'none';
  return bbox.map((n) => n.toFixed(2)).join(',');
}

export async function getRelevantPastRides(
  userId: string,
  bbox: BBox | undefined,
  _goal: string | undefined,
  options: { now?: number; force?: boolean } = {},
): Promise<PastRidesResult> {
  const now = options.now ?? Date.now();
  const key = `${userId}:${bboxKey(bbox)}`;
  if (!options.force) {
    const cached = pastRidesCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  let summaries: RideSummary[] = [];
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, polyline')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(20);
    if (!error && Array.isArray(data)) {
      summaries = data
        .map((row) => mapActivityRowToRideSummary(row))
        .filter((r): r is RideSummary => r !== null);
    }
  } catch {
    // Tolerate missing tables / RLS — empty array is fine.
  }

  const result: PastRidesResult = {
    summaries,
    familiar_segment_ids: [],
  };
  pastRidesCache.set(key, {
    key,
    value: result,
    expiresAt: now + ONE_HOUR_MS,
  });
  return result;
}

export function clearPastRidesCache(): void {
  pastRidesCache.clear();
}

function mapActivityRowToRideSummary(row: {
  id: string;
  polyline?: string | null;
}): RideSummary | null {
  if (!row?.id) return null;
  // We don't decode polylines here — RideSummary carries waypoints only,
  // and the executor's like_ride_id resolution will fall through to the
  // radial-loop seed on missing waypoints. Decoding is a follow-up if
  // like_ride_id usage grows.
  return {
    id: row.id,
    waypoints: [],
  };
}

// ---------------------------------------------------------------------------
// Profile / training / preferences fetchers (minimal; no service layer yet)
// ---------------------------------------------------------------------------

interface ProfileFields {
  start_coord?: Coordinate;
  speed_profile?: { flat_kph?: number };
  preferences?: unknown;
}

async function getProfile(userId: string): Promise<ProfileFields> {
  const result: ProfileFields = {};
  try {
    const { data, error } = await supabase
      .from('user_preferences_complete')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!error && data) {
      result.preferences = data;
      if (
        typeof data.home_longitude === 'number' &&
        typeof data.home_latitude === 'number'
      ) {
        result.start_coord = [data.home_longitude, data.home_latitude] as Coordinate;
      }
      const flatKph = (data.average_speed_kph ?? data.flat_kph) as number | undefined;
      if (typeof flatKph === 'number' && Number.isFinite(flatKph)) {
        result.speed_profile = { flat_kph: flatKph };
      }
    }
  } catch {
    // missing view / RLS → return empty
  }
  return result;
}

interface TrainingFields {
  training_goal?: string;
  duration_target_minutes?: number;
  distance_target_km?: number;
}

async function getTrainingContext(userId: string): Promise<TrainingFields> {
  const result: TrainingFields = {};
  try {
    const { data, error } = await supabase
      .from('training_context')
      .select('primary_goal, typical_ride_time')
      .eq('user_id', userId)
      .single();
    if (!error && data) {
      if (typeof data.primary_goal === 'string') {
        result.training_goal = data.primary_goal;
      }
      if (typeof data.typical_ride_time === 'number') {
        result.duration_target_minutes = data.typical_ride_time;
      }
    }
  } catch {
    // table may not exist for new users — defaults are fine
  }
  return result;
}

// ---------------------------------------------------------------------------
// BBox computation
// ---------------------------------------------------------------------------

export function computeBboxFromCoordinates(
  coords: ReadonlyArray<Coordinate | [number, number]> | undefined | null,
): BBox | undefined {
  if (!coords || coords.length === 0) return undefined;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (!Number.isFinite(west)) return undefined;
  return [west, south, east, north] as BBox;
}

function extractRouteGeometryCoords(
  geometry: unknown,
): Array<[number, number]> | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const g = geometry as { coordinates?: unknown };
  if (!Array.isArray(g.coordinates)) return null;
  return g.coordinates as Array<[number, number]>;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface AssembleOptions {
  /** Override `Date.now()` for tests. */
  now?: number;
  /** Skip cache for past rides. */
  skipCache?: boolean;
  /** Override the user id resolver (tests). */
  userIdOverride?: string | null;
}

const DEFAULT_START_COORD: Coordinate = [-105.05, 40.05] as Coordinate; // Boulder, CO — safe fallback

function getMapboxToken(): string | undefined {
  try {
    const token = (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env?.VITE_MAPBOX_TOKEN;
    return token || undefined;
  } catch {
    return undefined;
  }
}

export async function assembleRouteContext(
  options: AssembleOptions = {},
): Promise<FullRouteContext> {
  const userId =
    options.userIdOverride !== undefined
      ? options.userIdOverride
      : await getCurrentUserId();
  if (!userId) {
    throw new RouteContextError('no_user', 'No authenticated user');
  }

  const session = useRouteBuilderStore.getState();
  const sessionCoords = extractRouteGeometryCoords(session.routeGeometry);
  const sessionBbox = computeBboxFromCoordinates(sessionCoords);

  const [profile, training, pastRides] = await Promise.all([
    getProfile(userId),
    getTrainingContext(userId),
    getRelevantPastRides(
      userId,
      sessionBbox,
      undefined,
      { now: options.now, force: options.skipCache },
    ),
  ]);

  const start_coord = profile.start_coord ?? DEFAULT_START_COORD;
  const current_region_bbox =
    sessionBbox ?? bboxAroundPoint(start_coord, 0.5);

  const now = options.now ?? Date.now();

  return {
    user_id: userId,
    start_coord,
    current_region_bbox,
    training_goal: training.training_goal ?? session.trainingGoal,
    duration_target_minutes:
      training.duration_target_minutes ?? session.timeAvailable,
    distance_target_km: session.explicitDistanceKm ?? undefined,
    speed_profile: profile.speed_profile,
    preferences: profile.preferences,
    familiar_segments: pastRides.familiar_segment_ids,
    recent_rides: pastRides.summaries,
    // Doc 4 (memory layer) not implemented yet — P1.4 will wire this.
    persistent_facts: [],
    session_facts: [],
    weather: undefined, // weather integration deferred per Turn Model Spec §13
    time_of_day: new Date(now).toISOString(),
    mapbox_token: getMapboxToken(),
  };
}

function bboxAroundPoint(coord: Coordinate, deltaDeg: number): BBox {
  const [lng, lat] = coord;
  return [lng - deltaDeg, lat - deltaDeg, lng + deltaDeg, lat + deltaDeg] as BBox;
}

/**
 * Narrow a FullRouteContext to the subset the executor reads
 * (see `src/routing/executor/types.ts` :: RouteContext).
 */
export function toExecutorContext(full: FullRouteContext): ExecutorRouteContext {
  return {
    user_id: full.user_id,
    mapbox_token: full.mapbox_token,
    training_goal: full.training_goal,
    preferences: full.preferences,
    user_speed_kph: full.speed_profile?.flat_kph,
    start_coord: full.start_coord,
    speed_profile: full.speed_profile,
    familiar_segments: full.familiar_segments,
    time_of_day: full.time_of_day,
    weather: full.weather,
    recent_rides: full.recent_rides,
  };
}
