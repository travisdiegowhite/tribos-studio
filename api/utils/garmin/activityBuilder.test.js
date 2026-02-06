import { mapGarminActivityType, generateActivityName, buildActivityData } from './activityBuilder.js';

describe('mapGarminActivityType', () => {
  it('maps cycling types', () => {
    expect(mapGarminActivityType('cycling')).toBe('Ride');
    expect(mapGarminActivityType('road_biking')).toBe('Ride');
    expect(mapGarminActivityType('mountain_biking')).toBe('MountainBikeRide');
    expect(mapGarminActivityType('gravel_cycling')).toBe('GravelRide');
    expect(mapGarminActivityType('virtual_ride')).toBe('VirtualRide');
    expect(mapGarminActivityType('indoor_cycling')).toBe('VirtualRide');
    expect(mapGarminActivityType('e_biking')).toBe('EBikeRide');
  });

  it('maps running types', () => {
    expect(mapGarminActivityType('running')).toBe('Run');
    expect(mapGarminActivityType('trail_running')).toBe('TrailRun');
    expect(mapGarminActivityType('treadmill_running')).toBe('Run');
  });

  it('maps other sport types', () => {
    expect(mapGarminActivityType('walking')).toBe('Walk');
    expect(mapGarminActivityType('hiking')).toBe('Hike');
    expect(mapGarminActivityType('swimming')).toBe('Swim');
    expect(mapGarminActivityType('lap_swimming')).toBe('Swim');
    expect(mapGarminActivityType('strength_training')).toBe('WeightTraining');
    expect(mapGarminActivityType('yoga')).toBe('Yoga');
    expect(mapGarminActivityType('rowing')).toBe('Rowing');
  });

  it('handles spaces by converting to underscores', () => {
    expect(mapGarminActivityType('road biking')).toBe('Ride');
    expect(mapGarminActivityType('trail running')).toBe('TrailRun');
  });

  it('defaults to Workout for unknown types', () => {
    expect(mapGarminActivityType('unknown_sport')).toBe('Workout');
    expect(mapGarminActivityType('quidditch')).toBe('Workout');
  });

  it('defaults to Workout for null/undefined', () => {
    expect(mapGarminActivityType(null)).toBe('Workout');
    expect(mapGarminActivityType(undefined)).toBe('Workout');
  });
});

describe('generateActivityName', () => {
  it('generates time-of-day + activity type name', () => {
    // 8am UTC
    const morningTime = new Date('2025-01-15T08:00:00Z').getTime() / 1000;
    expect(generateActivityName('cycling', morningTime)).toBe('Morning Ride');
  });

  it('uses Afternoon for 12-17h', () => {
    const afternoonTime = new Date('2025-01-15T14:00:00Z').getTime() / 1000;
    expect(generateActivityName('running', afternoonTime)).toBe('Afternoon Run');
  });

  it('uses Evening for 17h+', () => {
    const eveningTime = new Date('2025-01-15T19:00:00Z').getTime() / 1000;
    expect(generateActivityName('swimming', eveningTime)).toBe('Evening Swim');
  });

  it('falls back to Workout for unknown types', () => {
    const time = new Date('2025-01-15T10:00:00Z').getTime() / 1000;
    expect(generateActivityName('unknown_sport', time)).toBe('Morning Workout');
  });

  it('handles null type', () => {
    const time = new Date('2025-01-15T10:00:00Z').getTime() / 1000;
    expect(generateActivityName(null, time)).toBe('Morning Workout');
  });
});

