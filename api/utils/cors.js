// Shared CORS Configuration
// Centralizes CORS origin management for all API routes

/**
 * Get allowed origins from environment variable or use defaults
 * Set ALLOWED_ORIGINS env var as comma-separated list: "https://example.com,https://app.example.com"
 */
export function getAllowedOrigins() {
  // Check for environment variable first
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }

  // Default origins based on environment
  if (process.env.NODE_ENV === 'production') {
    return [
      'https://www.tribos.studio',
      'https://tribos-studio.vercel.app'
    ];
  }

  // Development defaults
  return [
    'http://localhost:3000',
    'http://localhost:5173'
  ];
}

/**
 * Set CORS headers on response
 * @param {Request} req - The incoming request
 * @param {Response} res - The response object
 * @param {Object} options - Optional configuration
 * @param {boolean} options.allowCredentials - Whether to allow credentials (default: true)
 * @param {string[]} options.allowedMethods - Allowed HTTP methods (default: GET,OPTIONS,POST)
 * @param {string[]} options.allowedHeaders - Allowed headers
 */
export function setCorsHeaders(req, res, options = {}) {
  const {
    allowCredentials = true,
    allowedMethods = ['GET', 'OPTIONS', 'POST'],
    allowedHeaders = [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'Accept',
      'Accept-Version',
      'Content-Length',
      'Content-MD5',
      'Date',
      'X-Api-Version'
    ]
  } = options;

  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin && req.method !== 'OPTIONS') {
    // Allow requests without origin (server-to-server, webhooks, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
}

/**
 * Handle OPTIONS preflight request
 * @param {Request} req - The incoming request
 * @param {Response} res - The response object
 * @returns {boolean} - True if this was an OPTIONS request (already handled)
 */
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Combined CORS setup - sets headers and handles preflight
 * @param {Request} req - The incoming request
 * @param {Response} res - The response object
 * @param {Object} options - CORS options
 * @returns {boolean} - True if this was an OPTIONS request (caller should return early)
 */
export function setupCors(req, res, options = {}) {
  setCorsHeaders(req, res, options);
  return handlePreflight(req, res);
}

export default {
  getAllowedOrigins,
  setCorsHeaders,
  handlePreflight,
  setupCors
};
