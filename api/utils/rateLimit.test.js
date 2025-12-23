/**
 * Tests for rate limiting utility
 * Ensures rate limiting works correctly for both in-memory and Supabase-based approaches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

// Dynamic import to allow mocking
let rateLimitMiddleware, rateLimitByUser, RATE_LIMITS;

describe('Rate Limiting', () => {
  let mockReq;
  let mockRes;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Clear environment variables for testing
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;

    // Import fresh module
    const module = await import('./rateLimit.js');
    rateLimitMiddleware = module.rateLimitMiddleware;
    rateLimitByUser = module.rateLimitByUser;
    RATE_LIMITS = module.RATE_LIMITS;

    // Mock request object
    mockReq = {
      headers: {
        'x-forwarded-for': '192.168.1.100',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };

    // Mock response object
    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('RATE_LIMITS configuration', () => {
    it('should have STRAVA_AUTH config', () => {
      expect(RATE_LIMITS.STRAVA_AUTH).toBeDefined();
      expect(RATE_LIMITS.STRAVA_AUTH.limit).toBe(30);
      expect(RATE_LIMITS.STRAVA_AUTH.windowMinutes).toBe(1);
    });

    it('should have CLAUDE_ROUTES config', () => {
      expect(RATE_LIMITS.CLAUDE_ROUTES).toBeDefined();
      expect(RATE_LIMITS.CLAUDE_ROUTES.limit).toBe(10);
      expect(RATE_LIMITS.CLAUDE_ROUTES.windowMinutes).toBe(60);
    });

    it('should have AI_COACH config', () => {
      expect(RATE_LIMITS.AI_COACH).toBeDefined();
      expect(RATE_LIMITS.AI_COACH.limit).toBe(10);
      expect(RATE_LIMITS.AI_COACH.windowMinutes).toBe(5);
    });

    it('should have OAUTH_CALLBACK config', () => {
      expect(RATE_LIMITS.OAUTH_CALLBACK).toBeDefined();
      expect(RATE_LIMITS.OAUTH_CALLBACK.limit).toBe(10);
      expect(RATE_LIMITS.OAUTH_CALLBACK.windowMinutes).toBe(1);
    });
  });

  describe('rateLimitMiddleware - in-memory fallback', () => {
    it('should allow first request', async () => {
      const result = await rateLimitMiddleware(mockReq, mockRes, 'test-endpoint', 5, 1);

      expect(result).toBeNull();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should set rate limit headers on each request', async () => {
      await rateLimitMiddleware(mockReq, mockRes, 'test-headers', 10, 1);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        expect.any(String)
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      );
    });

    it('should decrement remaining count on each request', async () => {
      const endpoint = 'test-decrement';

      // First request
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 3, 1);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');

      mockRes.setHeader.mockClear();

      // Second request
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 3, 1);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');

      mockRes.setHeader.mockClear();

      // Third request
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 3, 1);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });

    it('should return 429 when limit exceeded', async () => {
      const endpoint = 'test-exceeded';

      // Exhaust the limit
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 2, 1);
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 2, 1);

      // This should be rate limited
      const result = await rateLimitMiddleware(mockReq, mockRes, endpoint, 2, 1);

      expect(result).not.toBeNull();
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
          limit: 2,
          remaining: 0,
        })
      );
    });

    it('should set Retry-After header when rate limited', async () => {
      const endpoint = 'test-retry-after';

      // Exhaust the limit
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 1, 1);
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 1, 1);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
    });

    it('should use x-forwarded-for header for IP', async () => {
      mockReq.headers['x-forwarded-for'] = '10.0.0.1, 10.0.0.2';

      await rateLimitMiddleware(mockReq, mockRes, 'test-xff', 5, 1);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should use x-real-ip as fallback', async () => {
      delete mockReq.headers['x-forwarded-for'];
      mockReq.headers['x-real-ip'] = '172.16.0.1';

      await rateLimitMiddleware(mockReq, mockRes, 'test-xri', 5, 1);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should use socket remoteAddress as last fallback', async () => {
      delete mockReq.headers['x-forwarded-for'];
      delete mockReq.headers['x-real-ip'];

      await rateLimitMiddleware(mockReq, mockRes, 'test-socket', 5, 1);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should track different endpoints separately', async () => {
      await rateLimitMiddleware(mockReq, mockRes, 'endpoint-a', 2, 1);
      await rateLimitMiddleware(mockReq, mockRes, 'endpoint-a', 2, 1);

      mockRes.status.mockClear();

      // This should still work because it's a different endpoint
      const result = await rateLimitMiddleware(mockReq, mockRes, 'endpoint-b', 2, 1);

      expect(result).toBeNull();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should track different IPs separately', async () => {
      const endpoint = 'test-ips';

      // First IP exhausts limit
      mockReq.headers['x-forwarded-for'] = '1.1.1.1';
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 1, 1);
      await rateLimitMiddleware(mockReq, mockRes, endpoint, 1, 1);

      expect(mockRes.status).toHaveBeenCalledWith(429);

      mockRes.status.mockClear();

      // Different IP should work
      mockReq.headers['x-forwarded-for'] = '2.2.2.2';
      const result = await rateLimitMiddleware(mockReq, mockRes, endpoint, 1, 1);

      expect(result).toBeNull();
    });
  });

  describe('rateLimitByUser', () => {
    it('should allow first request', async () => {
      const result = await rateLimitByUser(mockReq, mockRes, 'user-endpoint', 'user-123', 5, 1);

      expect(result).toBeNull();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    });

    it('should track by user ID, not IP', async () => {
      const endpoint = 'user-tracking';

      // User 1 exhausts their limit
      await rateLimitByUser(mockReq, mockRes, endpoint, 'user-1', 1, 1);
      await rateLimitByUser(mockReq, mockRes, endpoint, 'user-1', 1, 1);

      expect(mockRes.status).toHaveBeenCalledWith(429);

      mockRes.status.mockClear();

      // User 2 should still work (same IP, different user)
      const result = await rateLimitByUser(mockReq, mockRes, endpoint, 'user-2', 1, 1);

      expect(result).toBeNull();
    });

    it('should return 429 when user limit exceeded', async () => {
      const endpoint = 'user-exceeded';
      const userId = 'heavy-user';

      await rateLimitByUser(mockReq, mockRes, endpoint, userId, 2, 1);
      await rateLimitByUser(mockReq, mockRes, endpoint, userId, 2, 1);
      const result = await rateLimitByUser(mockReq, mockRes, endpoint, userId, 2, 1);

      expect(result).not.toBeNull();
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Supabase-based rate limiting', () => {
    beforeEach(async () => {
      // Set up environment for Supabase
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

      // Re-import with env set
      vi.resetModules();

      const { createClient } = await import('@supabase/supabase-js');

      // Mock successful rate limit check
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: {
            allowed: true,
            remaining: 4,
            reset_at: new Date(Date.now() + 60000).toISOString(),
          },
          error: null,
        }),
      });

      const module = await import('./rateLimit.js');
      rateLimitMiddleware = module.rateLimitMiddleware;
    });

    it('should use Supabase when configured', async () => {
      const result = await rateLimitMiddleware(mockReq, mockRes, 'supabase-test', 5, 1);

      expect(result).toBeNull();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should fall back to in-memory on Supabase error', async () => {
      vi.resetModules();

      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      const module = await import('./rateLimit.js');
      const result = await module.rateLimitMiddleware(mockReq, mockRes, 'fallback-test', 5, 1);

      // Should still work (falls back to in-memory)
      expect(result).toBeNull();
    });

    it('should return 429 when Supabase reports limit exceeded', async () => {
      vi.resetModules();

      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: {
            allowed: false,
            remaining: 0,
            reset_at: new Date(Date.now() + 60000).toISOString(),
          },
          error: null,
        }),
      });

      const module = await import('./rateLimit.js');
      const result = await module.rateLimitMiddleware(mockReq, mockRes, 'exceeded-test', 5, 1);

      expect(result).not.toBeNull();
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });
});
