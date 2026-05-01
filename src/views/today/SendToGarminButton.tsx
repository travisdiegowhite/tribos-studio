/**
 * SendToGarminButton — push the selected route to Garmin Connect
 *
 * Wraps `garminService.pushRoute()`. Renders only when:
 *   1. Garmin is connected (checked once on mount via getConnectionStatus)
 *   2. A route is selected (the picker is the focal interaction otherwise)
 *
 * On success → toast + PostHog event. On failure → toast with retry hint.
 *
 * The push handler logic mirrors what RouteExportMenu.jsx does for the
 * "Send to Garmin" menu item — duplicated rather than refactored
 * because the surfaces differ (this is a primary CTA, not a menu).
 */

import { useEffect, useState } from 'react';
import { Button, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CloudArrowUp, Check } from '@phosphor-icons/react';
import { garminService } from '../../utils/garminService';
import { exportAndDownloadRoute, type RouteData } from '../../utils/routeExport';
import { trackFeature, EventType } from '../../utils/activityTracking';

interface RoutePayload {
  id?: string;
  name?: string | null;
  description?: string | null;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  geometry?: unknown;
  waypoints?: unknown;
  route_type?: string | null;
  surface_type?: string | null;
}

interface SendToGarminButtonProps {
  route: RoutePayload | null;
}

function buildPushPayload(route: RoutePayload) {
  // Mirrors the shape RouteExportMenu uses: the API expects coordinates
  // as [lng, lat][] (or [lng, lat, ele][]). routes.geometry stores them
  // already in that shape under coordinates.
  const geometry = route.geometry as { type?: string; coordinates?: unknown } | undefined;
  let coordinates: number[][] = [];
  if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    coordinates = geometry.coordinates as number[][];
  } else if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    coordinates = (geometry.coordinates as number[][][]).flat();
  }

  return {
    name: route.name || 'Today Route',
    description: route.description || undefined,
    coordinates: coordinates as [number, number][] | [number, number, number][],
    waypoints: route.waypoints as RouteData['waypoints'],
    distanceKm: route.distance_km ?? undefined,
    elevationGainM: route.elevation_gain_m ?? undefined,
    elevationLossM: route.elevation_loss_m ?? undefined,
    routeType: (route.route_type as RouteData['routeType']) ?? undefined,
    surfaceType: (route.surface_type as RouteData['surfaceType']) ?? undefined,
  } satisfies RouteData;
}

function SendToGarminButton({ route }: SendToGarminButtonProps) {
  const [garminConnected, setGarminConnected] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await garminService.getConnectionStatus();
        if (!cancelled) setGarminConnected(Boolean(status?.connected));
      } catch {
        if (!cancelled) setGarminConnected(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (garminConnected !== true || !route) return null;

  const handleSend = async () => {
    setSending(true);
    const payload = buildPushPayload(route);
    try {
      const result = await garminService.pushRoute(payload);
      if (result?.success) {
        trackFeature(EventType.ROUTE_SEND_TO_GARMIN, {
          routeName: payload.name,
          source: 'today_view',
          success: true,
        });
        notifications.show({
          title: 'Sent to Garmin',
          message: result.message || 'Route sent. Sync your device to download it.',
          color: 'green',
          icon: <Check size={16} />,
          autoClose: 5000,
        });

        // PostHog spec event (separate from the broad-feature trackFeature).
        // posthog-js auto-attaches via PostHogProvider; capture if available.
        if (typeof window !== 'undefined' && (window as unknown as { posthog?: { capture: (e: string, p?: object) => void } }).posthog) {
          (window as unknown as { posthog: { capture: (e: string, p?: object) => void } }).posthog.capture(
            'today_view.route_sent_to_garmin',
            { view_version: 'today_v1', route_id: route.id },
          );
        }
      } else {
        const errorMsg = result?.details ? `${result.error}: ${result.details}` : result?.error || 'Failed to send route';
        throw new Error(errorMsg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send route';
      // Auto-fallback for the well-known "Courses API not enabled" case.
      if (/COURSES_API_NOT_AVAILABLE|ApplicationNotFound/.test(message)) {
        notifications.show({
          title: 'Direct send not available yet',
          message: 'Downloading as TCX instead. Import it at connect.garmin.com > Courses > Import.',
          color: 'yellow',
          autoClose: 8000,
        });
        try {
          exportAndDownloadRoute(payload, 'tcx');
        } catch {
          // ignore
        }
      } else {
        notifications.show({
          title: 'Send failed',
          message,
          color: 'red',
          autoClose: 8000,
        });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      onClick={handleSend}
      disabled={sending}
      leftSection={sending ? <Loader size={16} /> : <CloudArrowUp size={18} />}
      variant="filled"
      size="md"
      style={{ borderRadius: 0 }}
    >
      {sending ? 'Sending…' : 'Send to Garmin'}
    </Button>
  );
}

export default SendToGarminButton;
