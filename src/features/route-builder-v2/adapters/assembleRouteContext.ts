/**
 * RouteContext assembly per Doc 2b §9.1.
 *
 * Every executor call requires a RouteContext. This module is the
 * single place that builds it, gathering inputs from:
 *   - the Supabase user profile + speed profile
 *   - the current Zustand store (route builder session state)
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
 * `start_coord` is intentionally NOT sourced from the database. The
 * RB2 entrypoints capture it via geolocation (`useUserLocation`) and
 * thread it through `GenerationFormInput.start_coord`. This matches
 * the legacy RB1 flow and avoids needing a `home_lng/home_lat` column
 * on `user_profiles` (which doesn't exist today).
 *
 * Memory layer (Doc 4) is intentionally stubbed: `persistent_facts`
 * and `session_facts` return empty arrays.
 *
 * Error policy per Doc 2b §9.1 (line 744): query failures that
 * indicate a real bug (schema mismatch, RLS deny, network) throw
 * `RouteContextError('profile_query_failed', ...)`. Queries that
 * legitimately return no row for a new user are treated as benign
 * and yield empty fields. The conversational pipeline can then emit
 * a synthetic `clarify` for missing required fields.
 */

import { supabase } from '../../../lib/supabase';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { trackRb2 } from '../telemetry/trackRb2';
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

export type RouteContextErrorKind =
  | 'no_user'
  | 'context_missing'
  | 'profile_query_failed'
  | 'unknown';

