/**
 * Shared utility for timing-safe cron job authentication.
 * Prevents timing attacks on CRON_SECRET comparisons.
 */

import crypto from 'crypto';

/**
 * Verify that a request is an authorized cron invocation.
 * Accepts Vercel's native cron header or a Bearer token matching CRON_SECRET.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {{ authorized: boolean }}
 */
export function verifyCronAuth(req) {
  // Vercel injects this header for its own cron invocations
  if (req.headers['x-vercel-cron'] === '1') {
    return { authorized: true };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured — rejecting cron request');
    return { authorized: false };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false };
  }

  const providedToken = authHeader.slice(7); // strip "Bearer "

  // Use timing-safe comparison to prevent timing attacks
  const providedBuf = Buffer.from(providedToken);
  const expectedBuf = Buffer.from(cronSecret);

  if (providedBuf.length !== expectedBuf.length) {
    return { authorized: false };
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { authorized: false };
  }

  return { authorized: true };
}
