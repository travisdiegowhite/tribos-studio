/**
 * useRouteHistory — unified undo/redo for Route Builder 2.0.
 *
 * The two pre-existing history mechanisms (`useRouteEditing`'s AI-edit
 * snapshots and v1's `useRouteManipulation` stack behind `useMapInteraction`)
 * each only see their own edits, so neither can power a correct global undo.
 *
 * This hook is source-agnostic: it watches the live route state in the
 * Zustand store (geometry + waypoints + name) and snapshots it whenever it
 * changes — regardless of whether the change came from a map drag, an AI
 * chat edit, a generation, a GPX import, or a clear. Undo/redo restore a
 * snapshot in a single `setRoute` call (one render → one effect pass), with
 * a guard so the restore isn't recorded as a new edit.
 *
 * Snapshots are compared by a cheap signature (point count + endpoints +
 * waypoint positions + name) rather than reference, so stats-only churn from
 * background analysis doesn't create spurious history entries.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

interface RouteGeometryLike {
  type: 'LineString';
  coordinates: Array<[number, number] | [number, number, number]>;
}

interface RouteStatsLike {
  distance_km: number;
  elevation_gain_m: number;
  duration_s: number;
  [key: string]: unknown;
}

interface WaypointLike {
  id: string;
  position: [number, number];
  type?: string;
  name?: string;
}

interface Snapshot {
  geometry: RouteGeometryLike | null;
  stats: RouteStatsLike | null;
  name: string;
  waypoints: WaypointLike[];
}

export interface UseRouteHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_CAP = 30;

function signature(
  geometry: RouteGeometryLike | null,
  waypoints: WaypointLike[],
  name: string,
): string {
  const coords = Array.isArray(geometry?.coordinates) ? geometry!.coordinates : [];
  const len = coords.length;
  const first = len ? coords[0] : null;
  const last = len ? coords[len - 1] : null;
  const wp = Array.isArray(waypoints)
    ? waypoints.map((w) => `${w.position?.[0]},${w.position?.[1]}`).join(';')
    : '';
  return `${name}|${len}|${first?.[0]},${first?.[1]}|${last?.[0]},${last?.[1]}|${wp}`;
}

export function useRouteHistory(cap: number = DEFAULT_CAP): UseRouteHistoryReturn {
  const geometry = useRouteBuilderStore((s) => s.routeGeometry) as RouteGeometryLike | null;
  const stats = useRouteBuilderStore((s) => s.routeStats) as RouteStatsLike | null;
  const name = useRouteBuilderStore((s) => s.routeName) as string;
  const waypoints = useRouteBuilderStore((s) => s.waypoints) as WaypointLike[];
  const setRoute = useRouteBuilderStore((s) => s.setRoute) as (data: {
    geometry: RouteGeometryLike | null;
    name: string;
    stats: RouteStatsLike | null;
    waypoints: WaypointLike[];
    source: string;
  }) => void;

  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const presentRef = useRef<Snapshot | null>(null);
  const presentSigRef = useRef<string | null>(null);
  const restoringRef = useRef(false);
  // Bumped on every history mutation so canUndo/canRedo re-evaluate.
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const currentSig = signature(geometry, waypoints, name);

  useEffect(() => {
    const snap: Snapshot = { geometry, stats, name, waypoints };

    if (restoringRef.current) {
      // This store change is our own restore — adopt as present, don't record.
      presentRef.current = snap;
      presentSigRef.current = currentSig;
      restoringRef.current = false;
      return;
    }

    if (presentSigRef.current === currentSig) {
      // Same route shape (e.g. background stats refresh) — keep present's
      // stats current without creating a history entry.
      if (presentRef.current) presentRef.current = snap;
      return;
    }

    // A genuinely new state. Push the prior present onto the undo stack.
    if (presentRef.current) {
      pastRef.current.push(presentRef.current);
      if (pastRef.current.length > cap) pastRef.current.shift();
    }
    presentRef.current = snap;
    presentSigRef.current = currentSig;
    futureRef.current = []; // a new edit invalidates the redo branch
    bump();
    // currentSig captures the watched fields; including the raw values keeps
    // the snapshot fresh without re-running when only `stats` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSig]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    if (presentRef.current) futureRef.current.unshift(presentRef.current);
    restoringRef.current = true;
    setRoute({
      geometry: prev.geometry,
      name: prev.name,
      stats: prev.stats,
      waypoints: prev.waypoints,
      source: 'history',
    });
    trackRb2('route_undo', { remaining_undo: pastRef.current.length });
    bump();
  }, [setRoute]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.shift()!;
    if (presentRef.current) pastRef.current.push(presentRef.current);
    restoringRef.current = true;
    setRoute({
      geometry: next.geometry,
      name: next.name,
      stats: next.stats,
      waypoints: next.waypoints,
      source: 'history',
    });
    trackRb2('route_redo', { remaining_redo: futureRef.current.length });
    bump();
  }, [setRoute]);

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undo,
    redo,
  };
}

export default useRouteHistory;
