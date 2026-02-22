/**
 * Gear Tracking Defaults
 * Default maintenance thresholds and component type definitions.
 * All distance values stored in meters internally.
 */

export const METERS_PER_MILE = 1609.344;

/**
 * Default component maintenance thresholds (in meters).
 * Warning thresholds use 80% of replace where not explicitly defined.
 */
export const DEFAULT_COMPONENT_THRESHOLDS = {
  chain: {
    warning: 1200 * METERS_PER_MILE,
    replace: 1500 * METERS_PER_MILE,
  },
  cassette: {
    warning: 2400 * METERS_PER_MILE,
    replace: 3000 * METERS_PER_MILE,
  },
  tires_road: {
    warning: 2000 * METERS_PER_MILE,
    replace: 2500 * METERS_PER_MILE,
  },
  tires_gravel: {
    warning: 1200 * METERS_PER_MILE,
    replace: 1500 * METERS_PER_MILE,
  },
  brake_pads_rim: {
    warning: 1200 * METERS_PER_MILE,
    replace: 1500 * METERS_PER_MILE,
  },
  brake_pads_disc: {
    warning: 1600 * METERS_PER_MILE,
    replace: 2000 * METERS_PER_MILE,
  },
  bar_tape: {
    // Time-based: 12 months. No mileage threshold.
    warning: null,
    replace: null,
    time_based_months: 12,
  },
  cables: {
    warning: 2400 * METERS_PER_MILE,
    replace: 3000 * METERS_PER_MILE,
  },
};

/**
 * Running shoe thresholds (in meters)
 */
export const RUNNING_SHOE_THRESHOLDS = {
  warning: 350 * METERS_PER_MILE,
  replace: 400 * METERS_PER_MILE,
};

/**
 * Available component types for the UI
 */
export const COMPONENT_TYPES = [
  { value: 'chain', label: 'Chain' },
  { value: 'cassette', label: 'Cassette' },
  { value: 'tires_road', label: 'Tires (Road)' },
  { value: 'tires_gravel', label: 'Tires (Gravel/MTB)' },
  { value: 'brake_pads_rim', label: 'Brake Pads (Rim)' },
  { value: 'brake_pads_disc', label: 'Brake Pads (Disc)' },
  { value: 'bar_tape', label: 'Bar Tape' },
  { value: 'cables', label: 'Cables/Housing' },
];

/**
 * Get default thresholds for a component type.
 * Returns { warning, replace } in meters, or null values for time-based components.
 */
export function getDefaultThresholds(componentType) {
  return DEFAULT_COMPONENT_THRESHOLDS[componentType] || { warning: null, replace: null };
}
