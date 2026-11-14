// Wahoo workout_type_id → tribos activity type.
//
// Wahoo sends a NUMERIC `workout_type_id` on every workout (there is no
// `workout_type` string — the old importer read one, got undefined, and skipped
// every workout as "unsupported"). Table: cloud-api.wahooligan.com, "Workout
// Types". The output `type` uses the Strava-style vocabulary of
// api/utils/sportTypes.js so the shared classifier buckets the row correctly.
//
// Only cycling and running are imported, matching the other providers' import
// allowlists. Everything else returns null and is skipped.

const WAHOO_TYPES = {
  // ── Cycling (family BIKING) ──
  0: { type: 'Ride', trainer: false, name: 'BIKING' },
  11: { type: 'Ride', trainer: false, name: 'BIKING_CYCLECROSS' },
  12: { type: 'VirtualRide', trainer: true, name: 'BIKING_INDOOR' },
  13: { type: 'MountainBikeRide', trainer: false, name: 'BIKING_MOUNTAIN' },
  14: { type: 'Ride', trainer: false, name: 'BIKING_RECUMBENT' },
  15: { type: 'Ride', trainer: false, name: 'BIKING_ROAD' },
  16: { type: 'Ride', trainer: false, name: 'BIKING_TRACK' },
  49: { type: 'VirtualRide', trainer: true, name: 'BIKING_INDOOR_CYCLING_CLASS' },
  61: { type: 'VirtualRide', trainer: true, name: 'BIKING_INDOOR_TRAINER' },
  64: { type: 'EBikeRide', trainer: false, name: 'EBIKING' },
  68: { type: 'VirtualRide', trainer: true, name: 'BIKING_INDOOR_VIRTUAL' },
  70: { type: 'Ride', trainer: false, name: 'HANDCYCLING' },

  // ── Running (family RUNNING / TRAIL / TRACK) ──
  1: { type: 'Run', trainer: false, name: 'RUNNING' },
  3: { type: 'Run', trainer: false, name: 'RUNNING_TRACK' },
  4: { type: 'TrailRun', trainer: false, name: 'RUNNING_TRAIL' },
  5: { type: 'Run', trainer: true, name: 'RUNNING_TREADMILL' },
  67: { type: 'Run', trainer: false, name: 'RUNNING_RACE' },
  71: { type: 'VirtualRun', trainer: true, name: 'RUNNING_INDOOR_VIRTUAL' },
};

/**
 * @param {number|string|null|undefined} workoutTypeId
 * @returns {{ type: string, trainer: boolean, name: string } | null}
 */
export function mapWahooWorkoutType(workoutTypeId) {
  if (workoutTypeId === null || workoutTypeId === undefined || workoutTypeId === '') return null;
  const id = Number(workoutTypeId);
  if (!Number.isInteger(id)) return null;
  return WAHOO_TYPES[id] ?? null;
}

/** Wahoo route `workout_type_family_id`: 0 = Biking, 1 = Running. */
export const WAHOO_FAMILY_BIKING = 0;
export const WAHOO_FAMILY_RUNNING = 1;