describe('buildActivityData', () => {
  const baseInfo = {
    activityType: 'cycling',
    activityName: 'Test Ride',
    startTimeInSeconds: 1705312800, // 2024-01-15T10:00:00Z
    startTimeOffsetInSeconds: 3600, // UTC+1
    distanceInMeters: 50000,
    durationInSeconds: 3600,
    movingDurationInSeconds: 3500,
    elapsedDurationInSeconds: 3700,
    elevationGainInMeters: 500,
    averageSpeedInMetersPerSecond: 13.9,
    maxSpeedInMetersPerSecond: 18.5,
    averageBikingPowerInWatts: 200,
    averageHeartRateInBeatsPerMinute: 145,
    maxHeartRateInBeatsPerMinute: 175,
    averageBikingCadenceInRPM: 85,
    activeKilocalories: 800
  };

  it('builds complete activity data object', () => {
    const result = buildActivityData('user-1', 'activity-1', baseInfo);

    expect(result.user_id).toBe('user-1');
    expect(result.provider).toBe('garmin');
    expect(result.provider_activity_id).toBe('activity-1');
    expect(result.name).toBe('Test Ride');
    expect(result.type).toBe('Ride');
    expect(result.sport_type).toBe('cycling');
    expect(result.distance).toBe(50000);
    expect(result.moving_time).toBe(3500);
    expect(result.elapsed_time).toBe(3700);
    expect(result.total_elevation_gain).toBe(500);
    expect(result.average_speed).toBe(13.9);
    expect(result.max_speed).toBe(18.5);
    expect(result.average_watts).toBe(200);
    expect(result.average_heartrate).toBe(145);
    expect(result.max_heartrate).toBe(175);
    expect(result.average_cadence).toBe(85);
    expect(result.imported_from).toBe('webhook');
  });

  it('computes start_date_local using startTimeOffsetInSeconds', () => {
    const result = buildActivityData('user-1', 'activity-1', baseInfo);

    // start_date should be UTC
    const startDate = new Date(result.start_date);
    expect(startDate.getTime()).toBe(1705312800 * 1000);

    // start_date_local should be shifted by offset
    const localDate = new Date(result.start_date_local);
    expect(localDate.getTime()).toBe((1705312800 + 3600) * 1000);
  });

  it('sets trainer=true for indoor activity types', () => {
    const indoor = { ...baseInfo, activityType: 'indoor_cycling' };
    const result = buildActivityData('user-1', 'act-1', indoor);
    expect(result.trainer).toBe(true);
  });

  it('sets trainer=true when device name contains indoor/trainer', () => {
    const trainerDevice = { ...baseInfo, deviceName: 'Wahoo KICKR Indoor Trainer' };
    const result = buildActivityData('user-1', 'act-1', trainerDevice);
    expect(result.trainer).toBe(true);
  });

  it('sets trainer=false for outdoor rides', () => {
    const result = buildActivityData('user-1', 'act-1', baseInfo);
    expect(result.trainer).toBe(false);
  });

  it('converts calories to kilojoules', () => {
    const result = buildActivityData('user-1', 'act-1', baseInfo);
    expect(result.kilojoules).toBeCloseTo(800 * 4.184, 1);
  });

  it('handles alternative field names (API vs PUSH vs FIT)', () => {
    const altFields = {
      activityType: 'running',
      distance: 10000,
      duration: 2400,
      averageSpeed: 4.2,
      maxSpeed: 5.5,
      averagePower: 180,
      averageHeartRate: 150,
      maxHeartRate: 170,
      totalElevationGain: 100,
      calories: 500,
      startTimeInSeconds: 1705312800
    };

    const result = buildActivityData('user-1', 'act-1', altFields);
    expect(result.distance).toBe(10000);
    expect(result.moving_time).toBe(2400);
    expect(result.average_speed).toBe(4.2);
    expect(result.average_watts).toBe(180);
    expect(result.average_heartrate).toBe(150);
    expect(result.total_elevation_gain).toBe(100);
    expect(result.kilojoules).toBeCloseTo(500 * 4.184, 1);
  });

  it('generates activity name when none provided', () => {
    const noName = { ...baseInfo };
    delete noName.activityName;
    delete noName.activityDescription;

    const result = buildActivityData('user-1', 'act-1', noName);
    expect(result.name).toContain('Ride'); // "Morning Ride" or similar
  });

  it('uses custom source parameter', () => {
    const result = buildActivityData('user-1', 'act-1', baseInfo, 'garmin_backfill');
    expect(result.imported_from).toBe('garmin_backfill');
  });
});
