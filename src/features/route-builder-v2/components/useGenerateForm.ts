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
import { useSpeedProfile, useRunPace } from '../../../hooks/route-builder';
import { flatSpeedKmh } from '../../../utils/routeTargets.js';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { useRoadComfort, ROAD_COMFORT_OPTIONS } from '../../../hooks/route-builder/useRoadComfort';
import type { TrafficTolerance } from '../../../utils/trafficStress';

export { ROAD_COMFORT_OPTIONS };
export type RoadComfort = TrafficTolerance;

export type Goal =
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'recovery'
  | 'long_ride'
  | 'commute';
export type Surface = 'road' | 'gravel' | 'mountain' | 'mixed' | 'run' | 'trail';
export type Sport = 'cycling' | 'running';

export const SPORT_OPTIONS: Array<{ value: Sport; label: string }> = [
  { value: 'cycling', label: 'Ride' },
  { value: 'running', label: 'Run' },
];
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

/**
 * Run goals, labelled for runners but keyed onto the ride goal vocabulary so
 * generation, the run pace factors (runProfiles.js) and the saved
 * training_goal all stay valid.
 */
export const RUN_GOAL_OPTIONS: Array<{ value: Goal; label: string }> = [
  { value: 'endurance', label: 'Easy' },
  { value: 'long_ride', label: 'Long Run' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'recovery', label: 'Recovery' },
];

/** Run surfaces → the run route profiles. */
export const RUN_SURFACE_OPTIONS: Array<{ value: Surface; label: string }> = [
  { value: 'run', label: 'Road & Path' },
  { value: 'trail', label: 'Trail' },
];

