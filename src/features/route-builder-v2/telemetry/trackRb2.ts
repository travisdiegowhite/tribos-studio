/**
 * Route Builder 2.0 telemetry helper (P1.2).
 *
 * Mirrors `trackRouteBuilder` from `src/utils/routeBuilderTelemetry.ts`
 * but emits events under the `rb2_` prefix. The two trackers coexist
 * during Phase 1 — `route_builder_*` continues to fire from the v1
 * RouteBuilder.jsx path, and `rb2_*` fires from the new hook/adapter
 * layer. They are not deduped: a future PR that retires v1 also
 * retires the older prefix.
 *
 * Fire-and-forget. Never throws — telemetry must not break flows.
 */

import posthog from 'posthog-js';

type EventProperties = Record<string, unknown>;

const SESSION_STORAGE_KEY = 'rb2_session_id';

let cachedSessionId: string | null = null;

function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rb2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

export function trackRb2(event: string, properties: EventProperties = {}): void {
  try {
    const fullEvent = `rb2_${event}`;
    const envelope: EventProperties = {
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      ...properties,
    };
    posthog.capture(fullEvent, envelope);
  } catch {
    // never throw from telemetry
  }
}
