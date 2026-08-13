// Public service status endpoint
// Registered with integration partners (e.g. the COROS Open Platform
// "Service Status Check URL") so they can verify the platform is up.
// Deliberately dependency-free: no database or third-party calls, so it
// reflects serverless availability only and can never fail due to an
// upstream outage.

import { setupCors } from './utils/cors.js';

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['GET', 'HEAD', 'OPTIONS'] })) {
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).json({
    status: 'ok',
    service: 'tribos.studio',
    timestamp: new Date().toISOString(),
  });
}
