/**
 * editCheckpoints — pre-edit route snapshots for the v2 chat.
 *
 * Every successful AI edit pushes the route it replaced; the
 * `restore_previous` tool intent pops one to step back a version
 * ("go back to the loop I had"). Module-level and session-only by
 * design — a page reload clears it, and the page-level undo stack
 * (useRouteHistory, ⌘Z) remains the fallback there.
 */
import type { Coordinate } from '../../../types/geo';

export interface RouteCheckpoint {
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
  stats: { distance_km: number; elevation_gain_m: number; duration_s: number };
}

const MAX_CHECKPOINTS = 10;

let stack: RouteCheckpoint[] = [];

export function pushCheckpoint(checkpoint: RouteCheckpoint): void {
  stack.push(checkpoint);
  if (stack.length > MAX_CHECKPOINTS) stack = stack.slice(-MAX_CHECKPOINTS);
}

export function popCheckpoint(): RouteCheckpoint | null {
  return stack.pop() ?? null;
}

export function checkpointCount(): number {
  return stack.length;
}

export function clearCheckpoints(): void {
  stack = [];
}
