// Simple in-memory rate limiting for MVP
// TODO: Replace with Redis or Supabase-based rate limiting for production

const requestLog = new Map();

/**
 * Clean up old entries from rate limit log
 */
function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of requestLog.entries()) {
    if (now > data.resetAt) {
      requestLog.delete(key);
    }
  }
}

/**
 * Rate limit middleware
 * Returns 429 response if rate limit exceeded, otherwise returns null
 */
export async function rateLimitMiddleware(
  req,
  res,
  endpoint,
  limit,
  windowMinutes
) {
  // Get client IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             '0.0.0.0';

  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  // Clean up old entries periodically
  if (Math.random() < 0.1) {
    cleanupOldEntries();
  }

  // Get or create entry
  let entry = requestLog.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    entry = {
      count: 0,
      resetAt: now + windowMs
    };
    requestLog.set(key, entry);
  }

  // Check limit
  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
    res.setHeader('Retry-After', retryAfter.toString());

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      limit,
      remaining: 0,
      resetAt: new Date(entry.resetAt).toISOString()
    });
  }

  // Increment counter
  entry.count++;
  const remaining = limit - entry.count;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

  // Rate limit passed
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
  }
};
