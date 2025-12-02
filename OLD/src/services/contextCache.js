/**
 * Context Cache Service
 * In-memory caching for coaching context with TTL support
 * Reduces database queries and improves response times
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 1000; // Prevent memory leaks

class ContextCache {
  constructor() {
    this.cache = new Map();
    this.lastCleanup = Date.now();
  }

  /**
   * Generate cache key for user
   */
  _getCacheKey(userId) {
    return `context:${userId}`;
  }

  /**
   * Get cached context if still valid
   */
  get(userId) {
    const key = this._getCacheKey(userId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    console.log('✅ Cache HIT for user:', userId, '(age:', Math.round((Date.now() - entry.timestamp) / 1000), 'seconds)');
    return entry.context;
  }

  /**
   * Store context in cache
   */
  set(userId, context) {
    const key = this._getCacheKey(userId);

    // Perform periodic cleanup if cache is getting large
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this._cleanup();
    }

    this.cache.set(key, {
      context: context,
      timestamp: Date.now()
    });

    console.log('💾 Cached context for user:', userId, '(cache size:', this.cache.size, ')');
  }

  /**
   * Invalidate cache for a user (e.g., after new ride upload)
   */
  invalidate(userId) {
    const key = this._getCacheKey(userId);
    const deleted = this.cache.delete(key);

    if (deleted) {
      console.log('🗑️ Invalidated cache for user:', userId);
    }

    return deleted;
  }

  /**
   * Clear all cached contexts
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log('🧹 Cleared entire cache:', size, 'entries removed');
    return size;
  }

  /**
   * Remove expired entries
   */
  _cleanup() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log('🧹 Cleaned up', removedCount, 'expired cache entries');
    }

    this.lastCleanup = now;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }

    return {
      size: this.cache.size,
      validEntries,
      expiredEntries,
      ttlMinutes: CACHE_TTL_MS / 60000,
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
}

// Singleton instance
const contextCache = new ContextCache();

// Periodic cleanup (every 15 minutes)
if (typeof window === 'undefined') {
  // Server-side only
  setInterval(() => {
    contextCache._cleanup();
  }, 15 * 60 * 1000);
}

export default contextCache;

// Named exports for convenience
export const get = (userId) => contextCache.get(userId);
export const set = (userId, context) => contextCache.set(userId, context);
export const invalidate = (userId) => contextCache.invalidate(userId);
export const clear = () => contextCache.clear();
export const getStats = () => contextCache.getStats();