/** The routing profile a form surface asks for. */
export function surfaceToProfile(surface: Surface): string {
  switch (surface) {
    case 'mountain':
      return 'mtb';
    case 'mixed':
      return 'gravel';
    case 'trail':
      return 'trail_run';
    default:
      return surface;
  }
}

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
    case 'run':
      return 'Road & Path';
    case 'trail_run':
      return 'Trail';
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
  activeRouteProfile = null,
}: UseGenerateFormArgs) {
  // Seeding a distance (e.g. from a planned workout that specifies one) is
  // the rider asking for that distance; otherwise time binds.
  const [targetMode, setTargetMode] = useState<TargetMode>(
    typeof initialDistanceKm === 'number' && initialDistanceKm > 0 ? 'distance' : 'time',
  );
  // Ride or run lives in the store: the map, panels and saving follow it.
  const sport = useRouteBuilderStore((st) => st.sport) as Sport;
  const isRun = sport === 'running';
  const [goal, setGoal] = useState<Goal>(initialGoal ?? 'endurance');
  const [duration, setDuration] = useState<number>(initialDurationMinutes ?? 60);
  const [surface, setSurface] = useState<Surface>(isRun ? 'run' : 'road');
  const [shape, setShape] = useState<Shape>('round_trip');
  const [startLocation, setStartLocation] = useState<string>(initialStartLocation ?? '');
  const [distanceKm, setDistanceKm] = useState<number | ''>(initialDistanceKm ?? '');
  const [elevationGainM, setElevationGainM] = useState<number | ''>(initialElevationGainM ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // "Road comfort" is a persisted rider preference (store + server), not
  // per-form state: it applies to chat generation and manual edits too.
  const { roadComfort, setRoadComfort } = useRoadComfort();

  // The rider's own pace, so the derived field below is their estimate and
  // not a generic one. Cached at module scope, shared with the ETA.
  const speedProfile = useSpeedProfile();
  const runThresholdPaceSec = useRunPace();

  const goalOptions = isRun ? RUN_GOAL_OPTIONS : GOAL_OPTIONS;
  const surfaceOptions = isRun ? RUN_SURFACE_OPTIONS : SURFACE_OPTIONS;
  // A surface left over from the other sport reads as that sport's default.
  const effectiveSurface: Surface = surfaceOptions.some((o) => o.value === surface)
    ? surface
    : surfaceOptions[0].value;
  const effectiveGoal: Goal = goalOptions.some((o) => o.value === goal) ? goal : 'endurance';
  const surfaceProfile = surfaceToProfile(effectiveSurface);

  /** Switch ride ↔ run: clears the route and resets the sport's own choices. */
  const setSport = useCallback(
    (next: Sport) => {
      if (next === sport) return;
      trackRb2('sport_changed', { from: sport, to: next });
      useRouteBuilderStore.getState().setSport(next);
      setSurface(next === 'running' ? 'run' : 'road');
      const nextGoals = next === 'running' ? RUN_GOAL_OPTIONS : GOAL_OPTIONS;
      setGoal((g) => (nextGoals.some((o) => o.value === g) ? g : 'endurance'));
      setLocalError(null);
      generation.clearSuggestions();
    },
    [sport, generation],
  );

  /**
   * Flat-ground pace for the current goal/surface, from the same model that
   * targets the route and prices the ETA — so the derived value the rider
   * reads is the one generation will actually use.
   */
  const paceKmh = useMemo(
    () =>
      flatSpeedKmh({
        goal: effectiveGoal,
        routeProfile: surfaceProfile,
        speedProfile: speedProfile ?? undefined,
        thresholdPaceSec: runThresholdPaceSec,
      }) as number,
    [effectiveGoal, surfaceProfile, speedProfile, runThresholdPaceSec],
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
      sport,
      goal: effectiveGoal,
      target_mode: targetMode,
      duration_minutes: duration,
      surface: effectiveSurface,
      shape,
      road_comfort: isRun ? null : roadComfort,
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
      goal: effectiveGoal,
      target_mode: targetMode,
      duration_minutes: bindsOnTime ? duration : derivedDurationMinutes || undefined,
      route_profile: surfaceProfile as 'road' | 'gravel' | 'mtb' | 'run' | 'trail_run',
      route_shape: shape,
      start_coord: start,
      distance_km: bindsOnTime
        ? undefined
        : distanceKm === ''
          ? undefined
          : distanceKm,
      elevation_gain_m: elevationGainM === '' ? undefined : elevationGainM,
      // Road comfort is a cycling preference (traffic stress on a bike).
      traffic_tolerance: isRun ? undefined : roadComfort,
    });
  }, [
    generation,
    sport,
    isRun,
    effectiveGoal,
    targetMode,
    duration,
    derivedDurationMinutes,
    effectiveSurface,
    surfaceProfile,
    shape,
    roadComfort,
    distanceKm,
    elevationGainM,
    resolveStartCoord,
    startLocation,
  ]);

  const onReset = useCallback(() => {
    setTargetMode('time');
    setGoal('endurance');
    setDuration(60);
    setSurface(isRun ? 'run' : 'road');
    setShape('round_trip');
    setStartLocation('');
    setDistanceKm('');
    setElevationGainM('');
    setLocalError(null);
    generation.clearSuggestions();
  }, [generation, isRun]);

  // The chip reflects the active route's profile when one exists, so a
  // chat-generated gravel route reads "… · Gravel" rather than the form's
  // stale local default. Falls back to the form's own surface selection.
  const summarySurface = activeRouteProfile
    ? profileToSurfaceLabel(activeRouteProfile)
    : prettyLabel(surfaceOptions, effectiveSurface);
  const summary = `${isRun ? 'Run · ' : ''}${prettyLabel(goalOptions, effectiveGoal)} · ${duration}min · ${summarySurface}`;

  return {
    // field state
    sport,
    setSport,
    isRun,
    goalOptions,
    surfaceOptions,
    targetMode,
    setTargetMode,
    goal: effectiveGoal,
    setGoal,
    duration,
    setDuration,
    surface: effectiveSurface,
    setSurface,
    shape,
    setShape,
    roadComfort,
    setRoadComfort,
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
