/**
 * useAIGeneration — Route Builder 2.0 AI generation hook.
 *
 * Thin wrapper around v1's `generateAIRoutes` (`src/utils/aiRouteGenerator.js`).
 * S2 rewire: replaces the previous executor-adapter call path with a
 * direct v1 service call. Elevation enrichment runs after generation
 * so Stadia/Mapbox-sourced routes don't surface 0m of climbing.
 */

import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { generateAIRoutes } from '../../utils/aiRouteGenerator.js';
import { supabase } from '../../lib/supabase';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';
import { enrichRouteElevation } from './elevationEnrichment';
import { snapshotFromGeneratedRoute } from './routeSnapshot';
import { loadSpeedProfile } from './useSpeedProfile';
import { flatSpeedKmh } from '../../utils/routeTargets.js';
import type {
  GenerationFormInput,
  ResolvedRouteShape,
  RouteShape,
  RouteSnapshot,
  TargetAccuracy,
} from './types';

export type { GenerationFormInput };

interface Rb1RouteResult {
  name?: string;
  distance?: number; // km
  elevationGain?: number; // m
  elevationLoss?: number; // m
  coordinates?: Array<[number, number]>;
  description?: string;
  cues?: unknown[] | null;
  /** Concrete shape the generator actually built (loop / out_back / …). */
  routeType?: string | null;
  /** How close it landed to the requested time or distance. */
  targetAccuracy?: TargetAccuracy | null;
}

/**
 * The shape string handed to the generator. Shapes now share one vocabulary
 * with the generator and the database, so this only fills in the default.
 * `round_trip` is passed through — the generator resolves it to a concrete
 * shape and reports back which one it built.
 */
function mapShape(shape: RouteShape | undefined): RouteShape {
  return shape ?? 'round_trip';
}

/**
 * Concrete shape of a generated route, for persistence and for the chat
 * coach's loop-vs-point-to-point edit strategy. A round trip resolves to
 * whatever the generator actually built; `routes.route_type` has no
 * `round_trip` value and would reject one.
 */
function resolveShape(
  requested: RouteShape | undefined,
  built: string | null | undefined,
): ResolvedRouteShape {
  if (built === 'loop' || built === 'out_back' || built === 'point_to_point') return built;
  if (requested === 'loop' || requested === 'out_back' || requested === 'point_to_point') {
    return requested;
  }
  return 'loop';
}

function deriveTimeMinutes(input: GenerationFormInput): number {
  if (typeof input.duration_minutes === 'number' && input.duration_minutes > 0) {
    return input.duration_minutes;
  }
  if (typeof input.distance_km === 'number' && input.distance_km > 0) {
    // Via the shared speed model rather than a local constant — this used to
    // assume a flat 28 km/h, a fourth number in a codebase that already had
    // too many.
    const kmh = flatSpeedKmh({
      goal: input.goal,
      routeProfile: input.route_profile ?? 'road',
    });
    return Math.round((input.distance_km / kmh) * 60);
  }
  return 60;
}

async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? undefined;
  } catch {
    return undefined;
  }
}

function toRouteSnapshot(
  route: Rb1RouteResult,
  durationMinutes: number,
  requestedShape: RouteShape | undefined,
): RouteSnapshot | null {
  if (!route?.coordinates || route.coordinates.length < 2) return null;
  // Snapshot construction (geometry + resampled control points so generated
  // loops stay drag-editable) is shared with the chat candidate builder.
  return snapshotFromGeneratedRoute({
    coordinates: route.coordinates,
    distance_km: route.distance ?? 0,
    elevation_gain_m: route.elevationGain ?? 0,
    elevation_loss_m: route.elevationLoss ?? 0,
    duration_s: durationMinutes * 60,
    cues: route.cues ?? null,
    shape: resolveShape(requestedShape, route.routeType),
  });
}

