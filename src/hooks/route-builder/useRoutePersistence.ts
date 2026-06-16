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
import { parseGpxFile } from '../../utils/gpxParser.js';
import { garminService } from '../../utils/garminService';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';
import type { Coordinate } from '../../types/geo';

interface GpxTrackPoint {
  latitude: number;
  longitude: number;
  elevation?: number | null;
  distance_m?: number | null;
}

interface GpxParseResult {
  metadata?: { name?: string };
  summary?: {
    totalDistance_km?: number;
    totalAscent?: number;
    totalMovingTime?: number;
    totalElapsedTime?: number;
  };
  trackPoints?: GpxTrackPoint[];
}

const parseGpx = parseGpxFile as (
  content: string,
  fileName?: string,
) => Promise<GpxParseResult>;

interface SavedRouteRow {
  id: string;
  name?: string;
  description?: string | null;
  geometry?: unknown;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  estimated_duration_minutes?: number | null;
  waypoints?: unknown[] | null;
}

const saveRoute = routesService.saveRoute as (data: unknown) => Promise<SavedRouteRow>;
const getRoute = routesService.getRoute as (id: string) => Promise<SavedRouteRow | null>;
const listRoutesSvc = routesService.listRoutes as () => Promise<SavedRouteRow[]>;
const deleteRouteSvc = routesService.deleteRoute as (id: string) => Promise<unknown>;

export type ExportFormat = 'gpx' | 'tcx' | 'fit';

/**
 * Outcome of a direct device push. `courses_unavailable` is the
 * Garmin-Courses-API-disabled case the caller falls back to a TCX
 * download for; `reconnect` means the integration needs re-auth.
 */
export type DevicePushResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason: 'no_route' | 'reconnect' | 'courses_unavailable' | 'error';
      message: string;
    };

/**
 * Outcome of a share-link copy. `not_saved` means the route has no id yet —
 * the caller should prompt the user to save first.
 */
export type ShareResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_saved' };

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
  save: (name?: string, description?: string) => Promise<SavedRoute | null>;
  loadRoute: (id: string) => Promise<boolean>;
  listSavedRoutes: () => Promise<SavedRouteSummary[]>;
  /** Delete a saved route by id. Clears `savedRouteId` if it was the open one. */
  deleteRoute: (id: string) => Promise<boolean>;
  exportRoute: (format: ExportFormat) => void;
  /**
   * Parse a .gpx file and load it as the current route. Returns the track
   * coordinates on success (so the caller can frame the camera) or null on
   * failure (with `lastError` set).
   */
  importGpx: (file: File) => Promise<Coordinate[] | null>;
  /** True while a device push is in flight. */
  isPushingToDevice: boolean;
  /** Whether the user's Garmin account is connected (null = not yet checked). */
  checkGarminConnection: () => Promise<boolean>;
  /**
   * Push the current route to Garmin Connect as a Course. Returns a
   * structured result so the caller owns notifications + the
   * Courses-API-unavailable → TCX fallback.
   */
  pushToGarmin: () => Promise<DevicePushResult>;
  /**
   * Copy a public share link (`/routes/:id`) to the clipboard. Requires the
   * route to be saved; returns `not_saved` otherwise so the caller can
   * prompt a save.
   */
  shareRoute: () => Promise<ShareResult>;
}

