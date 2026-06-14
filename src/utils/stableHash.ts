/**
 * Stable hashing helpers for in-memory caches.
 *
 * Relocated from `src/routing/RouterClient/cache.ts` when the unused
 * `src/routing/` executor subsystem was deleted at the Route Builder 2.0
 * cutover (Epic 0). `elevationEnrichment` is the live consumer; these two
 * functions are pure and self-contained, so they live here now.
 */

/**
 * Stable JSON: sorts object keys recursively so equivalent objects hash to
 * the same string regardless of key ordering. Arrays preserve order (their
 * order is semantic).
 */
export function stableJson(value: unknown): string {
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
    keys.map((k) => JSON.stringify(k) + ':' + stableJson(obj[k])).join(',') +
    '}'
  );
}

/**
 * FNV-1a 32-bit hash. Sufficient for cache keys at this scale (collisions
 * astronomically unlikely at <1000 entries). Crypto-grade is not required.
 */
export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned hex for stable, comparable keys.
  return (hash >>> 0).toString(16).padStart(8, '0');
}
