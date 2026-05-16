/**
 * useAIGeneration — Route Builder 2.0 AI generation hook.
 *
 * Wraps `executorAdapter.generateRoute` with loading/error state and
 * `rb2_*` telemetry. Reads/writes `aiSuggestions` on the existing
 * Zustand store (`routeBuilderStore`).
 */

import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import * as executorAdapter from '../../features/route-builder-v2/adapters';
import type {
  GenerationFormInput,
} from '../../features/route-builder-v2/adapters';
import type {
  ExecutorResult,
  ExecutorFailure,
  RouteSnapshot,
} from '../../routing/executor';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

function formatFailure(reason: ExecutorFailure): string {
  switch (reason.kind) {
    case 'router_unavailable':
      return `No routing provider available (tried: ${reason.providers_tried.join(', ')})`;
    case 'constraint_infeasible':
      return reason.explanation;
    case 'waypoint_unreachable':
      return `Waypoint ${reason.waypoint_index} is unreachable`;
    case 'mutation_not_supported':
      return `Mutation not supported: ${reason.mutation_type}`;
    case 'context_missing':
      return `Missing context field: ${reason.required_field}`;
    case 'internal_error':
      return reason.message;
    default:
      return 'Unknown error';
  }
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
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
  const setBuilderMode = useRouteBuilderStore((s) => s.setBuilderMode);

  // The store may hold legacy suggestion shapes; narrow to RouteSnapshot
  // when shape matches, otherwise return empty.
  const suggestions = (Array.isArray(aiSuggestions) ? aiSuggestions : []) as RouteSnapshot[];

  const generate = useCallback(
    async (input: GenerationFormInput, count: 1 | 3 = 1): Promise<void> => {
      setIsGenerating(true);
      setLastError(null);
      const startedAt = Date.now();
      trackRb2('generation_started', { count });
      try {
        const result = await executorAdapter.generateRoute(input, count);
        const results: ExecutorResult[] = Array.isArray(result) ? result : [result];
        const successful = results.filter((r): r is Extract<ExecutorResult, { ok: true }> => r.ok);
        const failed = results.filter((r): r is Extract<ExecutorResult, { ok: false }> => !r.ok);

        if (successful.length === 0) {
          const firstFailure = failed[0];
          const failureKind = firstFailure ? firstFailure.reason.kind : 'unknown';
          const message = firstFailure
            ? formatFailure(firstFailure.reason)
            : 'Generation returned no results';
          setLastError(message);
          trackRb2('generation_failed', {
            count,
            failure_kind: failureKind,
            duration_ms: Date.now() - startedAt,
          });
          return;
        }

        setAiSuggestions(successful.map((r) => r.route));
        const provider = successful[0].metadata.provider_used;
        trackRb2('generation_completed', {
          count,
          duration_ms: Date.now() - startedAt,
          provider_used: provider,
          successes: successful.length,
          failures: failed.length,
        });
      } catch (e) {
        const message = formatError(e);
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
      const coords = chosen.geometry;
      setRouteGeometry({ type: 'LineString', coordinates: coords });
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
      setBuilderMode('editing');
      return chosen;
    },
    [suggestions, setRouteGeometry, setRouteStats, setWaypoints, setBuilderMode],
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
