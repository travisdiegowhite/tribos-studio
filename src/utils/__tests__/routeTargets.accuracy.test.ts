/**
 * buildTargetAccuracy — the record of what the rider asked for versus what
 * the builder delivered.
 *
 * The generator keeps its best attempt whether or not it converged, so before
 * this existed a miss was invisible: a route 25% short of the requested time
 * looked exactly like one that hit it.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTargetAccuracy,
  describeTargetMiss,
  TARGET_ACCURACY_TOLERANCE,
} from '../routeTargets.js';

describe('buildTargetAccuracy', () => {
  it('measures against time when time binds', () => {
    const a = buildTargetAccuracy({
      targetMode: 'time',
      targetDurationMinutes: 90,
      achievedMinutes: 81,
      targetDistanceKm: 36,
      achievedKm: 32,
    });
    expect(a?.mode).toBe('time');
    expect(a?.error).toBeCloseTo(-0.1, 5);
    expect(a?.withinTolerance).toBe(true); // exactly at the boundary
  });

  it('measures against distance when distance binds', () => {
    const a = buildTargetAccuracy({
      targetMode: 'distance',
      targetDistanceKm: 40,
      achievedKm: 30,
      targetDurationMinutes: 90,
      achievedMinutes: 90,
    });
    expect(a?.mode).toBe('distance');
    expect(a?.error).toBeCloseTo(-0.25, 5);
    expect(a?.withinTolerance).toBe(false);
  });

  it('signs the error so under and over are distinguishable', () => {
    const under = buildTargetAccuracy({
      targetMode: 'distance', targetDistanceKm: 40, achievedKm: 34,
    });
    const over = buildTargetAccuracy({
      targetMode: 'distance', targetDistanceKm: 40, achievedKm: 46,
    });
    expect(under?.error).toBeLessThan(0);
    expect(over?.error).toBeGreaterThan(0);
  });

  it('reports the counterpart figures even though they do not bind', () => {
    const a = buildTargetAccuracy({
      targetMode: 'time',
      targetDurationMinutes: 60,
      achievedMinutes: 62,
      targetDistanceKm: 25,
      achievedKm: 26,
    });
    expect(a?.achievedKm).toBe(26);
    expect(a?.targetKm).toBe(25);
  });

  it('stays quiet rather than claiming a miss it cannot measure', () => {
    const a = buildTargetAccuracy({ targetMode: 'time', targetDurationMinutes: 90 });
    expect(a?.error).toBeNull();
    expect(a?.withinTolerance).toBe(true);
  });

  it('treats non-positive inputs as absent', () => {
    const a = buildTargetAccuracy({
      targetMode: 'distance', targetDistanceKm: 0, achievedKm: -3,
    });
    expect(a?.targetKm).toBeNull();
    expect(a?.achievedKm).toBeNull();
    expect(a?.error).toBeNull();
  });

  it('flags a miss just outside tolerance', () => {
    const a = buildTargetAccuracy({
      targetMode: 'time',
      targetDurationMinutes: 90,
      achievedMinutes: 90 * (1 - TARGET_ACCURACY_TOLERANCE) - 1,
    });
    expect(a?.withinTolerance).toBe(false);
  });
});

describe('describeTargetMiss', () => {
  const timeAccuracy = (achievedMinutes: number) =>
    buildTargetAccuracy({
      targetMode: 'time',
      targetDurationMinutes: 90,
      achievedMinutes,
    });

  it('says nothing when the route is close enough', () => {
    expect(describeTargetMiss(timeAccuracy(85))).toBeNull();
    expect(describeTargetMiss(timeAccuracy(95))).toBeNull();
  });

  it('reports a time gap in minutes, not percentages', () => {
    expect(describeTargetMiss(timeAccuracy(74))?.label).toBe('16 min under 90');
    expect(describeTargetMiss(timeAccuracy(110))?.label).toBe('20 min over 90');
  });

  it('reports a distance gap in the rider units', () => {
    const accuracy = buildTargetAccuracy({
      targetMode: 'distance', targetDistanceKm: 40, achievedKm: 32,
    });
    expect(describeTargetMiss(accuracy)?.label).toBe('8.0 km under 40');
    expect(describeTargetMiss(accuracy, { isImperial: true })?.label).toMatch(/mi under 25$/);
  });

  it('carries the signed error so callers can style over vs under', () => {
    expect(describeTargetMiss(timeAccuracy(74))?.error).toBeLessThan(0);
    expect(describeTargetMiss(timeAccuracy(110))?.error).toBeGreaterThan(0);
  });

  it('says nothing when there is nothing to compare', () => {
    expect(describeTargetMiss(null)).toBeNull();
    expect(
      describeTargetMiss(buildTargetAccuracy({ targetMode: 'time', targetDurationMinutes: 90 })),
    ).toBeNull();
  });
});
