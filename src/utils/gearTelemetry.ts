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
  | 'gear_ride_surface_set'
  | 'gear_backfill_previewed'
  | 'gear_backfill_applied'
  | 'gear_backfill_undone'
  | 'gear_provider_gear_listed'
  | 'gear_provider_gear_linked'
  | 'gear_alert_shown'
  | 'gear_alert_dismissed'
  | 'garage_opened'
  | 'bike_detail_viewed'
  | 'bike_wear_chart_hovered';

export function trackGear(event: GearEvent, properties: Record<string, unknown> = {}): void {
  try {
    posthog.capture(event, properties);
  } catch {
    // telemetry must never break a flow
  }
}
