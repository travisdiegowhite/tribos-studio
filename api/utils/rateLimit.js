// Supabase-based rate limiting for production
// Uses database function for distributed rate limiting across serverless instances

import { createClient } from '@supabase/supabase-js';

// Create Supabase client for server-side use
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not configured for rate limiting');
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Fallback in-memory rate limiting (for development or if Supabase unavailable)
const requestLog = new Map();

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of requestLog.entries()) {
    if (now > data.resetAt) {
      requestLog.delete(key);
    }
  }
}

/**
 * In-memory rate limiting fallback
 */
function inMemoryRateLimit(key, limit, windowMinutes) {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  // Clean up old entries periodically
  if (Math.random() < 0.1) {
    cleanupOldEntries();
  }

  let entry = requestLog.get(key);

  if (!entry || now > entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + windowMs
    };
    requestLog.set(key, entry);
    return { allowed: true, remaining: limit - 1, resetAt: new Date(entry.resetAt) };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: new Date(entry.resetAt) };
}

/**
 * Supabase-based distributed rate limiting
 */
async function supabaseRateLimit(supabase, key, limit, windowMinutes) {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_minutes: windowMinutes
    });

    if (error) {
      console.error('Rate limit check failed:', error);
      // Fall back to in-memory on error
      return inMemoryRateLimit(key, limit, windowMinutes);
    }

    return {
      allowed: data.allowed,
      remaining: data.remaining,
      resetAt: new Date(data.reset_at)
    };
  } catch (err) {
    console.error('Rate limit error:', err);
    // Fall back to in-memory on error
    return inMemoryRateLimit(key, limit, windowMinutes);
  }
}

/**
 * Rate limit middleware
 * Returns 429 response if rate limit exceeded, otherwise returns null
 *
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 * @param {string} endpoint - Endpoint identifier for rate limiting
 * @param {number} limit - Maximum requests allowed in window
 * @param {number} windowMinutes - Time window in minutes
 * @returns {Response|null} Returns 429 response if limited, null otherwise
 */
export async function rateLimitMiddleware(
  req,
  res,
  endpoint,
  limit,
  windowMinutes
) {
  // Get client identifier (IP address)
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             '0.0.0.0';

  const key = `${endpoint}:${ip}`;

  // Try Supabase-based rate limiting first
  const supabase = getSupabaseClient();
  let result;

  if (supabase) {
    result = await supabaseRateLimit(supabase, key, limit, windowMinutes);
  } else {
    // Fall back to in-memory for development
    result = inMemoryRateLimit(key, limit, windowMinutes);
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter.toString());

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      limit,
      remaining: 0,
      resetAt: result.resetAt.toISOString()
    });
  }

  // Rate limit passed
  return null;
}

/**
 * Rate limit by user ID instead of IP (for authenticated endpoints)
 */
export async function rateLimitByUser(
  req,
  res,
  endpoint,
  userId,
  limit,
  windowMinutes
) {
  const key = `${endpoint}:user:${userId}`;

  const supabase = getSupabaseClient();
  let result;

  if (supabase) {
    result = await supabaseRateLimit(supabase, key, limit, windowMinutes);
  } else {
    result = inMemoryRateLimit(key, limit, windowMinutes);
  }

  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter.toString());

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      limit,
      remaining: 0,
      resetAt: result.resetAt.toISOString()
    });
  }

  return null;
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  STRAVA_AUTH: {
    limit: 30,
    windowMinutes: 1,
    name: 'strava-auth'
  },
  CLAUDE_ROUTES: {
    limit: 10,
    windowMinutes: 60,
    name: 'claude-routes'
  },
  AI_COACH: {
    limit: 10,
    windowMinutes: 5,
    name: 'ai-coach'
  },
  OAUTH_CALLBACK: {
    limit: 10,
    windowMinutes: 1,
    name: 'oauth-callback'
  },
  GARMIN_WEBHOOK: {
    limit: 100,
    windowMinutes: 1,
    name: 'garmin-webhook'
  }
};
