/**
 * Route Builder telemetry helper (T1.4).
 *
 * Wraps `posthog-js` so every Route Builder event ships with a
 * consistent property envelope (session_id, timestamp, generation_id)
 * and a uniform `route_builder_` prefix.
 *
 * The PostHog client is initialised in `src/main.jsx` via
 * `<PostHogProvider>` from `posthog-js/react`. The bare `posthog`
 * import below is the same singleton — capture calls from non-component
 * modules reach the configured project just like `usePostHog()` would.
 *
 * See `posthog-audit.md` for the audit that motivated this helper and
 * `docs/route-builder-telemetry.md` for the event catalog.
 */

import posthog from 'posthog-js';

type EventProperties = Record<string, unknown>;

const SESSION_STORAGE_KEY = 'rb_session_id';

let cachedSessionId: string | null = null;
let currentGenerationId: string | null = null;
let currentGenerationStartedAt: number | null = null;

function safeRandomUUID(): string {
  // `crypto.randomUUID` is available in all evergreen browsers and in
  // jsdom, but the fallback keeps the helper safe in pathological
  // test environments (older Node, locked-down WebViews).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  try {
    if (typeof sessionStorage !== 'undefined') {
      cachedSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!cachedSessionId) {
        cachedSessionId = safeRandomUUID();
        sessionStorage.setItem(SESSION_STORAGE_KEY, cachedSessionId);
      }
      return cachedSessionId;
    }
  } catch {
    // sessionStorage can throw in privacy-mode Safari and SSR contexts.
  }
  cachedSessionId = safeRandomUUID();
  return cachedSessionId;
}

export interface TrackOptions {
  /**
   * If true, ask PostHog to flush the event immediately (used by the
   * abandonment hook, which fires from `visibilitychange:hidden`).
   */
  immediate?: boolean;
}

/**
 * Emit a Route Builder PostHog event. Event name is prefixed with
 * `route_builder_`. The helper is intentionally fire-and-forget and
 * never throws — telemetry must not break user-facing flows.
 */
export function trackRouteBuilder(
  event: string,
  properties: EventProperties = {},
  options: TrackOptions = {},
): void {
  try {
    const fullEvent = `route_builder_${event}`;
    const envelope: EventProperties = {
      session_id: getSessionId(),
      generation_id: currentGenerationId,
      timestamp: new Date().toISOString(),
      ...properties,
    };
    if (options.immediate) {
      posthog.capture(fullEvent, envelope, { send_instantly: true } as never);
    } else {
      posthog.capture(fullEvent, envelope);
    }
  } catch (err) {
    // PostHog may be uninitialised in tests / dev / SSR. Never let
    // telemetry break a user-facing flow.
    console.warn('[route-builder-telemetry] capture failed:', err);
  }
}

/**
 * Start a new generation attempt. Returns the freshly-minted UUID so
 * callers can stash it for later correlation (e.g. on the route row
 * that eventually gets saved).
 */
export function startGenerationId(): string {
  currentGenerationId = safeRandomUUID();
  currentGenerationStartedAt = Date.now();
  return currentGenerationId;
}

export function getCurrentGenerationId(): string | null {
  return currentGenerationId;
}

export function getCurrentGenerationStartedAt(): number | null {
  return currentGenerationStartedAt;
}

export function clearGenerationId(): void {
  currentGenerationId = null;
  currentGenerationStartedAt = null;
}

/**
 * Truncate a free-form error message so PostHog event payloads don't
 * blow up. 200 chars per the T1.4 spec.
 */
export function truncateErrorMessage(message: unknown, limit = 200): string {
  if (message === null || message === undefined) return '';
  const str = typeof message === 'string' ? message : String(message);
  return str.length > limit ? str.slice(0, limit) : str;
}

/**
 * Classify a Claude failure into one of the buckets used by
 * `generation_claude_failed.failure_kind`. Driven by either an HTTP
 * status code, an Error object, or a typed `reason` string emitted by
 * `ClaudeRouteServiceError`.
 */
export function classifyClaudeFailure(input: {
  reason?: string | null;
  status?: number | null;
  error?: unknown;
}): 'timeout' | '5xx' | '429' | '401' | 'malformed' | 'empty_response' | 'other' {
  const { reason, status, error } = input;
  if (reason === 'claude_timeout') return 'timeout';
  if (reason === 'claude_empty') return 'empty_response';
  if (reason === 'claude_invalid') return 'malformed';
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return '401';
    if (status === 429) return '429';
    if (status >= 500) return '5xx';
  }
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (/abort|timeout/i.test(message)) return 'timeout';
  return 'other';
}
