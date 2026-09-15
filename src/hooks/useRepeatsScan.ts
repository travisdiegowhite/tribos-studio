/**
 * useRepeatsScan — match `activities` against `anchor` without ever blocking
 * the page.
 *
 * In a browser the work runs in a Web Worker (src/workers/repeatsScan.worker)
 * so a pathological track cannot freeze the tab; where workers are missing
 * (tests) or the worker fails to start, it falls back to the same resumable
 * scan stepped in short slices between frames. Either way the page sees
 * progress and, at the end, efforts with their ride rows attached.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRepeatsScan, repeatColor, type RepeatAnchor, type RepeatEffort } from '../utils/rideRepeats';
import type { SlimRide, WorkerRequest, WorkerResponse } from '../workers/repeatsScan.worker';

export type ColoredEffort = RepeatEffort & { color: string };

export interface RepeatsScanState {
  efforts: ColoredEffort[];
  done: boolean;
  processed: number;
  total: number;
}

type RideRow = Record<string, unknown> & { id: string };

/** Matching runs in slices this long on the main-thread fallback. */
const SLICE_MS = 24;

const IDLE: RepeatsScanState = { efforts: [], done: true, processed: 0, total: 0 };

/**
 * Only what the matcher reads. The full row carries raw provider payloads
 * and analytics blobs that would make the copy into the worker expensive.
 */
export function slimRide(ride: RideRow): SlimRide {
  return {
    id: ride.id,
    name: ride.name,
    start_date: ride.start_date,
    recorded_at: ride.recorded_at,
    duplicate_of: ride.duplicate_of,
    activity_streams: ride.activity_streams,
    map_summary_polyline: ride.map_summary_polyline,
    summary_polyline: ride.summary_polyline,
    polyline: ride.polyline,
    map: ride.map ? { summary_polyline: (ride.map as { summary_polyline?: string }).summary_polyline } : undefined,
  };
}

function color(efforts: RepeatEffort[]): ColoredEffort[] {
  return efforts.map((e, i) => ({ ...e, color: repeatColor(i) }));
}

function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined' && typeof import.meta.url === 'string';
}

export function useRepeatsScan(anchor: RepeatAnchor | null, activities: readonly RideRow[]): RepeatsScanState {
  const [state, setState] = useState<RepeatsScanState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const workerBroken = useRef(false);
  const tokenRef = useRef(0);
  const byId = useMemo(() => new Map(activities.map((r) => [r.id, r])), [activities]);

  // One worker per mount; fed the rides whenever they change.
  useEffect(() => {
    if (!canUseWorker() || workerBroken.current) return undefined;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/repeatsScan.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      workerBroken.current = true;
      return undefined;
    }
    worker.onerror = () => {
      // Fall back to the main thread for this and later scans.
      workerBroken.current = true;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setState((s) => ({ ...s, done: true }));
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const msg: WorkerRequest = { type: 'rides', rides: activities.map(slimRide) };
    worker.postMessage(msg);
  }, [activities]);

  useEffect(() => {
    const token = ++tokenRef.current;
    const worker = workerRef.current;

    if (worker && !workerBroken.current) {
      const onMessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.token !== token) return;
        if (m.type === 'progress') {
          setState({ efforts: [], done: false, processed: m.processed, total: m.total });
        } else if (m.type === 'done') {
          const efforts = m.efforts
            .map((we) => {
              const ride = byId.get(we.rideId);
              return ride ? ({ ...we, ride } as RepeatEffort) : null;
            })
            .filter((e): e is RepeatEffort => e !== null);
          setState({ efforts: color(efforts), done: true, processed: m.efforts.length, total: m.efforts.length });
        }
      };
      worker.addEventListener('message', onMessage);
      setState({ efforts: [], done: anchor == null, processed: 0, total: anchor ? activities.length : 0 });
      const msg: WorkerRequest = { type: 'scan', token, anchor };
      worker.postMessage(msg);
      return () => worker.removeEventListener('message', onMessage);
    }

    // Main-thread fallback: the same scan, stepped between frames.
    const scan = createRepeatsScan(anchor, activities);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const publish = () =>
      setState({
        efforts: scan.done ? color(scan.efforts) : [],
        done: scan.done,
        processed: scan.processed,
        total: scan.total,
      });
    const run = () => {
      if (cancelled) return;
      scan.step(SLICE_MS);
      publish();
      if (!scan.done) timer = setTimeout(run, 0);
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [anchor, activities, byId]);

  return state;
}
