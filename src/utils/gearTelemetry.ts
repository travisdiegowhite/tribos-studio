/**
 * Gear telemetry — `gear_*` events in PostHog.
 *
 * Mirrors trackRb2: fire-and-forget, never throws. The gear tracker had zero
 * instrumentation before this, which is why its adoption could only be read
 * from SQL; every capture path emits from here so the funnel
 * (bike added → photo captured → parts confirmed → alert acted on) is visible.
 */

import posthog from 'posthog-js';

export type GearEvent =
  | 'gear_bike_added'
  | 'gear_photo_capture_opened'
  | 'gear_photo_captured'
  | 'gear_photo_uploaded'
  | 'gear_vision_requested'
  | 'gear_vision_returned'
  | 'gear_vision_failed'
  | 'gear_catalogue_confirmed'
  | 'gear_component_added'
  | 'gear_ride_assigned'
  | 'gear_alert_shown'
  | 'gear_alert_dismissed';

export function trackGear(event: GearEvent, properties: Record<string, unknown> = {}): void {
  try {
    posthog.capture(event, properties);
  } catch {
    // telemetry must never break a flow
  }
}
