/**
 * useGenerateForm — shared cold-start generation form logic for RB2.
 *
 * Extracted from FormPanel so the structured "Generate" controls can be
 * rendered in two places without duplicating the subtle start-coordinate
 * resolution chain (typed address → geolocation → map viewport center):
 *
 *   - FormPanel (mobile): the full collapsible card.
 *   - GenerateBar (desktop): compact chips folded into the chat dock.
 *
 * Owns the form field state, the resolve→generate submit, and reset.
 */

import { useCallback, useMemo, useState } from 'react';
import type { UseAIGenerationReturn, UserLocationStatus } from '../../../hooks/route-builder';
import type { Coordinate } from '../../../types/geo';
import { trackRb2 } from '../telemetry/trackRb2';
import { geocodeWaypoint } from '../../../utils/geocoding.js';
import { useSpeedProfile } from '../../../hooks/route-builder';
import { flatSpeedKmh } from '../../../utils/routeTargets.js';

export type Goal =
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'recovery'
  | 'long_ride'
  | 'commute';
export type Surface = 'road' | 'gravel' | 'mountain' | 'mixed';
/**
 * Route shape.
 *
 * These strings are the generator's and the database's vocabulary
 * (`routes.route_type` is CHECK-constrained to loop/out_back/point_to_point) —
 * RB2 previously used its own `'out_and_back'` spelling, which no generator
 * branch matched, so every "Out & Back" request silently produced a loop.
 *
 * `round_trip` is the exception: a rider intent ("start and finish here"),
 * resolved during generation to a concrete loop or out_back. It is never
 * persisted.
 */
export type Shape = 'round_trip' | 'loop' | 'out_back' | 'point_to_point';

/**
 * Which number the rider is actually asking for.
 *
 * The form used to collect both a duration (always populated) and an optional
 * distance and send both, leaving the generator to decide — so a rider could
 * never say "I have 90 minutes" without also implying a distance, or vice
 * versa. The selected mode is the hard constraint; the other field is shown
 * derived and read-only, so the two can't silently disagree.
 */
export type TargetMode = 'time' | 'distance';

export const TARGET_MODE_OPTIONS: Array<{ value: TargetMode; label: string }> = [
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
];

export const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = [
  { value: 'endurance', label: 'Endurance' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'long_ride', label: 'Long Ride' },
  { value: 'commute', label: 'Commute' },
];

export const SURFACE_OPTIONS: Array<{ value: Surface; label: string }> = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'mixed', label: 'Mixed' },
];

export const SHAPE_OPTIONS: Array<{ value: Shape; label: string }> = [
  // Most riders start and finish at the same place and don't care which
  // shape gets them there — so that's the default, and the generator picks.
  { value: 'round_trip', label: 'Start & Finish Here' },
  { value: 'loop', label: 'Loop' },
  { value: 'out_back', label: 'Out & Back' },
  { value: 'point_to_point', label: 'Point to Point' },
];

/** Seed values when arriving pre-configured (e.g. from a planned workout). */
export interface GenerateFormSeed {
  goal?: Goal;
  durationMinutes?: number;
  distanceKm?: number | '';
  elevationGainM?: number | '';
  /** Free-text start preference (address/place) — geocoded on submit. */
  startLocation?: string;
  /**
   * Identity of the planned workout this build is for, carried through to the
   * prompt so it describes *that* session rather than today's.
   */
  plannedWorkoutId?: string | null;
  scheduledDate?: string | null;
  workoutId?: string | null;
}

