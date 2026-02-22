/**
 * Shared gear constants for frontend components.
 * Mirrors api/utils/gearDefaults.js for display purposes.
 */

export const METERS_PER_MILE = 1609.344;

export const RUNNING_SHOE_THRESHOLDS = {
  warning: 350 * METERS_PER_MILE,
  replace: 400 * METERS_PER_MILE,
};

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

export function getComponentLabel(componentType) {
  const found = COMPONENT_TYPES.find(c => c.value === componentType);
  return found ? found.label : componentType;
}
