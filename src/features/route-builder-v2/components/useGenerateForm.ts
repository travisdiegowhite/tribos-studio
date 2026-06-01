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

import { useCallback, useState } from 'react';
import type { UseAIGenerationReturn, UserLocationStatus } from '../../../hooks/route-builder';
import type { Coordinate } from '../../../types/geo';
import { trackRb2 } from '../telemetry/trackRb2';
import { geocodeWaypoint } from '../../../utils/geocoding.js';

export type Goal =
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'recovery'
  | 'long_ride'
  | 'commute';
export type Surface = 'road' | 'gravel' | 'mountain' | 'mixed';
export type Shape = 'loop' | 'out_and_back' | 'point_to_point';

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
  { value: 'loop', label: 'Loop' },
  { value: 'out_and_back', label: 'Out & Back' },
  { value: 'point_to_point', label: 'Point to Point' },
];

export interface UseGenerateFormArgs {
  generation: UseAIGenerationReturn;
  defaultStart?: Coordinate | null;
  locationStatus?: UserLocationStatus;
  viewportCenter?: Coordinate | null;
}

export function prettyLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function useGenerateForm({
  generation,
  defaultStart = null,
  viewportCenter = null,
}: UseGenerateFormArgs) {
  const [goal, setGoal] = useState<Goal>('endurance');
  const [duration, setDuration] = useState<number>(60);
  const [surface, setSurface] = useState<Surface>('road');
  const [shape, setShape] = useState<Shape>('loop');
  const [startLocation, setStartLocation] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [elevationGainM, setElevationGainM] = useState<number | ''>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

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
    await generation.generate({
      goal,
      duration_minutes: duration,
      route_profile:
        surface === 'mountain' ? 'mtb' : surface === 'mixed' ? 'gravel' : (surface as 'road' | 'gravel'),
      route_shape: shape,
      start_coord: start,
      distance_km: distanceKm === '' ? undefined : distanceKm,
      elevation_gain_m: elevationGainM === '' ? undefined : elevationGainM,
    });
  }, [
    generation,
    goal,
    duration,
    surface,
    shape,
    distanceKm,
    elevationGainM,
    resolveStartCoord,
    startLocation,
  ]);

  const onReset = useCallback(() => {
    setGoal('endurance');
    setDuration(60);
    setSurface('road');
    setShape('loop');
    setStartLocation('');
    setDistanceKm('');
    setElevationGainM('');
    setLocalError(null);
    generation.clearSuggestions();
  }, [generation]);

  const summary = `${prettyLabel(GOAL_OPTIONS, goal)} · ${duration}min · ${prettyLabel(
    SURFACE_OPTIONS,
    surface,
  )}`;

  return {
    // field state
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
