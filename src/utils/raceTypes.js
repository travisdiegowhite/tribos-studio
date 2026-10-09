/**
 * Shared race type options used across route builder and race goal components.
 *
 * `sport` (bike / run / multi) drives the season planner's race profiles
 * (src/lib/season/raceProfile.ts keeps the same mapping). The route builders
 * only offer BIKE_RACE_TYPES — a running race has no bike route.
 */
export const RACE_TYPES = [
  { value: 'road_race', label: 'Road Race', sport: 'bike' },
  { value: 'criterium', label: 'Criterium', sport: 'bike' },
  { value: 'time_trial', label: 'Time Trial', sport: 'bike' },
  { value: 'gran_fondo', label: 'Gran Fondo', sport: 'bike' },
  { value: 'century', label: 'Century Ride', sport: 'bike' },
  { value: 'gravel', label: 'Gravel Race', sport: 'bike' },
  { value: 'cyclocross', label: 'Cyclocross', sport: 'bike' },
  { value: 'mtb', label: 'Mountain Bike', sport: 'bike' },
  { value: 'run_5k', label: '5K Run', sport: 'run' },
  { value: 'run_10k', label: '10K Run', sport: 'run' },
  { value: 'half_marathon', label: 'Half Marathon', sport: 'run' },
  { value: 'marathon', label: 'Marathon', sport: 'run' },
  { value: 'trail_run', label: 'Trail Run', sport: 'run' },
  { value: 'ultra_run', label: 'Ultra Run', sport: 'run' },
  { value: 'triathlon', label: 'Triathlon', sport: 'multi' },
  { value: 'duathlon', label: 'Duathlon', sport: 'multi' },
  { value: 'other', label: 'Other Event', sport: 'bike' },
];

/** Race types that have a bike leg, for the route builders. */
export const BIKE_RACE_TYPES = RACE_TYPES.filter((t) => t.sport !== 'run');

export const RACE_TYPE_MAP = Object.fromEntries(
  RACE_TYPES.map(t => [t.value, t.label])
);
