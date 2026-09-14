/**
 * repeatsScan.worker — runs the REPEATS matcher off the main thread.
 *
 * The page posts its (slimmed) activity rows once, then one `scan` message
 * per anchor. The worker answers with progress and, when finished, the
 * efforts with the ride row stripped (the page re-attaches it by id, so the
 * heavy row never crosses the boundary twice). A newer scan supersedes an
 * older one: the old loop notices its token is stale and stops.
 *
 * Nothing in here touches the DOM; the matching itself is the pure
 * createRepeatsScan in src/utils/rideRepeats.ts.
 */

import { createRepeatsScan, type RepeatAnchor, type RepeatEffort } from '../utils/rideRepeats';

export type SlimRide = Record<string, unknown> & { id: string };

export type WorkerRequest =
  | { type: 'rides'; rides: SlimRide[] }
  | { type: 'scan'; token: number; anchor: RepeatAnchor | null };

export type WorkerEffort = Omit<RepeatEffort, 'ride'> & { rideId: string };

export type WorkerResponse =
  | { type: 'progress'; token: number; processed: number; total: number }
  | { type: 'done'; token: number; efforts: WorkerEffort[] };

const SLICE_MS = 40;

let rides: SlimRide[] = [];
let currentToken = 0;

const ctx = self as unknown as { postMessage: (m: WorkerResponse) => void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'rides') {
    rides = msg.rides;
    return;
  }
  if (msg.type !== 'scan') return;

  currentToken = msg.token;
  const token = msg.token;
  const scan = createRepeatsScan(msg.anchor, rides);

  const loop = () => {
    if (token !== currentToken) return; // superseded
    const done = scan.step(SLICE_MS);
    ctx.postMessage({ type: 'progress', token, processed: scan.processed, total: scan.total });
    if (done) {
      ctx.postMessage({
        type: 'done',
        token,
        efforts: scan.efforts.map((e) => {
          const { ride, ...rest } = e;
          return { ...rest, rideId: ride.id };
        }),
      });
      return;
    }
    setTimeout(loop, 0);
  };
  loop();
};
