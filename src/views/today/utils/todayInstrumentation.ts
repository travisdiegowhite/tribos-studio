/**
 * PostHog wrapper for Today view events. Every capture is tagged with
 * `view_version: 'today_v3_clusters'` so we can A/B against prior versions.
 *
 * This module is `posthog-js` aware but tolerates the missing global —
 * during SSR or test runs where PostHog is not initialized, calls become
 * no-ops.
 */

export const VIEW_VERSION = 'today_v3_clusters';

export type TodayEvent =
  | 'today_view.opened'
  | 'today_view.coach_message_read'
  | 'today_view.metric_expanded'
  | 'today_view.route_sent_to_garmin'
  | 'today_view.ride_today_clicked'
  | 'today_view.coach_message_sent'
  | 'today_view.recent_ride_clicked';

interface PostHogLike {
  capture: (event: string, props?: Record<string, unknown>) => void;
}

export function captureToday(
  posthog: PostHogLike | null | undefined,
  event: TodayEvent,
  props: Record<string, unknown> = {}
) {
  if (!posthog || typeof posthog.capture !== 'function') return;
  posthog.capture(event, { ...props, view_version: VIEW_VERSION });
}
