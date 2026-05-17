/**
 * useUserLocation — geolocation source for Route Builder 2.0
 * `start_coord`.
 *
 * Replaces the missing `home_lng/home_lat` columns referenced by the
 * pre-T2.6.2 RouteContext assembler (no such columns exist; the audit
 * found the queries 404/400ing). Mirrors the legacy RB1 pattern in
 * `src/pages/RouteBuilder.jsx:684–719`: request once per session via
 * a ref guard, surface a status flag so the form can render an
 * "acquiring location…" hint, and fall back to a clear `denied` /
 * `error` state the user can act on.
 *
 * Auto-requests on mount when `autoRequest: true` (default). Tests
 * pass `autoRequest: false` and call `requestLocation()` manually to
 * keep the navigator mock simple.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinate } from '../../types/geo';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export type UserLocationStatus =
  | 'idle'
  | 'locating'
  | 'ok'
  | 'denied'
  | 'error'
  | 'unsupported';

export interface UseUserLocationReturn {
  /** Canonical `[lng, lat]` when status is `'ok'`; null otherwise. */
  coord: Coordinate | null;
  status: UserLocationStatus;
  error: string | null;
  /**
   * Re-request geolocation. Resets the per-session guard so a user
   * can retry after granting permission. Idempotent while a request
   * is in flight.
   */
  requestLocation: () => void;
}

export interface UseUserLocationOptions {
  /** Auto-request on mount. Default true. */
  autoRequest?: boolean;
  /** PositionOptions passed to `getCurrentPosition`. Defaults mirror legacy RB1. */
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseUserLocationOptions, 'autoRequest'>> = {
  enableHighAccuracy: true,
  timeoutMs: 10_000,
  maximumAgeMs: 5 * 60_000, // 5min — matches legacy
};

export function useUserLocation(
  options: UseUserLocationOptions = {},
): UseUserLocationReturn {
  const autoRequest = options.autoRequest ?? true;
  const positionOptions: PositionOptions = {
    enableHighAccuracy: options.enableHighAccuracy ?? DEFAULT_OPTIONS.enableHighAccuracy,
    timeout: options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    maximumAge: options.maximumAgeMs ?? DEFAULT_OPTIONS.maximumAgeMs,
  };

  const [coord, setCoord] = useState<Coordinate | null>(null);
  const [status, setStatus] = useState<UserLocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Guard against double-requests within a single session. Reset when
  // the caller explicitly invokes `requestLocation()`.
  const hasRequestedRef = useRef(false);
  const inFlightRef = useRef(false);

  const fetchPosition = useCallback(() => {
    if (inFlightRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setError('Geolocation API not available in this browser');
      trackRb2('geolocation_unsupported', {});
      return;
    }

    inFlightRef.current = true;
    hasRequestedRef.current = true;
    setStatus('locating');
    setError(null);
    trackRb2('geolocation_requested', {});
    const startedAt = Date.now();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        inFlightRef.current = false;
        const { longitude, latitude, accuracy } = position.coords;
        setCoord([longitude, latitude] as Coordinate);
        setStatus('ok');
        setError(null);
        trackRb2('geolocation_resolved', {
          duration_ms: Date.now() - startedAt,
          accuracy,
        });
      },
      (err) => {
        inFlightRef.current = false;
        const denied = err.code === err.PERMISSION_DENIED;
        setStatus(denied ? 'denied' : 'error');
        setError(err.message ?? 'Geolocation failed');
        trackRb2('geolocation_failed', {
          code: err.code,
          message: err.message ?? '',
        });
      },
      positionOptions,
    );
  }, [positionOptions]);

  useEffect(() => {
    if (!autoRequest) return;
    if (hasRequestedRef.current) return;
    fetchPosition();
    // We deliberately depend only on `autoRequest` — re-running because
    // `fetchPosition` changed (it does on every render due to
    // `positionOptions`) would cause infinite re-requests. The ref
    // guards against duplicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest]);

  const requestLocation = useCallback(() => {
    hasRequestedRef.current = false;
    fetchPosition();
  }, [fetchPosition]);

  return { coord, status, error, requestLocation };
}
