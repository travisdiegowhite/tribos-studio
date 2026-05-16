/**
 * In-flight request deduplication for RouterClient.
 *
 * If a request with the same key is already in flight AND started
 * within `windowMs` of "now", join the existing request rather than
 * issuing a duplicate network call.
 *
 * Catches:
 * - User double-clicks the "regenerate" button
 * - UI race conditions firing identical mutations in quick succession
 *
 * The 100ms default window is short enough that returning stale
 * promise results isn't a concern — the in-flight call hasn't even
 * had time to complete by the time the dedup window expires.
 */

import type { ExecutorResult } from './types';

interface InFlightEntry {
  promise: Promise<ExecutorResult>;
  started_at: number;
}

const DEFAULT_WINDOW_MS = 100;

export class InFlightDedup {
  private readonly entries = new Map<string, InFlightEntry>();
  private readonly windowMs: number;

  constructor(windowMs = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /**
   * If a request with `key` is in flight AND was started within
   * `windowMs` of now, return its promise. Otherwise, invoke `factory`
   * to create a new request, register it, and return its promise.
   *
   * The factory is invoked synchronously inside dedupe so the promise
   * is registered before any `await` boundary.
   */
  dedupe(
    key: string,
    factory: () => Promise<ExecutorResult>,
  ): { promise: Promise<ExecutorResult>; deduped: boolean; wait_ms: number } {
    const existing = this.entries.get(key);
    const now = Date.now();
    if (existing && now - existing.started_at < this.windowMs) {
      return {
        promise: existing.promise,
        deduped: true,
        wait_ms: now - existing.started_at,
      };
    }
    // If there was an expired entry, drop it before re-registering.
    if (existing) this.entries.delete(key);

    const promise = factory().finally(() => {
      // Clean up once complete. Idempotent — if dedupe was already
      // pruned (e.g. via clear()), this is a no-op.
      this.entries.delete(key);
    });
    this.entries.set(key, { promise, started_at: now });
    return { promise, deduped: false, wait_ms: 0 };
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
