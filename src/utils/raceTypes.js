/**
 * Shared race type options used across route builder and race goal components.
 */
export const RACE_TYPES = [
  { value: 'road_race', label: 'Road Race' },
  { value: 'criterium', label: 'Criterium' },
  { value: 'time_trial', label: 'Time Trial' },
  { value: 'gran_fondo', label: 'Gran Fondo' },
  { value: 'century', label: 'Century Ride' },
  { value: 'gravel', label: 'Gravel Race' },
  { value: 'cyclocross', label: 'Cyclocross' },
  { value: 'mtb', label: 'Mountain Bike' },
  { value: 'triathlon', label: 'Triathlon (Bike)' },
  { value: 'other', label: 'Other Event' },
];

export const RACE_TYPE_MAP = Object.fromEntries(
  RACE_TYPES.map(t => [t.value, t.label])
);
