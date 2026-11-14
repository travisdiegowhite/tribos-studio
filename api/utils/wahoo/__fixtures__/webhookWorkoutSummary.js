// A Wahoo `workout_summary` webhook body in the shape documented at
// cloud-api.wahooligan.com ("Webhooks"): decimals as STRINGS, the workout
// nested INSIDE workout_summary, a numeric workout_type_id, and the FIT link
// at workout_summary.file.url. Values are illustrative.

export function webhookWorkoutSummary(overrides = {}) {
  const { workout: workoutOverrides, ...summaryOverrides } = overrides.workout_summary || {};
  return {
    event_type: 'workout_summary',
    webhook_token: 'test-webhook-token',
    user: { id: 60462 },
    ...overrides,
    workout_summary: {
      id: 2001,
      name: 'Morning ride summary',
      ascent_accum: '412.0',
      cadence_avg: '86.40',
      calories_accum: '850.0',
      distance_accum: '42195.30',
      duration_active_accum: '5400.0',
      duration_paused_accum: '120.0',
      duration_total_accum: '5520.0',
      heart_rate_avg: '142.70',
      power_bike_np_last: '228.0',
      power_bike_tss_last: '86.5',
      power_avg: '205.30',
      speed_avg: '7.81',
      work_accum: '1108620.0',
      time_zone: 'America/Denver',
      manual: false,
      edited: false,
      file: { url: 'https://cdn.wahooligan.com/wahoo-cloud/production/uploads/workout_file/file/abc/ride.fit' },
      fitness_app_id: 1,
      created_at: '2026-11-14T16:35:00.000Z',
      updated_at: '2026-11-14T16:35:00.000Z',
      ...summaryOverrides,
      workout: {
        id: 1001,
        starts: '2026-11-14T15:00:00.000Z',
        minutes: 92,
        name: 'Morning Ride',
        created_at: '2026-11-14T16:35:00.000Z',
        updated_at: '2026-11-14T16:35:00.000Z',
        plan_id: null,
        workout_token: 'abc-123',
        workout_type_id: 0,
        ...workoutOverrides,
      },
    },
  };
}
