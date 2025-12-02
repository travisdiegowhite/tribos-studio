/**
 * Security utilities for API endpoints
 * Provides consistent security headers and input validation
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://www.tribos.studio',
  'https://tribos.studio',
  'http://localhost:3000',
  'http://localhost:5173',
];

/**
 * Get CORS headers with proper origin validation
 * @param {string} requestOrigin - The origin from the request
 * @returns {Object} - CORS headers object
 */
export function getCorsHeaders(requestOrigin) {
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin) ||
    (process.env.NODE_ENV === 'development' && requestOrigin?.startsWith('http://localhost'));

  return {
    'Access-Control-Allow-Origin': isAllowed ? requestOrigin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Apply security headers to response
 * @param {Object} res - Express-like response object
 * @param {string} requestOrigin - The origin from the request
 */
export function applySecurityHeaders(res, requestOrigin) {
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Apply CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cache control for API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

/**
 * Validate and sanitize user ID input
 * @param {string} userId - User ID to validate
 * @returns {Object} - { valid: boolean, sanitized: string, error?: string }
 */
export function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return { valid: false, sanitized: '', error: 'User ID is required' };
  }

  // UUID format validation (Supabase uses UUIDs)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trimmed = userId.trim();

  if (!uuidRegex.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Invalid user ID format' };
  }

  return { valid: true, sanitized: trimmed.toLowerCase() };
}

/**
 * Validate numeric input
 * @param {any} value - Value to validate
 * @param {Object} options - { min, max, required }
 * @returns {Object} - { valid: boolean, value: number, error?: string }
 */
export function validateNumber(value, options = {}) {
  const { min, max, required = false } = options;

  if (value === undefined || value === null || value === '') {
    if (required) {
      return { valid: false, value: 0, error: 'Value is required' };
    }
    return { valid: true, value: 0 };
  }

  const num = Number(value);

  if (isNaN(num)) {
    return { valid: false, value: 0, error: 'Value must be a number' };
  }

  if (min !== undefined && num < min) {
    return { valid: false, value: 0, error: `Value must be at least ${min}` };
  }

  if (max !== undefined && num > max) {
    return { valid: false, value: 0, error: `Value must be at most ${max}` };
  }

  return { valid: true, value: num };
}

/**
 * Sanitize string input to prevent injection
 * @param {string} input - String to sanitize
 * @param {Object} options - { maxLength, allowedChars }
 * @returns {string} - Sanitized string
 */
export function sanitizeString(input, options = {}) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const { maxLength = 1000 } = options;

  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);

  // Remove null bytes and control characters (except newlines/tabs for text content)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Rate limiting helper - checks if request should be rate limited
 * Note: For production, use a proper rate limiting service like Redis
 * @param {string} key - Unique key for rate limiting (e.g., IP + endpoint)
 * @param {Object} store - In-memory store object
 * @param {Object} options - { maxRequests, windowMs }
 * @returns {Object} - { allowed: boolean, remaining: number, resetAt: Date }
 */
export function checkRateLimit(key, store, options = {}) {
  const { maxRequests = 100, windowMs = 60000 } = options;
  const now = Date.now();

  if (!store[key]) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }

  const record = store[key];

  // Reset if window has passed
  if (now > record.resetAt) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }

  // Check if limit exceeded
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(record.resetAt) };
  }

  // Increment count
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetAt: new Date(record.resetAt) };
}

/**
 * Log security event (for audit trail)
 * @param {string} event - Event type
 * @param {Object} details - Event details
 */
export function logSecurityEvent(event, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };

  // In production, this would go to a security logging service
  if (process.env.NODE_ENV === 'development') {
    console.log('[SECURITY]', JSON.stringify(logEntry));
  }
}

export default {
  getCorsHeaders,
  applySecurityHeaders,
  validateUserId,
  validateNumber,
  sanitizeString,
  checkRateLimit,
  logSecurityEvent,
};
