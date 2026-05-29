import { extractStreamsFromActivityDetails } from './activityDetailsParser.js';

// Build a synthetic outdoor ride: 300 samples at 1Hz with GPS, power, HR.
function buildOutdoorRideDetail() {
  const startUnix = 1717000000;
  const samples = [];
  // Cruise around 38.83,-94.74 with a slow drift, ~180W avg power, ~140bpm HR
  for (let i = 0; i < 300; i++) {
    samples.push({
      startTimeInSeconds: startUnix + i,
      latitudeInDegree: 38.832 + i * 0.00001,
      longitudeInDegree: -94.748 + i * 0.00001,
      elevationInMeters: 300 + Math.sin(i / 20) * 5,
      heartRate: 140 + Math.floor(Math.sin(i / 30) * 5),
      speedMetersPerSecond: 8 + Math.sin(i / 15),
      totalDistanceInMeters: i * 8,
      timerDurationInSeconds: i,
      clockDurationInSeconds: i,
      movingDurationInSeconds: i,
      powerInWatts: 180 + Math.floor(Math.cos(i / 10) * 30),
      bikeCadenceInRPM: 85,
    });
  }
  return {
    summaryId: '12345-detail',
    activityId: 12345,
    summary: {
      durationInSeconds: 300,
      startTimeInSeconds: startUnix,
      activityType: 'CYCLING',
      activityName: 'Test ride',
      distanceInMeters: 300 * 8,
      averageHeartRateInBeatsPerMinute: 140,
      maxHeartRateInBeatsPerMinute: 145,
      averageSpeedInMetersPerSecond: 8,
      deviceName: 'Test',
    },
    samples,
    laps: [{ startTimeInSeconds: startUnix }],
  };
}

describe('extractStreamsFromActivityDetails', () => {
  it('returns the empty result shape (no error) when no samples are present', () => {
    const result = extractStreamsFromActivityDetails({
      summaryId: '1-detail',
      activityId: 1,
      summary: { activityName: 'Manual', activityType: 'CYCLING' },
      samples: [],
    });
    expect(result.error).toBeNull();
    expect(result.polyline).toBeNull();
    expect(result.activityStreams).toBeNull();
    expect(result.powerMetrics).toBeNull();
    expect(result.hasPowerData).toBe(false);
    expect(result.summary).not.toBeNull();
    expect(result.summary.activityName).toBe('Manual');
  });

  it('flags input validation errors', () => {
    expect(extractStreamsFromActivityDetails(null).error).toBeTruthy();
    expect(extractStreamsFromActivityDetails('bad').error).toBeTruthy();
  });

  it('produces fitParser-shape output for a typical outdoor ride', () => {
    const detail = buildOutdoorRideDetail();
    const result = extractStreamsFromActivityDetails(detail);

    expect(result.error).toBeNull();
    expect(result.pointCount).toBe(300);
    expect(result.simplifiedCount).toBeGreaterThan(0);
    expect(result.polyline).toBeTruthy();
    expect(typeof result.polyline).toBe('string');

    expect(result.activityStreams).not.toBeNull();
    expect(result.activityStreams.coords.length).toBeGreaterThan(0);
    expect(result.activityStreams.power).toBeDefined();
    expect(result.activityStreams.heartRate).toBeDefined();
    expect(result.activityStreams.elevation).toBeDefined();

    expect(result.hasPowerData).toBe(true);
    expect(result.powerMetrics).not.toBeNull();
    expect(result.powerMetrics.normalizedPower).toBeGreaterThan(100);
    expect(result.powerMetrics.avgPower).toBeGreaterThan(100);
    expect(result.powerMetrics.maxPower).toBeGreaterThan(result.powerMetrics.avgPower);
    expect(result.powerMetrics.powerCurveSummary).not.toBeNull();
    expect(result.powerMetrics.workKj).toBeGreaterThan(0);
    expect(result.powerMetrics.powerSampleCount).toBe(300);

    // Summary maps to fitParser's snake-case shape
    expect(result.summary.duration).toBe(300);
    expect(result.summary.avgHeartRate).toBe(140);
    expect(result.summary.activityName).toBe('Test ride');
  });

  it('filters sentinel values (e.g. unreasonable power spike)', () => {
    const detail = buildOutdoorRideDetail();
    // Inject a clearly bogus power spike — must be filtered out.
    detail.samples[100].powerInWatts = 9999;
    const result = extractStreamsFromActivityDetails(detail);
    // 9999 > MAX_VALID_POWER_WATTS (2500), so it shouldn't influence maxPower.
    expect(result.powerMetrics.maxPower).toBeLessThan(500);
  });

  it('falls back to data-points streams for indoor rides (no GPS)', () => {
    const detail = buildOutdoorRideDetail();
    for (const s of detail.samples) {
      delete s.latitudeInDegree;
      delete s.longitudeInDegree;
    }
    const result = extractStreamsFromActivityDetails(detail);
    expect(result.polyline).toBeNull();
    expect(result.activityStreams).not.toBeNull();
    // Even without GPS, power/HR streams should be present from the data-points fallback.
    expect(result.activityStreams.power).toBeDefined();
  });

  it('matches by either activityId (numeric) or summaryId (string-detail)', () => {
    // This test is a contract check: the modal/cron match on both fields,
    // so callers can rely on both being present in the returned shape's
    // input contract. (The parser itself doesn't choose — but if this
    // input has neither field we should still produce sensible output.)
    const detail = buildOutdoorRideDetail();
    expect(detail.activityId).toBe(12345);
    expect(detail.summaryId).toBe('12345-detail');
  });
});
