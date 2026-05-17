/**
 * useRouteEditing — Route Builder 2.0 editing hook.
 *
 * Thin wrapper around v1's AI edit pipeline. The only public action is
 * `applyAIEdit(text)`, which delegates to `replicatedEditLogic.applyAIEdit`
 * (which itself calls v1's `aiRouteEditService.classifyEditIntent` +
 * `applyRouteEdit`). Undo/redo is implemented locally via a snapshot
 * stack of `{ geometry, stats }` pairs captured immediately before each
 * edit; restoring writes back to the store.
 *
 * S2 rewire: replaces the executor-adapter `applyMutation` path. The
 * `Mutation` type and its associated taxonomy go away with the executor.
 */
import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { applyAIEdit as applyAIEditViaV1 } from '../../features/route-builder-v2/chat/replicatedEditLogic';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';
import type { Coordinate, RouteStats } from './types';

export type ApplyAIEditResult =
  | {
      ok: true;
      assistantText: string;
      distance_km: number;
      elevation_gain_m: number;
    }
  | { ok: false; reason: string };

export interface UseRouteEditingReturn {
  isApplying: boolean;
  lastError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  historyDepth: number;
  applyAIEdit: (text: string) => Promise<ApplyAIEditResult>;
  undo: () => boolean;
  redo: () => boolean;
}

interface Snapshot {
  geometry: Coordinate[];
  stats: RouteStats;
}

export function useRouteEditing(): UseRouteEditingReturn {
  const [isApplying, setIsApplying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [cursor, setCursor] = useState<number>(-1);

  const captureCurrentSnapshot = useCallback((): Snapshot | null => {
    const state = useRouteBuilderStore.getState();
    const geom = state.routeGeometry;
    if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      return null;
    }
    const stats = state.routeStats ?? {
      distance_km: 0,
      elevation_gain_m: 0,
      duration_s: 0,
    };
    return {
      geometry: geom.coordinates as Coordinate[],
      stats: {
        distance_km: stats.distance_km ?? 0,
        elevation_gain_m: stats.elevation_gain_m ?? 0,
        elevation_loss_m: (stats as { elevation_loss_m?: number }).elevation_loss_m ?? 0,
        duration_s: stats.duration_s ?? 0,
      },
    };
  }, []);

  const writeSnapshot = useCallback((snap: Snapshot) => {
    const state = useRouteBuilderStore.getState();
    state.setRouteGeometry({ type: 'LineString', coordinates: snap.geometry });
    state.setRouteStats({
      distance_km: snap.stats.distance_km,
      elevation_gain_m: snap.stats.elevation_gain_m,
      duration_s: snap.stats.duration_s,
    });
  }, []);

  const applyAIEdit = useCallback(
    async (text: string): Promise<ApplyAIEditResult> => {
      setIsApplying(true);
      setLastError(null);
      const startedAt = Date.now();
      const before = captureCurrentSnapshot();
      try {
        const result = await applyAIEditViaV1(text);
        if (!result.ok) {
          setLastError(result.reason);
          trackRb2('chat_edit_failed', {
            input_length: text.length,
            failure_reason: result.reason.slice(0, 200),
          });
          return result;
        }
        if (before) {
          setHistory((prev) => {
            const truncated = prev.slice(0, cursor + 1);
            return [...truncated, before];
          });
          setCursor((c) => c + 1);
        }
        trackRb2('chat_edit_applied', {
          input_length: text.length,
          duration_ms: Date.now() - startedAt,
          distance_km: result.distance_km,
          elevation_gain_m: result.elevation_gain_m,
        });
        return result;
      } finally {
        setIsApplying(false);
      }
    },
    [captureCurrentSnapshot, cursor],
  );

  const undo = useCallback((): boolean => {
    if (cursor < 0) return false;
    const previous = history[cursor];
    if (!previous) return false;
    // Save the current state before undoing so we can redo.
    const current = captureCurrentSnapshot();
    writeSnapshot(previous);
    if (current) {
      setHistory((prev) => {
        const copy = [...prev];
        copy[cursor] = current;
        return copy;
      });
    }
    setCursor(cursor - 1);
    return true;
  }, [cursor, history, captureCurrentSnapshot, writeSnapshot]);

  const redo = useCallback((): boolean => {
    const next = history[cursor + 1];
    if (!next) return false;
    const current = captureCurrentSnapshot();
    writeSnapshot(next);
    if (current) {
      setHistory((prev) => {
        const copy = [...prev];
        copy[cursor + 1] = current;
        return copy;
      });
    }
    setCursor(cursor + 1);
    return true;
  }, [cursor, history, captureCurrentSnapshot, writeSnapshot]);

  return {
    isApplying,
    lastError,
    canUndo: cursor >= 0,
    canRedo: cursor < history.length - 1,
    historyDepth: history.length,
    applyAIEdit,
    undo,
    redo,
  };
}
