/** Fixture athletes for buildTrainingContext tests (dates relative to 2026-10-14). */
const formatDist = (km) => `${Math.round(km * 0.621371)} mi`;
const formatTime = (s) => `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;

const ride = (date, extra = {}) => ({
  id: `r-${date}`,
  name: `Ride ${date}`,
  type: 'Ride',
  start_date: `${date}T15:00:00Z`,
  distance: 50000,
  moving_time: 7200,
  average_watts: 190,
  ...extra,
});

export const EMPTY = [
  { ctl: 0, atl: 0, tsb: 0, interpretation: null },
  { cycling: { tss: 0, distance: 0, avgPower: 0 }, running: { tss: 0, distance: 0 }, other: { count: 0, tss: 0 } },
  { totalDistance: 0, totalTime: 0, activityCount: 0, rideCount: 0, runCount: 0, otherCount: 0 },
  null,
  [],
  formatDist,
  formatTime,
  true,
];

export const FULL = [
  { ctl: 62, atl: 71, tsb: -9, interpretation: { status: 'productive', message: 'Building fitness' } },
  { cycling: { tss: 410, distance: 180, avgPower: 205 }, running: { tss: 40, distance: 8, avgPaceMinKm: 5.2 }, other: { count: 1, tss: 20 } },
  { totalDistance: 188, totalTime: 36000, activityCount: 6, rideCount: 4, runCount: 1, otherCount: 1 },
  250,
  [
    ride('2026-10-13'),
    ride('2026-10-11', { type: 'GravelRide', distance: 90000, moving_time: 14400 }),
    ride('2026-10-09', { type: 'Run', distance: 8000, moving_time: 2600, average_watts: null }),
    ride('2026-10-02'),
  ],
  formatDist,
  formatTime,
  true,
  {
    name: 'Gravel Base',
    status: 'active',
    goal: 'gravel',
    methodology: 'polarized',
    duration_weeks: 12,
    started_at: '2026-09-07',
    workouts_completed: 18,
    workouts_total: 48,
    compliance_percentage: 82,
  },
  [
    { name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', distance_km: 97, goal_time_minutes: 180 },
    { name: 'Ned Gravel', race_date: '2027-07-11', priority: 'B', race_type: 'gravel', distance_km: 113, elevation_gain_m: 1200, course_description: 'Rolling dirt' },
  ],
  [{ category: 'strength', durationMinutes: 45, start_date: '2026-10-12T12:00:00Z', entries: [] }],
  {
    primary: { workout: { name: 'Sweet Spot 3x15' }, reason: 'Fitness is building', category: 'sweet_spot', source: 'plan' },
    analysis: { gaps: { missingZ2: true, missingIntensity: false } },
    alternatives: [{ workout: { name: 'Endurance 2h' } }],
  },
  [
    { name: 'Endurance', scheduled_date: '2026-10-15', workout_type: 'endurance', target_duration: 90, target_tss: 70, target_rss: 70, completed: false },
    { name: 'Intervals', scheduled_date: '2026-10-12', workout_type: 'vo2max', target_duration: 75, target_tss: 85, target_rss: 85, completed: false, skipped_reason: 'tired' },
    { name: 'Long ride', scheduled_date: '2026-10-11', workout_type: 'endurance', duration_minutes: 240, completed: true },
  ],
  [{ name: 'Fall Classic', race_date: '2026-09-20', priority: 'B', race_type: 'gravel', actual_time_minutes: 200, actual_placement: '12th', result_notes: 'Felt strong' }],
];
