import { shouldFilterActivityType, isIndoorActivityType, hasMinimumActivityMetrics, isFitPingWithoutMetrics, activityInfoFromFitSummary } from './activityFilters.js';

describe('shouldFilterActivityType', () => {
  it('filters health/monitoring types', () => {
    const filtered = ['sedentary', 'sleep', 'uncategorized', 'generic', 'all_day_tracking',
      'monitoring', 'daily_summary', 'respiration', 'breathwork', 'meditation', 'nap'];

    for (const type of filtered) {
      expect(shouldFilterActivityType(type)).toBe(true);
    }
  });

  it('does not filter real workout types', () => {
    const kept = ['cycling', 'running', 'swimming', 'hiking', 'walking',
      'indoor_cycling', 'mountain_biking', 'strength_training'];

    for (const type of kept) {
      expect(shouldFilterActivityType(type)).toBe(false);
    }
  });

  it('is case-insensitive (lowercases input)', () => {
    expect(shouldFilterActivityType('SEDENTARY')).toBe(true);
    expect(shouldFilterActivityType('Sedentary')).toBe(true);
    expect(shouldFilterActivityType('sedentary')).toBe(true);
    expect(shouldFilterActivityType('SLEEP')).toBe(true);
  });

  it('handles null/undefined/empty', () => {
    expect(shouldFilterActivityType(null)).toBe(false);
    expect(shouldFilterActivityType(undefined)).toBe(false);
    expect(shouldFilterActivityType('')).toBe(false);
  });
});

describe('isIndoorActivityType', () => {
  it('identifies indoor types', () => {
    const indoor = ['indoor_cycling', 'virtual_ride', 'indoor_running', 'treadmill_running',
      'indoor_walking', 'treadmill_walking', 'indoor_rowing', 'lap_swimming',
      'indoor_cardio', 'elliptical', 'stair_climbing', 'indoor_climbing'];

    for (const type of indoor) {
      expect(isIndoorActivityType(type)).toBe(true);
    }
  });

  it('returns false for outdoor types', () => {
    const outdoor = ['cycling', 'running', 'hiking', 'open_water_swimming', 'mountain_biking'];

    for (const type of outdoor) {
      expect(isIndoorActivityType(type)).toBe(false);
    }
  });

  it('handles null/undefined', () => {
    expect(isIndoorActivityType(null)).toBe(false);
    expect(isIndoorActivityType(undefined)).toBe(false);
  });
});

describe('hasMinimumActivityMetrics', () => {
  it('accepts activity with sufficient duration', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 120 })).toBe(true);
    expect(hasMinimumActivityMetrics({ movingDurationInSeconds: 300 })).toBe(true);
    expect(hasMinimumActivityMetrics({ elapsedDurationInSeconds: 150 })).toBe(true);
  });

  it('accepts activity with sufficient distance', () => {
    expect(hasMinimumActivityMetrics({ distanceInMeters: 100 })).toBe(true);
    expect(hasMinimumActivityMetrics({ distance: 500 })).toBe(true);
  });

  it('rejects trivial activities', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 30, distanceInMeters: 10 })).toBe(false);
    expect(hasMinimumActivityMetrics({})).toBe(false);
  });

  it('uses OR logic (either metric is enough)', () => {
    expect(hasMinimumActivityMetrics({ durationInSeconds: 200, distanceInMeters: 0 })).toBe(true);
    expect(hasMinimumActivityMetrics({ durationInSeconds: 0, distanceInMeters: 500 })).toBe(true);
  });
});

describe('isFitPingWithoutMetrics', () => {
  // The exact shape Garmin delivered for the 2026-09-03 ride that was lost.
  const ping = {
    manual: false,
    userId: '0ff8b87b',
    fileType: 'FIT',
    summaryId: '24229218392-file',
    activityId: 24229218392,
    deviceName: 'Garmin Edge 540',
    callbackURL: 'https://apis.garmin.com/wellness-api/rest/activityFile?id=1&token=t',
    isWebUpload: false,
    activityName: 'Erie Road Cycling',
    activityType: 'ROAD_BIKING',
    startTimeInSeconds: 1788473783,
  };

  it('recognises a bare FIT ping (callbackURL, no distance or duration)', () => {
    expect(isFitPingWithoutMetrics(ping)).toBe(true);
    // ...and confirms the old filter would have thrown it away
    expect(hasMinimumActivityMetrics(ping)).toBe(false);
  });

  it('is false for a CONNECT_ACTIVITY summary (no callbackURL)', () => {
    expect(isFitPingWithoutMetrics({ activityId: 1, durationInSeconds: 3600, distanceInMeters: 30000 })).toBe(false);
  });

  it('is false for a ping that already carries metrics', () => {
    expect(isFitPingWithoutMetrics({ ...ping, durationInSeconds: 3600 })).toBe(false);
    expect(isFitPingWithoutMetrics({ ...ping, distanceInMeters: 32000 })).toBe(false);
  });

  it('ignores zero and non-numeric metric fields', () => {
    expect(isFitPingWithoutMetrics({ ...ping, durationInSeconds: 0, distanceInMeters: '0' })).toBe(true);
  });

  it('accepts the FIT URL from the event row when the item lacks callbackURL', () => {
    const { callbackURL, ...noUrl } = ping;
    expect(isFitPingWithoutMetrics(noUrl)).toBe(false);
    expect(isFitPingWithoutMetrics(noUrl, 'https://apis.garmin.com/wellness-api/rest/activityFile?id=1')).toBe(true);
  });

  it('handles null/undefined/empty callbackURL', () => {
    expect(isFitPingWithoutMetrics(null)).toBe(false);
    expect(isFitPingWithoutMetrics(undefined)).toBe(false);
    expect(isFitPingWithoutMetrics({ ...ping, callbackURL: '' })).toBe(false);
  });
});

