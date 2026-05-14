/**
 * LRU response cache for RouterClient.
 *
 * Per Executor Spec §8.1:
 * - Keyed by `hash(constraint)` (canonicalised JSON)
 * - TTL 5 minutes
 * - Capacity 100 entries
 * - LRU eviction
 * - In-memory only (no localStorage)
 *
 * Implementation note: JavaScript's `Map` preserves insertion order,
 * so "delete and re-insert on read" gives us LRU ordering for free —
 * the first key in iteration order is always the least-recently-used.
 */

import type { ExecutorResult, RouteConstraint } from './types';

interface CacheEntry {
  result: ExecutorResult;
  expires_at: number;
}

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class ResponseCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = DEFAULT_MAX_SIZE, ttlMs = DEFAULT_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a cached result. Returns null if missing or expired. Marks
   * the entry as recently-used on hit.
   */
  get(key: string): ExecutorResult | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires_at) {
      this.entries.delete(key);
      return null;
    }
    // LRU bump: re-insert to move to end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  /**
   * Store a result. Evicts the LRU entry if at capacity.
   */
  set(key: string, result: ExecutorResult): void {
    if (this.entries.has(key)) {
      // Re-insert to refresh ordering.
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, {
      result,
      expires_at: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// Cache key derivation
// ---------------------------------------------------------------------------

/**
 * Round to 6 decimal places (~10cm precision at the equator — overkill
 * for cycling, but cheap and ensures floating-point drift doesn't
 * cause cache misses).
 */
function quantizeCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Stable JSON: sorts object keys recursively so equivalent objects
 * hash to the same string regardless of key ordering. Arrays preserve
 * order (their order is semantic).
 */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableJson(obj[k]))
      .join(',') +
    '}'
  );
}

/**
 * FNV-1a 32-bit hash. Sufficient for cache keys at this scale
 * (collisions astronomically unlikely at <1000 entries). Crypto-grade
 * is not required.
 */
function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned hex for stable, comparable keys.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Build a deterministic cache key for a constraint.
 *
 * - Coordinates quantized to 6 decimals
 * - Segment lists sorted (order doesn't matter for set semantics)
 * - Object keys sorted via `stableJson`
 * - 32-bit FNV-1a digest of the canonical JSON
 */
export function cacheKeyForConstraint(constraint: RouteConstraint): string {
  const normalized = {
    waypoints: constraint.waypoints.map(([lng, lat]) => [
      quantizeCoord(lng),
      quantizeCoord(lat),
    ]),
    profile: constraint.profile,
    shape: constraint.shape,
    target_distance_km: constraint.target_distance_km ?? null,
    target_elevation_gain_m: constraint.target_elevation_gain_m ?? null,
    surface_preference: constraint.surface_preference ?? null,
    traffic_preference: constraint.traffic_preference ?? null,
    avoid_segments: constraint.avoid_segments
      ? [...constraint.avoid_segments].sort()
      : null,
    prefer_segments: constraint.prefer_segments
      ? [...constraint.prefer_segments].sort()
      : null,
    exclude_segments: constraint.exclude_segments
      ? [...constraint.exclude_segments].sort()
      : null,
  };
  return fnv1a32(stableJson(normalized));
}

/**
 * Cache key for a `connect()` call. Waypoints alone — connect doesn't
 * use the rest of the constraint shape.
 */
export function cacheKeyForConnect(
  waypoints: readonly [number, number][] | readonly (readonly [number, number])[],
): string {
  const normalized = {
    op: 'connect',
    waypoints: waypoints.map(([lng, lat]) => [
      quantizeCoord(lng),
      quantizeCoord(lat),
    ]),
  };
  return fnv1a32(stableJson(normalized));
}