export function useRoutePersistence(): UseRoutePersistenceReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  const [isPushingToDevice, setIsPushingToDevice] = useState(false);

  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const routeDescription = useRouteBuilderStore((s) => s.routeDescription);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const trainingGoal = useRouteBuilderStore((s) => s.trainingGoal);
  const routeType = useRouteBuilderStore((s) => s.routeType);
  const routeProfile = useRouteBuilderStore((s) => s.routeProfile);
  const setRouteFromStore = useRouteBuilderStore((s) => s.setRoute);
  const setRouteName = useRouteBuilderStore((s) => s.setRouteName);
  const setRouteDescription = useRouteBuilderStore((s) => s.setRouteDescription);

  const save = useCallback(
    async (nameOverride?: string, descriptionOverride?: string): Promise<SavedRoute | null> => {
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
        const description = descriptionOverride ?? routeDescription ?? '';
        if (descriptionOverride !== undefined && descriptionOverride !== routeDescription) {
          setRouteDescription(description);
        }
        const distance_km = routeStats?.distance_km ?? null;
        const elevation_gain_m = routeStats?.elevation_gain_m ?? null;
        const duration_s = routeStats?.duration_s ?? null;
        const routeData = {
          id: savedRouteId ?? undefined,
          name,
          description,
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
      routeDescription,
      routeStats,
      routeType,
      trainingGoal,
      routeProfile,
      waypoints,
      savedRouteId,
      setRouteName,
      setRouteDescription,
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
          description: route.description ?? '',
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

  const deleteRoute = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteRouteSvc(id);
        setSavedRouteId((cur) => (cur === id ? null : cur));
        trackRb2('route_deleted', {});
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        return false;
      }
    },
    [],
  );

  const importGpx = useCallback(
    async (file: File): Promise<Coordinate[] | null> => {
      setIsLoading(true);
      setLastError(null);
      try {
        const text = await file.text();
        const parsed = await parseGpx(text, file.name);
        const points = parsed.trackPoints ?? [];
        if (points.length < 2) {
          setLastError('GPX file has too few track points to build a route.');
          trackRb2('route_import_failed', { reason: 'too_few_points' });
          return null;
        }
        // GPX track points are {latitude, longitude}; convert at this seam to
        // canonical [lng, lat] (T1.2 coordinate contract).
        const coordinates: Coordinate[] = points.map(
          (p) => [p.longitude, p.latitude] as Coordinate,
        );
        const summary = parsed.summary ?? {};
        const stats = {
          distance_km: summary.totalDistance_km ?? 0,
          elevation_gain_m: summary.totalAscent ?? 0,
          duration_s: summary.totalMovingTime || summary.totalElapsedTime || 0,
        };
        const name =
          parsed.metadata?.name?.trim() ||
          file.name.replace(/\.gpx$/i, '').trim() ||
          'Imported Route';
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        setRouteFromStore({
          geometry: { type: 'LineString', coordinates },
          name,
          stats,
          waypoints: [
            { id: 'wp-0', position: start, type: 'start', name: '' },
            { id: 'wp-1', position: end, type: 'end', name: '' },
          ],
          source: 'imported',
        });
        // Imported routes aren't persisted yet — clear any prior saved id so
        // the next Save creates a new row rather than overwriting.
        setSavedRouteId(null);
        trackRb2('route_imported', { point_count: points.length, source: 'gpx' });
        return coordinates;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('route_import_failed', { error_message: message.slice(0, 200) });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setRouteFromStore],
  );

  const checkGarminConnection = useCallback(async (): Promise<boolean> => {
    try {
      const status = (await (garminService as {
        getConnectionStatus: () => Promise<{ connected?: boolean }>;
      }).getConnectionStatus()) ?? {};
      return status.connected === true;
    } catch {
      return false;
    }
  }, []);

  const pushToGarmin = useCallback(async (): Promise<DevicePushResult> => {
    const coords = (routeGeometry as { coordinates?: [number, number][] } | null)?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      setLastError('No route to send');
      return { ok: false, reason: 'no_route', message: 'No route to send' };
    }

    setIsPushingToDevice(true);
    setLastError(null);
    const routeData = {
      name: routeName ?? 'Untitled Route',
      coordinates: coords,
      distanceKm: routeStats?.distance_km ?? undefined,
      elevationGainM: routeStats?.elevation_gain_m ?? undefined,
      elevationLossM: routeStats?.elevation_loss_m ?? undefined,
      routeType,
      surfaceType: routeProfile,
    };

    try {
      const result = (await (garminService as {
        pushRoute: (data: unknown) => Promise<{
          success?: boolean;
          message?: string;
          error?: string;
          details?: string;
          code?: string;
          requiresReconnect?: boolean;
        }>;
      }).pushRoute(routeData)) ?? {};

      if (result.success) {
        trackRb2('route_pushed_to_device', {
          provider: 'garmin',
          distance_km: routeStats?.distance_km ?? null,
        });
        return {
          ok: true,
          message: result.message || 'Route sent to Garmin Connect. Sync your device to download it.',
        };
      }

      const detail = `${result.error ?? ''} ${result.details ?? ''}`.trim();
      const reason: 'reconnect' | 'courses_unavailable' | 'error' =
        result.requiresReconnect || /reconnect|authorization/i.test(detail)
          ? 'reconnect'
          : result.code === 'COURSES_API_NOT_AVAILABLE' ||
              /COURSES_API_NOT_AVAILABLE|ApplicationNotFound/i.test(detail)
            ? 'courses_unavailable'
            : 'error';

      const message =
        reason === 'reconnect'
          ? 'Please reconnect your Garmin account in Settings.'
          : reason === 'courses_unavailable'
            ? 'Direct send is not available yet — downloading a TCX instead.'
            : result.error || 'Failed to send route to Garmin';

      trackRb2('route_push_failed', { provider: 'garmin', reason });
      return { ok: false, reason, message };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
      trackRb2('route_push_failed', { provider: 'garmin', reason: 'error' });
      return { ok: false, reason: 'error', message };
    } finally {
      setIsPushingToDevice(false);
    }
  }, [routeGeometry, routeName, routeStats, routeType, routeProfile]);

  const shareRoute = useCallback(async (): Promise<ShareResult> => {
    if (!savedRouteId) {
      return { ok: false, reason: 'not_saved' };
    }
    const url = `${window.location.origin}/routes/${savedRouteId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers without the async clipboard API.
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // Even the fallback failed — still return ok with the url so the
        // caller can surface it for manual copy.
      }
    }
    trackRb2('route_shared', { route_id: savedRouteId });
    return { ok: true, url };
  }, [savedRouteId]);

  return {
    isSaving,
    isLoading,
    lastError,
    savedRouteId,
    save,
    loadRoute,
    listSavedRoutes,
    deleteRoute,
    exportRoute,
    importGpx,
    isPushingToDevice,
    checkGarminConnection,
    pushToGarmin,
    shareRoute,
  };
}
