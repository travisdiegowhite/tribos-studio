/**
 * useRideFlyThrough — plays a ride back on the map.
 *
 * Advances a distance along the track in real time, easing the camera
 * toward a point on the route with a bearing in the direction of travel,
 * and reports the current distance each frame so the caller can move the
 * marker, the strip cursor and the readout in step. Pausing leaves the
 * camera where it is; finishing (or stop) hands the camera back via
 * `onFinish`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LngLat } from '../utils/rideMapCamera';
import {
  FLY_BEARING_EASE,
  FLY_CENTER_EASE,
  FLY_PITCH,
  FLY_ZOOM,
  flyThroughDurationS,
  headingAt,
  lerpAngle,
  positionAt,
} from '../utils/rideFlyThrough';

/** The slice of mapbox-gl's Map the loop needs, so tests can stub it. */
export interface FlyMap {
  jumpTo(options: { center: [number, number]; bearing: number; pitch: number; zoom: number }): unknown;
  getCenter(): { lng: number; lat: number };
  getBearing(): number;
}

export interface UseRideFlyThroughArgs {
  getMap: () => FlyMap | null | undefined;
  coords: readonly LngLat[];
  distances_km: readonly number[];
  onProgress: (km: number | null) => void;
  onFinish?: () => void;
}

export interface RideFlyThrough {
  playing: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useRideFlyThrough({
  getMap,
  coords,
  distances_km,
  onProgress,
  onFinish,
}: UseRideFlyThroughArgs): RideFlyThrough {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<number | null>(null);
  const kmRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const camRef = useRef<{ center: [number, number]; bearing: number } | null>(null);
  // Latest callbacks without restarting the loop
  const onProgressRef = useRef(onProgress);
  const onFinishRef = useRef(onFinish);
  onProgressRef.current = onProgress;
  onFinishRef.current = onFinish;

  const totalKm = distances_km.length ? distances_km[distances_km.length - 1] : 0;
  const kmPerSecond = totalKm > 0 ? totalKm / flyThroughDurationS(totalKm) : 0;

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
    lastTsRef.current = null;
  }, []);

  const pause = useCallback(() => {
    cancelFrame();
    setPlaying(false);
  }, [cancelFrame]);

  const stop = useCallback(() => {
    cancelFrame();
    kmRef.current = 0;
    camRef.current = null;
    setPlaying(false);
    onProgressRef.current(null);
    onFinishRef.current?.();
  }, [cancelFrame]);

  const play = useCallback(() => {
    if (coords.length < 2 || kmPerSecond <= 0) return;
    if (typeof requestAnimationFrame !== 'function') return;
    cancelFrame();
    if (kmRef.current >= totalKm) kmRef.current = 0;
    setPlaying(true);

    const frame = (ts: number) => {
      const map = getMap();
      if (!map) {
        stop();
        return;
      }
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dt = Math.min(0.1, (ts - last) / 1000);
      kmRef.current = Math.min(totalKm, kmRef.current + dt * kmPerSecond);
      const km = kmRef.current;

      const target = positionAt(coords, distances_km, km);
      const heading = headingAt(coords, distances_km, km);
      if (target) {
        const prev = camRef.current ?? {
          center: [map.getCenter().lng, map.getCenter().lat] as [number, number],
          bearing: heading ?? map.getBearing(),
        };
        const center: [number, number] = [
          prev.center[0] + (target[0] - prev.center[0]) * FLY_CENTER_EASE,
          prev.center[1] + (target[1] - prev.center[1]) * FLY_CENTER_EASE,
        ];
        const bearing = heading == null ? prev.bearing : lerpAngle(prev.bearing, heading, FLY_BEARING_EASE);
        camRef.current = { center, bearing };
        map.jumpTo({ center, bearing, pitch: FLY_PITCH, zoom: FLY_ZOOM });
      }
      onProgressRef.current(km);

      if (km >= totalKm) {
        stop();
        return;
      }
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);
  }, [coords, distances_km, kmPerSecond, totalKm, getMap, cancelFrame, stop]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  // Stop on unmount or when the track changes under us
  useEffect(() => () => cancelFrame(), [cancelFrame]);
  useEffect(() => {
    cancelFrame();
    kmRef.current = 0;
    camRef.current = null;
    setPlaying(false);
  }, [coords, cancelFrame]);

  return { playing, play, pause, stop, toggle };
}

export default useRideFlyThrough;