describe('activityInfoFromFitSummary', () => {
  const ping = {
    callbackURL: 'https://apis.garmin.com/x',
    activityId: 24229218392,
    activityName: 'Erie Road Cycling',
    activityType: 'ROAD_BIKING',
    startTimeInSeconds: 1788473783,
  };
  // extractSummary() output shape for a 32 km / 1h40 ride with power + HR.
  const fitSummary = {
    totalDistance: 32187,
    totalTime: 5820,
    totalElapsedTime: 6100,
    totalAscent: 310,
    totalDescent: 305,
    avgSpeed: 5.53,
    maxSpeed: 14.2,
    avgHeartRate: 142,
    maxHeartRate: 171,
    avgPower: 188,
    maxPower: 640,
    avgCadence: 86,
    sport: 'cycling',
    startTime: '2026-09-03T22:16:23.000Z',
  };

  it('fills the Garmin summary fields the builder and filter read', () => {
    const info = activityInfoFromFitSummary(ping, fitSummary);
    expect(info.distanceInMeters).toBe(32187);
    expect(info.durationInSeconds).toBe(6100);
    expect(info.elapsedDurationInSeconds).toBe(6100);
    expect(info.movingDurationInSeconds).toBe(5820);
    expect(info.totalElevationGainInMeters).toBe(310);
    expect(info.averageSpeedInMetersPerSecond).toBe(5.53);
    expect(info.maxSpeedInMetersPerSecond).toBe(14.2);
    expect(info.averagePower).toBe(188);
    expect(info.averageHeartRateInBeatsPerMinute).toBe(142);
    expect(info.maxHeartRateInBeatsPerMinute).toBe(171);
    expect(info.avgCadence).toBe(86);
    expect(info.summarySource).toBe('fit_session');
    // The enriched ping now passes the filter that rejected the bare one.
    expect(hasMinimumActivityMetrics(info)).toBe(true);
  });

  it('keeps the ping fields and never mutates the input', () => {
    const info = activityInfoFromFitSummary(ping, fitSummary);
    expect(info.activityName).toBe('Erie Road Cycling');
    expect(info.activityType).toBe('ROAD_BIKING');
    expect(info.callbackURL).toBe(ping.callbackURL);
    expect(info.startTimeInSeconds).toBe(1788473783); // ping wins over FIT startTime
    expect(ping.distanceInMeters).toBeUndefined();
  });

  it('lets values already on the ping win over the FIT', () => {
    const info = activityInfoFromFitSummary({ ...ping, distanceInMeters: 32000 }, fitSummary);
    expect(info.distanceInMeters).toBe(32000);
  });

  it('derives startTimeInSeconds from the FIT when the ping lacks it', () => {
    const { startTimeInSeconds, ...noStart } = ping;
    const info = activityInfoFromFitSummary(noStart, fitSummary);
    expect(info.startTimeInSeconds).toBe(Math.floor(Date.parse(fitSummary.startTime) / 1000));
  });

  it('skips zero / null FIT values so the builder falls through to null', () => {
    const info = activityInfoFromFitSummary(ping, { ...fitSummary, avgPower: null, totalAscent: 0, avgHeartRate: null });
    expect(info.averagePower).toBeUndefined();
    expect(info.totalElevationGainInMeters).toBeUndefined();
    expect(info.averageHeartRateInBeatsPerMinute).toBeUndefined();
  });

  it('falls back to totalTime when totalElapsedTime is missing', () => {
    const info = activityInfoFromFitSummary(ping, { ...fitSummary, totalElapsedTime: 0 });
    expect(info.durationInSeconds).toBe(5820);
    expect(info.movingDurationInSeconds).toBe(5820);
  });

  it('returns a copy of the ping when there is no FIT summary', () => {
    const info = activityInfoFromFitSummary(ping, null);
    expect(info).toEqual(ping);
    expect(info).not.toBe(ping);
    expect(hasMinimumActivityMetrics(info)).toBe(false);
  });
});