export interface UseAIGenerationReturn {
  isGenerating: boolean;
  lastError: string | null;
  /**
   * True when the last generation was rejected by the server-side guest
   * daily cap (tokenless request over its allowance). The UI surfaces the
   * signup prompt for this instead of a plain error message.
   */
  guestCapHit: boolean;
  suggestions: RouteSnapshot[];
  generate: (input: GenerationFormInput, count?: 1 | 3) => Promise<void>;
  selectSuggestion: (index: number) => RouteSnapshot | null;
  clearSuggestions: () => void;
}

export function useAIGeneration(): UseAIGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [guestCapHit, setGuestCapHit] = useState(false);

  const aiSuggestions = useRouteBuilderStore((s) => s.aiSuggestions);
  const setAiSuggestions = useRouteBuilderStore((s) => s.setAiSuggestions);
  const setRouteGeometry = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStats = useRouteBuilderStore((s) => s.setRouteStats);
  const setWaypoints = useRouteBuilderStore((s) => s.setWaypoints);
  const setRouteCues = useRouteBuilderStore((s) => s.setRouteCues);
  const setBuilderMode = useRouteBuilderStore((s) => s.setBuilderMode);
  const setRouteType = useRouteBuilderStore((s) => s.setRouteType);

  const suggestions = (Array.isArray(aiSuggestions) ? aiSuggestions : []) as RouteSnapshot[];

  const generate = useCallback(
    async (input: GenerationFormInput, count: 1 | 3 = 1): Promise<void> => {
      if (!input.start_coord) {
        setLastError('start_coord is required for generation.');
        return;
      }
      setIsGenerating(true);
      setLastError(null);
      setGuestCapHit(false);
      const startedAt = Date.now();
      trackRb2('generation_started', { count });

      const durationMinutes = deriveTimeMinutes(input);
      const [userId, speedProfile] = await Promise.all([
        getCurrentUserId(),
        loadSpeedProfile(),
      ]);
      const params = {
        startLocation: input.start_coord,
        timeAvailable: durationMinutes,
        trainingGoal: input.goal && input.goal.length > 0 ? input.goal : 'endurance',
        routeType: mapShape(input.route_shape),
        userId,
        // The rider's measured pace, so the time→distance target is built from
        // how fast they actually ride rather than a table of guesses. This was
        // hardcoded to null, which left the learned-speed branch of
        // calculateTargetDistance dead for every RB2 rider.
        speedProfile,
        speedModifier: 1.0,
        // Explicit rider targets — previously collected by the form but
        // dropped here, which made "40 km / 600 m" advisory at best.
        targetDistanceKm:
          typeof input.distance_km === 'number' && input.distance_km > 0
            ? input.distance_km
            : undefined,
        elevationGainTargetM:
          typeof input.elevation_gain_m === 'number' && input.elevation_gain_m > 0
            ? input.elevation_gain_m
            : undefined,
        // The form's surface selection — also previously dropped, which left
        // the routing profile to be inferred from saved preferences.
        routeProfile: input.route_profile,
        // Which number is the actual promise. In time mode the generator runs
        // a corrective pass against the estimated ride time, not just the
        // distance the time was converted into.
        targetMode: input.target_mode ?? 'time',
        targetDurationMinutes: durationMinutes,
      };

      try {
        const rb1Routes = (await generateAIRoutes(params, null)) as Rb1RouteResult[];
        const snapshots = (rb1Routes ?? [])
          .map((r) => toRouteSnapshot(r, durationMinutes, input.route_shape))
          .filter((s): s is RouteSnapshot => s !== null);

        if (snapshots.length === 0) {
          const message = 'No routes generated — try a different start point or duration.';
          setLastError(message);
          trackRb2('generation_failed', {
            count,
            failure_kind: 'no_routes',
            duration_ms: Date.now() - startedAt,
          });
          return;
        }

        const toKeep = count === 3 ? snapshots.slice(0, 3) : snapshots.slice(0, 1);
        // Pad to `count` if v1 returned fewer.
        while (toKeep.length < count) toKeep.push(toKeep[toKeep.length - 1]);

        const enriched = await Promise.all(
          toKeep.map((s) => enrichRouteElevation(s)),
        );
        setAiSuggestions(enriched);
        // Keep the store profile in sync with what generation actually used —
        // the summary chip reads it, and manual edit re-snaps route with it.
        if (input.route_profile) {
          useRouteBuilderStore.getState().setRouteProfile(
            input.route_profile === 'mtb' ? 'mountain' : input.route_profile,
          );
        }
        // …and the shape. RB2 never wrote this, so every saved route recorded
        // the store's stale default and the chat coach's loop-vs-point-to-point
        // edit strategy read the wrong value. A `round_trip` request resolves
        // to whatever was actually built.
        useRouteBuilderStore
          .getState()
          .setRouteType(resolveShape(input.route_shape, rb1Routes?.[0]?.routeType));
        // …and the goal. Same gap: RouteBuilder2 feeds the store's goal to
        // personalizedETA, so without this a tempo route was priced at the
        // endurance pace on screen while generation had targeted tempo —
        // reopening, at ~10%, the very disagreement the shared speed model
        // exists to close.
        if (params.trainingGoal) {
          useRouteBuilderStore.getState().setTrainingGoal(params.trainingGoal);
        }
        // Remember what was asked for, so the stats card can keep comparing
        // against it while the rider hand-edits the route.
        useRouteBuilderStore.getState().setRouteTarget({
          mode: params.targetMode,
          durationMinutes: params.targetDurationMinutes,
          distanceKm: params.targetDistanceKm ?? null,
        });
        const accuracy = rb1Routes?.[0]?.targetAccuracy ?? null;
        trackRb2('generation_completed', {
          count,
          duration_ms: Date.now() - startedAt,
          provider_used: 'rb1-generator',
          successes: enriched.length,
          failures: 0,
          is_guest: !userId,
          // How close the route landed to what was asked for. The builder
          // keeps its best attempt whether or not it converged, so without
          // this the miss rate is invisible in the field.
          target_mode: accuracy?.mode ?? params.targetMode,
          target_error: accuracy?.error ?? null,
          target_within_tolerance: accuracy?.withinTolerance ?? null,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if ((e as { reason?: string })?.reason === 'guest_generation_cap') {
          // Server-side guest cap — the signup modal is the surface, not
          // the error banner.
          setGuestCapHit(true);
          trackRb2('guest_generation_cap_hit', {
            count,
            duration_ms: Date.now() - startedAt,
          });
          return;
        }
        setLastError(message);
        trackRb2('generation_failed', {
          count,
          failure_kind: 'thrown',
          error_message: message.slice(0, 200),
          duration_ms: Date.now() - startedAt,
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [setAiSuggestions],
  );

  const selectSuggestion = useCallback(
    (index: number): RouteSnapshot | null => {
      const chosen = suggestions[index];
      if (!chosen) return null;
      setRouteGeometry({ type: 'LineString', coordinates: chosen.geometry });
      setRouteStats({
        distance_km: chosen.stats.distance_km,
        elevation_gain_m: chosen.stats.elevation_gain_m,
        duration_s: chosen.stats.duration_s,
      });
      setWaypoints(
        chosen.waypoints.map((wp, i) => ({
          id: `wp-${i}`,
          position: wp.coordinate,
          type: i === 0 ? 'start' : i === chosen.waypoints.length - 1 ? 'end' : 'waypoint',
          name: '',
        })),
      );
      setRouteCues(chosen.cues ?? null);
      if (chosen.shape) setRouteType(chosen.shape);
      setBuilderMode('editing');
      return chosen;
    },
    [suggestions, setRouteGeometry, setRouteStats, setWaypoints, setRouteCues, setRouteType, setBuilderMode],
  );

  const clearSuggestions = useCallback(() => {
    setAiSuggestions([]);
    setLastError(null);
    setGuestCapHit(false);
  }, [setAiSuggestions]);

  return {
    isGenerating,
    lastError,
    guestCapHit,
    suggestions,
    generate,
    selectSuggestion,
    clearSuggestions,
  };
}
