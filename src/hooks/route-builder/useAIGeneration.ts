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
import type {
  GenerationFormInput,
  RouteShape,
  RouteSnapshot,
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
}

function mapShape(shape: RouteShape | undefined): 'loop' | 'out_and_back' | 'point_to_point' {
  if (shape === 'out_and_back') return 'out_and_back';
  if (shape === 'point_to_point') return 'point_to_point';
  return 'loop';
}

function deriveTimeMinutes(input: GenerationFormInput): number {
  if (typeof input.duration_minutes === 'number' && input.duration_minutes > 0) {
    return input.duration_minutes;
  }
  if (typeof input.distance_km === 'number' && input.distance_km > 0) {
    return Math.round((input.distance_km / 28) * 60);
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
  });
}

export interface UseAIGenerationReturn {
  isGenerating: boolean;
  lastError: string | null;
  suggestions: RouteSnapshot[];
  generate: (input: GenerationFormInput, count?: 1 | 3) => Promise<void>;
  selectSuggestion: (index: number) => RouteSnapshot | null;
  clearSuggestions: () => void;
}

export function useAIGeneration(): UseAIGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const aiSuggestions = useRouteBuilderStore((s) => s.aiSuggestions);
  const setAiSuggestions = useRouteBuilderStore((s) => s.setAiSuggestions);
  const setRouteGeometry = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStats = useRouteBuilderStore((s) => s.setRouteStats);
  const setWaypoints = useRouteBuilderStore((s) => s.setWaypoints);
  const setRouteCues = useRouteBuilderStore((s) => s.setRouteCues);
  const setBuilderMode = useRouteBuilderStore((s) => s.setBuilderMode);

  const suggestions = (Array.isArray(aiSuggestions) ? aiSuggestions : []) as RouteSnapshot[];

  const generate = useCallback(
    async (input: GenerationFormInput, count: 1 | 3 = 1): Promise<void> => {
      if (!input.start_coord) {
        setLastError('start_coord is required for generation.');
        return;
      }
      setIsGenerating(true);
      setLastError(null);
      const startedAt = Date.now();
      trackRb2('generation_started', { count });

      const durationMinutes = deriveTimeMinutes(input);
      const userId = await getCurrentUserId();
      const params = {
        startLocation: input.start_coord,
        timeAvailable: durationMinutes,
        trainingGoal: input.goal && input.goal.length > 0 ? input.goal : 'endurance',
        routeType: mapShape(input.route_shape),
        userId,
        speedProfile: null,
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
      };

      try {
        const rb1Routes = (await generateAIRoutes(params, null)) as Rb1RouteResult[];
        const snapshots = (rb1Routes ?? [])
          .map((r) => toRouteSnapshot(r, durationMinutes))
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
        trackRb2('generation_completed', {
          count,
          duration_ms: Date.now() - startedAt,
          provider_used: 'rb1-generator',
          successes: enriched.length,
          failures: 0,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
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
      setBuilderMode('editing');
      return chosen;
    },
    [suggestions, setRouteGeometry, setRouteStats, setWaypoints, setRouteCues, setBuilderMode],
  );

  const clearSuggestions = useCallback(() => {
    setAiSuggestions([]);
    setLastError(null);
  }, [setAiSuggestions]);

  return {
    isGenerating,
    lastError,
    suggestions,
    generate,
    selectSuggestion,
    clearSuggestions,
  };
}