export interface UseGenerateFormArgs {
  generation: UseAIGenerationReturn;
  defaultStart?: Coordinate | null;
  locationStatus?: UserLocationStatus;
  viewportCenter?: Coordinate | null;
  initialGoal?: Goal;
  initialDurationMinutes?: number;
  initialDistanceKm?: number | '';
  initialElevationGainM?: number | '';
  initialStartLocation?: string;
  /** Planned-workout identity, forwarded verbatim to generation. */
  workoutRef?: {
    plannedWorkoutId?: string | null;
    scheduledDate?: string | null;
    workoutId?: string | null;
  } | null;
  /**
   * The active route's routing profile (store `routeProfile`). When set, the
   * read-only summary chip reflects it — so a chat-generated gravel route
   * shows "… · Gravel" instead of the form's stale local default.
   */
  activeRouteProfile?: string | null;
}

export function prettyLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Map a routing profile (store) to a Surface summary label. */
function profileToSurfaceLabel(profile: string): string {
  switch (profile) {
    case 'gravel':
      return 'Gravel';
    case 'mtb':
    case 'mountain':
      return 'Mountain';
    case 'mixed':
      return 'Mixed';
    default:
      return 'Road';
  }
}

export function useGenerateForm({
  generation,
  defaultStart = null,
  viewportCenter = null,
  initialGoal,
  initialDurationMinutes,
  initialDistanceKm,
  initialElevationGainM,
  initialStartLocation,
  workoutRef = null,
  activeRouteProfile = null,
}: UseGenerateFormArgs) {
  // Seeding a distance (e.g. from a planned workout that specifies one) is
  // the rider asking for that distance; otherwise time binds.
  const [targetMode, setTargetMode] = useState<TargetMode>(
    typeof initialDistanceKm === 'number' && initialDistanceKm > 0 ? 'distance' : 'time',
  );
  const [goal, setGoal] = useState<Goal>(initialGoal ?? 'endurance');
  const [duration, setDuration] = useState<number>(initialDurationMinutes ?? 60);
  const [surface, setSurface] = useState<Surface>('road');
  const [shape, setShape] = useState<Shape>('round_trip');
  const [startLocation, setStartLocation] = useState<string>(initialStartLocation ?? '');
  const [distanceKm, setDistanceKm] = useState<number | ''>(initialDistanceKm ?? '');
  const [elevationGainM, setElevationGainM] = useState<number | ''>(initialElevationGainM ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // The rider's own pace, so the derived field below is their estimate and
  // not a generic one. Cached at module scope, shared with the ETA.
  const speedProfile = useSpeedProfile();

  const surfaceProfile = surface === 'mountain' ? 'mtb' : surface === 'mixed' ? 'gravel' : surface;

  /**
   * Flat-ground pace for the current goal/surface, from the same model that
   * targets the route and prices the ETA — so the derived value the rider
   * reads is the one generation will actually use.
   */
  const paceKmh = useMemo(
    () =>
      flatSpeedKmh({
        goal,
        routeProfile: surfaceProfile,
        speedProfile: speedProfile ?? undefined,
      }) as number,
    [goal, surfaceProfile, speedProfile],
  );

  /** Distance implied by the requested time — shown when time binds. */
  const derivedDistanceKm = useMemo(
    () => (duration > 0 ? (duration / 60) * paceKmh : 0),
    [duration, paceKmh],
  );

  /** Time implied by the requested distance — shown when distance binds. */
  const derivedDurationMinutes = useMemo(
    () =>
      typeof distanceKm === 'number' && distanceKm > 0 && paceKmh > 0
        ? Math.round((distanceKm / paceKmh) * 60)
        : 0,
    [distanceKm, paceKmh],
  );

  const resolveStartCoord = useCallback(async (): Promise<Coordinate | null> => {
    // Priority chain mirrors RB1 (RouteBuilder.jsx:2238-2255):
    //   1) typed address (geocoded)
    //   2) geolocation
    //   3) map viewport center
    const trimmed = startLocation.trim();
    if (trimmed) {
      const bias = defaultStart ?? viewportCenter ?? null;
      const biasMutable = bias ? ([bias[0], bias[1]] as [number, number]) : null;
      const result = await (geocodeWaypoint as (
        name: string,
        proximity: [number, number] | null,
      ) => Promise<{ coordinates: [number, number]; name: string } | null>)(
        trimmed,
        biasMutable,
      );
      if (result?.coordinates) {
        return result.coordinates as Coordinate;
      }
      return null;
    }
    if (defaultStart) return defaultStart;
    if (viewportCenter) {
      console.warn(
        '[RB2] No geolocation or address; falling back to map viewport center as start_coord',
      );
      return viewportCenter;
    }
    return null;
  }, [startLocation, defaultStart, viewportCenter]);

  const onSubmit = useCallback(async () => {
    setLocalError(null);
    trackRb2('form_submitted', {
      goal,
      target_mode: targetMode,
      duration_minutes: duration,
      surface,
      shape,
      has_distance: distanceKm !== '',
      has_elevation: elevationGainM !== '',
    });
    setIsResolving(true);
    let start: Coordinate | null = null;
    try {
      start = await resolveStartCoord();
    } catch (err) {
      console.error('[RB2] start_coord resolution failed', err);
    } finally {
      setIsResolving(false);
    }
    if (!start) {
      setLocalError(
        startLocation.trim()
          ? `Could not find "${startLocation.trim()}". Try a more specific address.`
          : 'Enable location, type an address, or move the map to set a start point.',
      );
      return;
    }
    // Exactly one of the two binds. The other is sent as the derived estimate
    // so the generator can seed from it, but only the binding one is treated
    // as a target (see target_mode).
    const bindsOnTime = targetMode === 'time';
    await generation.generate({
      goal,
      target_mode: targetMode,
      duration_minutes: bindsOnTime ? duration : derivedDurationMinutes || undefined,
      route_profile: surfaceProfile as 'road' | 'gravel' | 'mtb',
      route_shape: shape,
      start_coord: start,
      distance_km: bindsOnTime
        ? undefined
        : distanceKm === ''
          ? undefined
          : distanceKm,
      elevation_gain_m: elevationGainM === '' ? undefined : elevationGainM,
      planned_workout_id: workoutRef?.plannedWorkoutId ?? null,
      scheduled_date: workoutRef?.scheduledDate ?? null,
      workout_id: workoutRef?.workoutId ?? null,
    });
  }, [
    generation,
    goal,
    targetMode,
    duration,
    derivedDurationMinutes,
    surface,
    surfaceProfile,
    shape,
    distanceKm,
    elevationGainM,
    resolveStartCoord,
    startLocation,
    workoutRef,
  ]);

  const onReset = useCallback(() => {
    setTargetMode('time');
    setGoal('endurance');
    setDuration(60);
    setSurface('road');
    setShape('round_trip');
    setStartLocation('');
    setDistanceKm('');
    setElevationGainM('');
    setLocalError(null);
    generation.clearSuggestions();
  }, [generation]);

  // The chip reflects the active route's profile when one exists, so a
  // chat-generated gravel route reads "… · Gravel" rather than the form's
  // stale local default. Falls back to the form's own surface selection.
  const summarySurface = activeRouteProfile
    ? profileToSurfaceLabel(activeRouteProfile)
    : prettyLabel(SURFACE_OPTIONS, surface);
  const summary = `${prettyLabel(GOAL_OPTIONS, goal)} · ${duration}min · ${summarySurface}`;

  return {
    // field state
    targetMode,
    setTargetMode,
    goal,
    setGoal,
    duration,
    setDuration,
    surface,
    setSurface,
    shape,
    setShape,
    startLocation,
    setStartLocation,
    distanceKm,
    setDistanceKm,
    elevationGainM,
    setElevationGainM,
    // derived + status
    paceKmh,
    derivedDistanceKm,
    derivedDurationMinutes,
    localError,
    setLocalError,
    isResolving,
    summary,
    // actions
    onSubmit,
    onReset,
  };
}

export type UseGenerateFormReturn = ReturnType<typeof useGenerateForm>;