export class RouteContextError extends Error {
  kind: RouteContextErrorKind;
  required_field?: string;
  cause?: unknown;
  constructor(
    kind: RouteContextErrorKind,
    options: { message?: string; required_field?: string; cause?: unknown } = {},
  ) {
    super(options.message ?? kind);
    this.name = 'RouteContextError';
    this.kind = kind;
    if (options.required_field) this.required_field = options.required_field;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

// ---------------------------------------------------------------------------
// Supabase error classification
// ---------------------------------------------------------------------------

interface SupabaseErrorShape {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * PostgREST returns `PGRST116` for `.single()` when zero (or >1) rows
 * match. For unique-key filters this is "user has no row yet" — benign.
 */
function isMissingRow(err: SupabaseErrorShape | null | undefined): boolean {
  return err?.code === 'PGRST116';
}

/**
 * Schema-shaped errors (undefined_table, undefined_column, schema-cache
 * miss). These indicate the codebase is asking for a column or table
 * the production database doesn't have — historically these have
 * surfaced as opaque user-facing failures (e.g. `user_profiles
 * [42703]`). We treat them as benign and degrade to an empty profile
 * so generation/edits can still run; the underlying schema drift is
 * logged for follow-up.
 */
function isSchemaMismatch(err: SupabaseErrorShape | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === '42703' || err.code === 'PGRST106';
}

/**
 * Anything that isn't a missing row and isn't a recognized schema
 * mismatch is a real failure (RLS deny, network, unknown). Bubbled up
 * so the caller can surface a real error.
 */
function isQueryFailure(err: SupabaseErrorShape | null | undefined): boolean {
  if (!err) return false;
  if (isMissingRow(err)) return false;
  if (isSchemaMismatch(err)) return false;
  return true;
}

function formatQueryError(query: string, err: SupabaseErrorShape): string {
  const code = err.code ? ` [${err.code}]` : '';
  return `${query}${code}: ${err.message ?? 'unknown error'}`;
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
// Past rides — Supabase-backed with 1hr cache
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

  const { data, error } = await supabase
    .from('activities')
    .select('id, map_summary_polyline')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(20);

  if (error) {
    if (isSchemaMismatch(error)) {
      console.warn(
        `[RB2] activities schema mismatch (${error.code}: ${error.message}) — falling back to empty past-rides`,
      );
      const result: PastRidesResult = { summaries: [], familiar_segment_ids: [] };
      pastRidesCache.set(key, { key, value: result, expiresAt: now + ONE_HOUR_MS });
      return result;
    }
    throw new RouteContextError('profile_query_failed', {
      message: formatQueryError('activities', error),
      cause: error,
    });
  }

  const summaries: RideSummary[] = Array.isArray(data)
    ? data
        .map((row) => mapActivityRowToRideSummary(row as ActivityRow))
        .filter((r): r is RideSummary => r !== null)
    : [];

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

interface ActivityRow {
  id: string;
  map_summary_polyline?: string | null;
}

function mapActivityRowToRideSummary(row: ActivityRow): RideSummary | null {
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
// user_profiles — primary_goal, preferences, training context
// ---------------------------------------------------------------------------

interface UserProfileFields {
  preferences?: unknown;
  training_goal?: string;
}

interface UserProfileRow {
  id: string;
  primary_goal?: string | null;
  weekly_hours_available?: number | null;
  weight_kg?: number | null;
  experience_level?: string | null;
  ftp?: number | null;
}

async function getUserProfile(userId: string): Promise<UserProfileFields> {
  // Note: `weekly_hours_available` was previously selected here but the
  // column never actually shipped to production despite an `IF NOT
  // EXISTS` migration comment claiming otherwise. Selecting only
  // columns that demonstrably exist; everything else is read off the
  // returned row defensively in case future columns get added.
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, primary_goal, weight_kg, experience_level, ftp')
    .eq('id', userId)
    .single();

  if (error) {
    if (isMissingRow(error)) return {};
    if (isSchemaMismatch(error)) {
      console.warn(
        `[RB2] user_profiles schema mismatch (${error.code}: ${error.message}) — falling back to empty profile`,
      );
      return {};
    }
    if (isQueryFailure(error)) {
      throw new RouteContextError('profile_query_failed', {
        message: formatQueryError('user_profiles', error),
        cause: error,
      });
    }
  }

  if (!data) return {};

  const row = data as UserProfileRow;
  const result: UserProfileFields = {};
  // Pass the whole row as `preferences` so downstream consumers (e.g.
  // StadiaProvider) can read any future user-setting field without
  // requiring another assembler update. The fields the provider reads
  // today (routingPreferences.trafficTolerance, avoidHills, avoidTraffic)
  // don't exist on user_profiles yet; routes use base profile costing
  // until that UI ships.
  result.preferences = row;
  if (typeof row.primary_goal === 'string') {
    result.training_goal = row.primary_goal;
  }
  return result;
}

// ---------------------------------------------------------------------------
// user_speed_profiles — flat_kph
// ---------------------------------------------------------------------------

interface SpeedProfileRow {
  average_speed?: number | null;
  road_speed?: number | null;
  easy_speed?: number | null;
  endurance_speed?: number | null;
}

async function getUserSpeedProfile(
  userId: string,
): Promise<{ flat_kph?: number } | undefined> {
  const { data, error } = await supabase
    .from('user_speed_profiles')
    .select('average_speed, road_speed, easy_speed, endurance_speed')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (isMissingRow(error)) return undefined;
    if (isSchemaMismatch(error)) {
      console.warn(
        `[RB2] user_speed_profiles schema mismatch (${error.code}: ${error.message}) — falling back to default speed`,
      );
      return undefined;
    }
    if (isQueryFailure(error)) {
      throw new RouteContextError('profile_query_failed', {
        message: formatQueryError('user_speed_profiles', error),
        cause: error,
      });
    }
  }
  if (!data) return undefined;

  const row = data as SpeedProfileRow;
  // Prefer `average_speed` (overall) when present; fall back to road.
  // `user_speed_profiles` documents these as km/h in the migration
  // (`-- km/h` column comments) so no unit conversion is needed.
  const flat =
    (typeof row.average_speed === 'number' && Number.isFinite(row.average_speed)
      ? row.average_speed
      : undefined) ??
    (typeof row.road_speed === 'number' && Number.isFinite(row.road_speed)
      ? row.road_speed
      : undefined);
  if (flat === undefined) return undefined;
  return { flat_kph: flat };
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
  /**
   * Explicit start coordinate. Passed by the executor adapter from
   * `GenerationFormInput.start_coord` (which itself comes from the
   * geolocation hook). Optional here — `start_coord` is required for
   * generate paths and validated by the adapter, not the assembler.
   */
  startCoordOverride?: Coordinate;
}

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
    throw new RouteContextError('no_user', { message: 'No authenticated user' });
  }

  const session = useRouteBuilderStore.getState();
  const sessionCoords = extractRouteGeometryCoords(session.routeGeometry);
  const sessionBbox = computeBboxFromCoordinates(sessionCoords);

  const start_coord = options.startCoordOverride;

  // `getRelevantPastRides` now throws on real failures (instead of
  // swallowing). Run it concurrently with the profile/speed reads but
  // surface a unified RouteContextError if any query fails.
  let profile: UserProfileFields;
  let speed: { flat_kph?: number } | undefined;
  let pastRides: PastRidesResult;
  try {
    [profile, speed, pastRides] = await Promise.all([
      getUserProfile(userId),
      getUserSpeedProfile(userId),
      getRelevantPastRides(
        userId,
        sessionBbox,
        undefined,
        { now: options.now, force: options.skipCache },
      ),
    ]);
  } catch (err) {
    if (err instanceof RouteContextError) {
      trackRb2('context_query_failed', {
        kind: err.kind,
        message: (err.message ?? '').slice(0, 200),
      });
      throw err;
    }
    throw new RouteContextError('profile_query_failed', {
      message: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }

  const current_region_bbox =
    sessionBbox ?? (start_coord ? bboxAroundPoint(start_coord, 0.5) : undefined);

  const now = options.now ?? Date.now();

  const ctx: FullRouteContext = {
    user_id: userId,
    start_coord,
    current_region_bbox,
    training_goal: profile.training_goal ?? session.trainingGoal,
    duration_target_minutes: session.timeAvailable,
    distance_target_km: session.explicitDistanceKm ?? undefined,
    speed_profile: speed,
    preferences: profile.preferences,
    familiar_segments: pastRides.familiar_segment_ids,
    recent_rides: pastRides.summaries,
    // Doc 4 (memory layer) not implemented yet.
    persistent_facts: [],
    session_facts: [],
    weather: undefined, // weather integration deferred per Turn Model Spec §13
    time_of_day: new Date(now).toISOString(),
    mapbox_token: getMapboxToken(),
  };

  trackRb2('context_assembled', {
    has_start_coord: Boolean(ctx.start_coord),
    has_speed_profile: Boolean(ctx.speed_profile?.flat_kph),
    has_training_goal: Boolean(ctx.training_goal),
    recent_ride_count: ctx.recent_rides?.length ?? 0,
  });

  return ctx;
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
