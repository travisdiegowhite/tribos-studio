/**
 * Visual specs the coach can attach to a reply (the `show_visual` tool in
 * api/utils/showVisualTool.js). A spec REFERS to data (an activity id, a date
 * range, a km range) and never carries the data itself: the server checks
 * the reference belongs to the athlete, the browser loads the rows under RLS
 * and renders them with the existing chart and map components.
 *
 * Keep this union in step with VISUAL_KINDS in showVisualTool.js.
 */

export interface FitnessLoadVisual {
  kind: 'fitness_load';
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  caption?: string;
}

export interface RideStreamsVisual {
  kind: 'ride_streams';
  activity_id: string;
  range_km?: [number, number] | null;
  caption?: string;
}

export interface PowerCurveVisual {
  kind: 'power_curve';
  activity_id?: string | null;
  from?: string | null;
  to?: string | null;
  show_zones?: boolean;
  caption?: string;
}

export interface RoutePreviewVisual {
  kind: 'route_preview';
  route_id: string;
  range_km?: [number, number] | null;
  caption?: string;
}

export type CoachVisualSpec =
  | FitnessLoadVisual
  | RideStreamsVisual
  | PowerCurveVisual
  | RoutePreviewVisual;
