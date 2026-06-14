// Server-side error capture: routes to Sentry (@sentry/node) when SENTRY_DSN
// is configured, and always emits a structured console.error line so events
// stay greppable in Vercel logs (`[server-sentry]`) with or without Sentry.
//
// The `tag` from context becomes a Sentry tag named `tag` — alert rules
// filter on it (e.g. "The event's tags match: tag is one of
// garmin.circuit_breaker_open, garmin.token_death, ...").
//
// Serverless caveat: Vercel may freeze the function right after the response
// is sent, before Sentry's background transport delivers the event. Each
// capture kicks off a best-effort flush; handlers that emit alerts as their
// main job (e.g. api/garmin-health-monitor.js) should `await
// flushServerSentry()` before responding to guarantee delivery.

import * as Sentry from '@sentry/node';

let initialized = false;

function ensureInit() {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    // Error tracking only — no performance tracing from serverless functions.
    tracesSampleRate: 0,
  });
  initialized = true;
  return true;
}

/**
 * Capture a server-side error with optional tags/extra context. Sends to
 * Sentry when SENTRY_DSN is set; always logs a structured line either way.
 *
 * @param {Error|string} err - The error or message to capture.
 * @param {object} [context] - Optional tags/extra metadata.
 * @param {string} [context.tag] - Short categorical tag (e.g. 'garmin.activity_lost').
 * @param {object} [context.extra] - Additional structured fields.
 */
export function captureServerError(err, context = {}) {
  const { tag, extra } = context;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Single-line JSON-ish format so the Vercel log query can filter on `tag:`.
  console.error('[server-sentry]', JSON.stringify({
    tag: tag || 'uncategorized',
    message,
    extra: extra || null,
    stack: stack ? stack.split('\n').slice(0, 4).join(' | ') : null,
    ts: new Date().toISOString(),
  }));

  if (!ensureInit()) return;

  const captureContext = {
    tags: { tag: tag || 'uncategorized' },
    extra: extra || undefined,
  };
  if (err instanceof Error) {
    Sentry.captureException(err, captureContext);
  } else {
    Sentry.captureMessage(message, { level: 'error', ...captureContext });
  }

  // Best-effort delivery for fire-and-forget call sites; see header caveat.
  Sentry.flush(2000).catch(() => {});
}

/**
 * Flush pending Sentry events. Await this before sending the response in
 * handlers whose primary job is emitting alerts, so the serverless freeze
 * can't drop them.
 *
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} resolves false if the flush timed out / Sentry inactive
 */
export async function flushServerSentry(timeoutMs = 2000) {
  if (!initialized) return false;
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
