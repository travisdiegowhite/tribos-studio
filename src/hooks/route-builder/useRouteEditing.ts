/**
 * useRouteEditing — Route Builder 2.0 editing hook.
 *
 * Applies mutations and chat-driven edits to the current route. Reads
 * the live route from the Zustand store; on success, writes the new
 * geometry/stats back to the store.
 *
 * Edit history is kept in-hook (`useState`) — it's transient to the
 * editing session. Undo/redo restores prior snapshots from history.
 *
 * Chat translation is stubbed via `executorAdapter.interpretChatInput`
 * (P1.4 fills it). When the stub returns `null`, `applyAIEdit` resolves
 * with `{ ok: false, reason: 'chat_translation_unavailable' }`.
 */

import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import * as executorAdapter from '../../features/route-builder-v2/adapters';
import type {
  ExecutorResult,
  ExecutorFailure,
  Mutation,
  RouteSnapshot,
  RouteWaypoint,
} from '../../routing/executor';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

interface HistoryEntry {
  route: RouteSnapshot;
  appliedAt: number;
  label?: string;
}

export interface UseRouteEditingReturn {
  isApplying: boolean;
  lastError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  historyDepth: number;
  applyMutation: (mutation: Mutation) => Promise<ExecutorResult>;
  applyAIEdit: (
    text: string,
  ) => Promise<ExecutorResult | { ok: false; reason: 'chat_translation_unavailable' }>;
  undo: () => boolean;
  redo: () => boolean;
}

function formatFailure(reason: ExecutorFailure): string {
  if (reason.kind === 'constraint_infeasible') return reason.explanation;
  if (reason.kind === 'mutation_not_supported') return `Unsupported: ${reason.mutation_type}`;
  if (reason.kind === 'router_unavailable') return 'No router available';
  if (reason.kind === 'waypoint_unreachable') return `Waypoint unreachable`;
  if (reason.kind === 'context_missing') return `Missing: ${reason.required_field}`;
  if (reason.kind === 'internal_error') return reason.message;
  return 'Unknown error';
}

export function useRouteEditing(): UseRouteEditingReturn {
  const [isApplying, setIsApplying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<number>(-1);

  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const setRouteGeometry = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStats = useRouteBuilderStore((s) => s.setRouteStats);
  const setWaypoints = useRouteBuilderStore((s) => s.setWaypoints);

  const snapshotCurrentRoute = useCallback((): RouteSnapshot | null => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
    const coords = routeGeometry.coordinates;
    const wpList: RouteWaypoint[] = (Array.isArray(waypoints) ? waypoints : []).map(
      (wp: { position?: [number, number] | readonly [number, number] }) => ({
        coordinate: (wp.position ?? coords[0]) as [number, number],
      }),
    );
    return {
      geometry: coords,
      waypoints: wpList,
      stats: {
        distance_km: routeStats?.distance_km ?? 0,
        elevation_gain_m: routeStats?.elevation_gain_m ?? 0,
        elevation_loss_m: 0,
        duration_s: routeStats?.duration_s ?? 0,
      },
    };
  }, [routeGeometry, routeStats, waypoints]);

  const writeSnapshotToStore = useCallback(
    (snap: RouteSnapshot) => {
      setRouteGeometry({ type: 'LineString', coordinates: snap.geometry });
      setRouteStats({
        distance_km: snap.stats.distance_km,
        elevation_gain_m: snap.stats.elevation_gain_m,
        duration_s: snap.stats.duration_s,
      });
      setWaypoints(
        snap.waypoints.map((wp, i) => ({
          id: `wp-${i}`,
          position: wp.coordinate,
          type:
            i === 0 ? 'start' : i === snap.waypoints.length - 1 ? 'end' : 'waypoint',
          name: '',
        })),
      );
    },
    [setRouteGeometry, setRouteStats, setWaypoints],
  );

  const pushHistory = useCallback(
    (snap: RouteSnapshot, label?: string) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, cursor + 1);
        return [...truncated, { route: snap, appliedAt: Date.now(), label }];
      });
      setCursor((c) => c + 1);
    },
    [cursor],
  );

  const applyMutation = useCallback(
    async (mutation: Mutation): Promise<ExecutorResult> => {
      const current = snapshotCurrentRoute();
      if (!current) {
        const failure: ExecutorResult = {
          ok: false,
          reason: { kind: 'context_missing', required_field: 'route' },
        };
        setLastError('No current route to edit');
        trackRb2('mutation_failed', {
          mutation_type: mutation.type,
          failure_kind: 'context_missing',
        });
        return failure;
      }
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const result = await executorAdapter.applyMutation(current, mutation);
        if (result.ok) {
          pushHistory(result.route, mutation.type);
          writeSnapshotToStore(result.route);
          trackRb2('mutation_applied', {
            mutation_type: mutation.type,
            duration_ms: Date.now() - startedAt,
          });
        } else {
          setLastError(formatFailure(result.reason));
          trackRb2('mutation_failed', {
            mutation_type: mutation.type,
            failure_kind: result.reason.kind,
          });
        }
        return result;
      } finally {
        setIsApplying(false);
      }
    },
    [pushHistory, snapshotCurrentRoute, writeSnapshotToStore],
  );

  const applyAIEdit = useCallback(
    async (
      text: string,
    ): Promise<
      ExecutorResult | { ok: false; reason: 'chat_translation_unavailable' }
    > => {
      const mutation = executorAdapter.interpretChatInput(text);
      if (!mutation) {
        trackRb2('ai_edit_unavailable', {});
        return { ok: false, reason: 'chat_translation_unavailable' as const };
      }
      return applyMutation(mutation);
    },
    [applyMutation],
  );

  const undo = useCallback((): boolean => {
    if (cursor < 0) return false;
    if (cursor === 0) {
      // Going back beyond first entry is a no-op in v1 — clear is a
      // separate action handled by the store.
      return false;
    }
    const previous = history[cursor - 1];
    if (!previous) return false;
    writeSnapshotToStore(previous.route);
    setCursor(cursor - 1);
    return true;
  }, [cursor, history, writeSnapshotToStore]);

  const redo = useCallback((): boolean => {
    const next = history[cursor + 1];
    if (!next) return false;
    writeSnapshotToStore(next.route);
    setCursor(cursor + 1);
    return true;
  }, [cursor, history, writeSnapshotToStore]);

  return {
    isApplying,
    lastError,
    canUndo: cursor > 0,
    canRedo: cursor >= 0 && cursor < history.length - 1,
    historyDepth: history.length,
    applyMutation,
    applyAIEdit,
    undo,
    redo,
  };
}
