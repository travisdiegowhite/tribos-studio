// Rate Limiting Utility using Supabase
// Protects API endpoints from abuse and bot attacks

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service key (server-side only)
const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials for rate limiting');
  }

  return createClient(url, key);
};

/**
 * Check if request exceeds rate limit
 *
 * @param {string} ip - Client IP address
 * @param {string} endpoint - API endpoint name
 * @param {number} limit - Max requests allowed
 * @param {number} windowMinutes - Time window in minutes
 * @param {string} userId - Optional user ID for user-specific limits
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date}>}
 */
export async function checkRateLimit(
  ip,
  endpoint,
  limit = 10,
  windowMinutes = 1,
  userId = null
) {
  const supabase = getSupabaseClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    // Build query
    let query = supabase
      .from('api_rate_limits')
      .select('*', { count: 'exact' })
      .eq('ip_address', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart.toISOString());

    // Add user filter if provided
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Count recent requests
    const { data, error, count } = await query;

    if (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if database error
      return {
        allowed: true,
        remaining: limit,
        resetAt: new Date(Date.now() + windowMinutes * 60 * 1000)
      };
    }

    const requestCount = count || 0;

    // Check if limit exceeded
    if (requestCount >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + windowMinutes * 60 * 1000),
        retryAfter: windowMinutes * 60 // seconds
      };
    }

    // Log this request
    const { error: insertError } = await supabase
      .from('api_rate_limits')
      .insert({
        ip_address: ip,
        endpoint: endpoint,
        user_id: userId
      });

    if (insertError) {
      console.error('Rate limit insert error:', insertError);
      // Still allow the request
    }

    return {
      allowed: true,
      remaining: limit - requestCount - 1,
      resetAt: new Date(Date.now() + windowMinutes * 60 * 1000)
    };

  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open - allow request if error
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowMinutes * 60 * 1000)
    };
  }
}

/**
 * Middleware wrapper for rate limiting
 * Returns standardized 429 response if rate limit exceeded
 */
export async function rateLimitMiddleware(
  req,
  res,
  endpoint,
  limit,
  windowMinutes,
  userId = null
) {
  // Get client IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             '0.0.0.0';

  // Check rate limit
  const result = await checkRateLimit(ip, endpoint, limit, windowMinutes, userId);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter.toString());
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${Math.ceil(result.retryAfter / 60)} minute(s).`,
      limit: limit,
      remaining: 0,
      resetAt: result.resetAt.toISOString()
    });
  }

  // Rate limit passed
  return null;
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // AI endpoints - expensive, limit strictly
  CLAUDE_ROUTES: {
    limit: 10,
    windowMinutes: 1,
    name: 'claude-routes'
  },

  // Auth endpoints - prevent brute force
  STRAVA_AUTH: {
    limit: 20,
    windowMinutes: 1,
    name: 'strava-auth'
  },
  GARMIN_AUTH: {
    limit: 20,
    windowMinutes: 1,
    name: 'garmin-auth'
  },
  WAHOO_AUTH: {
    limit: 20,
    windowMinutes: 1,
    name: 'wahoo-auth'
  },

  // Data sync endpoints - can be frequent
  STRAVA_DATA: {
    limit: 60,
    windowMinutes: 1,
    name: 'strava-data'
  },
  GARMIN_SYNC: {
    limit: 60,
    windowMinutes: 1,
    name: 'garmin-sync'
  },
  WAHOO_SYNC: {
    limit: 60,
    windowMinutes: 1,
    name: 'wahoo-sync'
  },

  // Bulk operations - limit strictly
  STRAVA_BULK_IMPORT: {
    limit: 5,
    windowMinutes: 60, // 5 per hour (legacy full import)
    name: 'strava-bulk-import'
  },

  // Chunked import operations - more lenient
  STRAVA_IMPORT_LIST: {
    limit: 20,
    windowMinutes: 60, // 20 list operations per hour
    name: 'strava-import-list'
  },
  STRAVA_IMPORT_BATCH: {
    limit: 200,
    windowMinutes: 60, // 200 batch imports per hour (allows ~20 full imports)
    name: 'strava-import-batch'
  },

  // Email endpoints
  SEND_EMAIL: {
    limit: 10,
    windowMinutes: 60, // 10 per hour
    name: 'send-email'
  }
};

export default checkRateLimit;
