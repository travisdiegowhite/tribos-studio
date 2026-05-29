// Server-side error capture helper. Stub in Phase 1 — emits structured
// console.error so failures are at least greppable in Vercel logs. Phase 2
// swaps the body for @sentry/node once the dep is added and SENTRY_DSN is set.
//
// API mirrors a future Sentry.captureException(err, { tags, extra }) call so
// callers don't need to change when the real implementation lands.

/**
 * Capture a server-side error with optional tags/extra context. No-ops to a
 * structured console.error today; will route to Sentry once @sentry/node ships.
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
}
