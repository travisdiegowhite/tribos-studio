/**
 * Garmin webhook signature verification
 */

import crypto from 'crypto';

/**
 * Verify a Garmin webhook signature using HMAC-SHA256.
 *
 * @param {string} secret - The webhook secret
 * @param {string} signature - The signature from the request header
 * @param {string} body - The raw request body string
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifySignature(secret, signature, body) {
  if (!secret) {
    // In production, reject requests when no secret is configured
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      console.error('Garmin webhook secret not configured in production — rejecting request');
      return { valid: false, error: 'Webhook secret not configured' };
    }
    console.warn('Webhook secret not configured — skipping verification (non-production)');
    return { valid: true };
  }

  if (!signature) {
    return { valid: false, error: 'Missing signature' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

/**
 * Extract the signature from request headers.
 * Garmin uses 'x-garmin-signature' or 'x-webhook-signature'.
 */
export function getSignatureFromHeaders(headers) {
  return headers['x-garmin-signature'] || headers['x-webhook-signature'] || null;
}
