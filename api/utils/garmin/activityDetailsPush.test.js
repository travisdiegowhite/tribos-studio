/**
 * End-to-end-ish test for the Activity Details PUSH data path (the Edge 540
 * fix). Proves that an `activityDetails` push WITHOUT a callbackURL — i.e.
 * Garmin inlining the summary + per-second samples[] — is:
 *
 *   1. classified as PUSH_ACTIVITY_DETAIL → event_type 'ACTIVITY_DETAIL_PUSH'
 *      (NOT a bare CONNECT_ACTIVITY summary, which would discard the samples), and
 *   2. converted by `extractStreamsFromActivityDetails` into full streams /
 *      polyline / power metrics, and
 *   3. accepted by `deriveCompleteness` as 'full'.
 *
 * This is the exact pipeline `api/garmin-webhook-process.js` runs for an
 * ACTIVITY_DETAIL_PUSH event — no FIT file, no pull token, device-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { classifyPayload, eventTypeFor } from '../garmin2/pingParser.js';
import { extractStreamsFromActivityDetails } from './activityDetailsParser.js';
import { deriveCompleteness } from './completeness.js';

// Build a realistic Edge 540 cycling activityDetails PUSH: a power-meter ride
// with GPS, HR and cadence, 180 one-second samples (3 min).
function buildEdge540DetailPush() {
  const start = 1_700_000_000;
  const samples = [];
  let distance = 0;
  for (let i = 0; i < 180; i++) {
    distance += 8 + (i % 5); // ~8-12 m/s
    samples.push({
      startTimeInSeconds: start + i,
      latitudeInDegree: 39.7392 + i * 0.0001,
      longitudeInDegree: -104.9903 + i * 0.0001,
      elevationInMeters: 1600 + Math.sin(i / 10) * 5,
      heartRate: 140 + (i % 15),
      speedMetersPerSecond: 8 + (i % 5),
      totalDistanceInMeters: distance,
      timerDurationInSeconds: i,
      clockDurationInSeconds: i,
      movingDurationInSeconds: i,
      powerInWatts: 200 + (i % 40), // varies so NP > avg
      bikeCadenceInRPM: 88 + (i % 6),
    });
  }
  return {
    activityDetails: [
      {
        userId: 'gu-edge540',
        summaryId: '987654321-detail',
        activityId: 987654321,
        summary: {
          startTimeInSeconds: start,
          startTimeOffsetInSeconds: -21600,
          activityType: 'CYCLING',
          activityName: 'Edge 540 Ride',
          durationInSeconds: 180,
          distanceInMeters: distance,
          averageHeartRateInBeatsPerMinute: 147,
          maxHeartRateInBeatsPerMinute: 165,
          averageSpeedInMetersPerSecond: 10,
          deviceName: 'Edge 540',
          totalElevationGainInMeters: 12,
        },
        samples,
      },
    ],
  };
}

describe('Activity Details PUSH → full activity (Edge 540 path)', () => {
  it('classifies an inline activityDetails push as ACTIVITY_DETAIL_PUSH', () => {
    const classified = classifyPayload(buildEdge540DetailPush());
    expect(classified.kind).toBe('PUSH_ACTIVITY_DETAIL');
    expect(eventTypeFor(classified)).toBe('ACTIVITY_DETAIL_PUSH');
  });

  it('extracts streams, polyline and power metrics from the inline samples', () => {
    const detail = buildEdge540DetailPush().activityDetails[0];
    const result = extractStreamsFromActivityDetails(detail);

    expect(result.error).toBeNull();
    expect(result.activityStreams).toBeTruthy();
    expect(result.polyline).toBeTruthy();
    expect(result.powerMetrics).toBeTruthy();
    expect(result.powerMetrics.normalizedPower).toBeGreaterThan(0);
    expect(result.powerMetrics.powerCurveSummary).toBeTruthy();
    expect(result.hasPowerData).toBe(true);
  });

  it('produces a row that deriveCompleteness rates as full', () => {
    const detail = buildEdge540DetailPush().activityDetails[0];
    const result = extractStreamsFromActivityDetails(detail);

    // Mirror what applyParsedResultToActivity writes onto the activities row.
    const row = {
      provider: 'garmin',
      type: 'Ride',
      device_watts: true,
      activity_streams: result.activityStreams,
      map_summary_polyline: result.polyline,
      power_curve_summary: result.powerMetrics.powerCurveSummary,
      normalized_power: result.powerMetrics.normalizedPower,
      effective_power: result.powerMetrics.normalizedPower,
    };

    expect(deriveCompleteness(row)).toBe('full');
  });

  it('does not promote a samples-less (manual) detail to full', () => {
    const detail = {
      summaryId: 'manual-1',
      activityId: 1,
      summary: { activityType: 'CYCLING', durationInSeconds: 600, distanceInMeters: 5000 },
      samples: [],
    };
    const result = extractStreamsFromActivityDetails(detail);
    expect(result.activityStreams).toBeNull();
    expect(result.polyline).toBeNull();

    const row = {
      provider: 'garmin',
      type: 'Ride',
      device_watts: false,
      activity_streams: result.activityStreams,
      map_summary_polyline: result.polyline,
    };
    expect(deriveCompleteness(row)).toBe('summary_only');
  });
});
