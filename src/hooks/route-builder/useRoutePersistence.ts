/**
 * useRoutePersistence — Route Builder 2.0 save / load / export hook.
 *
 * Thin wrapper around v1's `routesService` for save/load and
 * `routeExport` for GPX/TCX/FIT serialization. S2 rewire: drops the
 * executor-type imports; otherwise behavior is the same as P1.2 since
 * persistence never went through the executor adapter.
 */
import { useCallback, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import * as routesService from '../../utils/routesService';
import { exportAndDownloadRoute } from '../../utils/routeExport';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

interface SavedRouteRow {
  id: string;
  name?: string;
  geometry?: unknown;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  estimated_duration_minutes?: number | null;
  waypoints?: unknown[] | null;
}

const saveRoute = routesService.saveRoute as (data: unknown) => Promise<SavedRouteRow>;
const getRoute = routesService.getRoute as (id: string) => Promise<SavedRouteRow | null>;
const listRoutesSvc = routesService.listRoutes as () => Promise<SavedRouteRow[]>;

export type ExportFormat = 'gpx' | 'tcx' | 'fit';

export interface SavedRoute {
  id: string;
  name?: string;
}

export interface SavedRouteSummary {
  id: string;
  name?: string;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
}

export interface UseRoutePersistenceReturn {
  isSaving: boolean;
  isLoading: boolean;
  lastError: string | null;
  savedRouteId: string | null;
  save: (name?: string) => Promise<SavedRoute | null>;
  loadRoute: (id: string) => Promise<boolean>;
  listSavedRoutes: () => Promise<SavedRouteSummary[]>;
  exportRoute: (format: ExportFormat) => void;
}

export function useRoutePersistence(): UseRoutePersistenceReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const trainingGoal = useRouteBuilderStore((s) => s.trainingGoal);
  const routeType = useRouteBuilderStore((s) => s.routeType);
  const routeProfile = useRouteBuilderStore((s) => s.routeProfile);
  const setRouteFromStore = useRouteBuilderStore((s) => s.setRoute);
  const setRouteName = useRouteBuilderStore((s) => s.setRouteName);

  const save = useCallback(
    async (nameOverride?: string): Promise<SavedRoute | null> => {
      if (!routeGeometry) {
        setLastError('No route to save');
        return null;
      }
      setIsSaving(true);
      setLastError(null);
      const startedAt = Date.now();
      try {
        const name = nameOverride ?? routeName ?? 'Untitled Route';
        if (nameOverride && nameOverride !== routeName) setRouteName(name);
        const distance_km = routeStats?.distance_km ?? null;
        const elevation_gain_m = routeStats?.elevation_gain_m ?? null;
        const duration_s = routeStats?.duration_s ?? null;
        const routeData = {
          id: savedRouteId ?? undefined,
          name,
          geometry: routeGeometry,
          distance_km,
          elevation_gain_m,
          estimated_duration_minutes:
            duration_s != null ? Math.round(duration_s / 60) : null,
          route_type: routeType,
          training_goal: trainingGoal,
          surface_type: routeProfile,
          generated_by: 'rb2',
          waypoints: waypoints?.length ? waypoints : null,
        };
        const saved = await saveRoute(routeData);
        const isNew = !savedRouteId;
        setSavedRouteId(saved.id);
        trackRb2('route_saved', {
          is_new: isNew,
          distance_km,
          elevation_gain_m,
          duration_ms: Date.now() - startedAt,
        });
        return { id: saved.id, name };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('route_save_failed', { error_message: message.slice(0, 200) });
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [
      routeGeometry,
      routeName,
      routeStats,
      routeType,
      trainingGoal,
      routeProfile,
      waypoints,
      savedRouteId,
      setRouteName,
    ],
  );

  const loadRoute = useCallback(
    async (id: string): Promise<boolean> => {
      setIsLoading(true);
      setLastError(null);
      try {
        const route = await getRoute(id);
        if (!route) {
          setLastError('Route not found');
          return false;
        }
        setRouteFromStore({
          geometry: route.geometry,
          name: route.name,
          stats: {
            distance_km: route.distance_km ?? 0,
            elevation_gain_m: route.elevation_gain_m ?? 0,
            duration_s: route.estimated_duration_minutes
              ? route.estimated_duration_minutes * 60
              : 0,
          },
          waypoints: route.waypoints ?? [],
          source: 'loaded',
        });
        setSavedRouteId(route.id);
        trackRb2('route_loaded', { route_id: route.id });
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [setRouteFromStore],
  );

  const exportRoute = useCallback(
    (format: ExportFormat) => {
      if (!routeGeometry || !Array.isArray((routeGeometry as { coordinates?: unknown[] }).coordinates)) {
        setLastError('No route to export');
        return;
      }
      const coords = (routeGeometry as { coordinates: [number, number][] | [number, number, number][] }).coordinates;
      try {
        exportAndDownloadRoute(
          {
            name: routeName ?? 'Untitled Route',
            coordinates: coords,
            distanceKm: routeStats?.distance_km ?? undefined,
            elevationGainM: routeStats?.elevation_gain_m ?? undefined,
            waypoints: Array.isArray(waypoints)
              ? waypoints
                  .filter((wp): wp is { position: [number, number]; type?: string; name?: string } => {
                    const p = (wp as { position?: unknown }).position;
                    return Array.isArray(p) && p.length === 2;
                  })
                  .map((wp) => ({
                    lng: wp.position[0],
                    lat: wp.position[1],
                    name: wp.name,
                    type: (wp.type as 'start' | 'end' | 'waypoint' | 'poi' | undefined) ?? 'waypoint',
                  }))
              : undefined,
          },
          format,
        );
        trackRb2('route_exported', { format, route_id: savedRouteId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('route_export_failed', { format, error_message: message.slice(0, 200) });
      }
    },
    [routeGeometry, routeName, routeStats, waypoints, savedRouteId],
  );

  const listSavedRoutes = useCallback(async (): Promise<SavedRouteSummary[]> => {
    try {
      const rows = await listRoutesSvc();
      return (rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        distance_km: r.distance_km ?? null,
        elevation_gain_m: r.elevation_gain_m ?? null,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
      return [];
    }
  }, []);

  return {
    isSaving,
    isLoading,
    lastError,
    savedRouteId,
    save,
    loadRoute,
    listSavedRoutes,
    exportRoute,
  };
}
