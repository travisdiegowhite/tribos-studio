import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  initArrivalSession,
  saveArrivalSession,
  clearArrivalSession,
  captureArrivalFromParams,
} from '../arrivalSession';

const CALENDAR_PARAMS = new URLSearchParams(
  'from=calendar&goal=endurance&duration=90&distance=45&scheduledDate=2026-07-08&workoutName=Endurance%20Ride&workoutId=endurance_90',
);

describe('arrivalSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures the calendar params into a context', () => {
    const ctx = captureArrivalFromParams(CALENDAR_PARAMS);
    expect(ctx).toMatchObject({
      workoutId: 'endurance_90',
      workoutName: 'Endurance Ride',
      goal: 'endurance',
      durationMinutes: 90,
      distanceKm: 45,
      scheduledDate: '2026-07-08',
    });
  });

  it('treats missing or non-positive numbers as null', () => {
    const ctx = captureArrivalFromParams(new URLSearchParams('from=calendar&duration=0'));
    expect(ctx.durationMinutes).toBeNull();
    expect(ctx.distanceKm).toBeNull();
  });

  it('a calendar landing opens the card and persists the session', () => {
    const init = initArrivalSession(CALENDAR_PARAMS);
    expect(init.status).toBe('open');
    expect(init.context?.workoutName).toBe('Endurance Ride');
    // Survives a remount with no params (the /ride/:id hop).
    const restored = initArrivalSession(new URLSearchParams());
    expect(restored.context?.workoutName).toBe('Endurance Ride');
    expect(restored.status).toBe('open');
  });

  it('a fresh calendar landing replaces a stale stored session', () => {
    initArrivalSession(CALENDAR_PARAMS);
    const init = initArrivalSession(
      new URLSearchParams('from=calendar&goal=recovery&workoutName=Spin'),
    );
    expect(init.context?.workoutName).toBe('Spin');
  });

  it('restores a minimized session with its start location', () => {
    const ctx = captureArrivalFromParams(CALENDAR_PARAMS);
    saveArrivalSession(ctx, 'minimized', { startLocation: 'Boulder, CO' });
    const init = initArrivalSession(new URLSearchParams());
    expect(init.status).toBe('minimized');
    expect(init.startLocation).toBe('Boulder, CO');
    expect(init.pendingNew).toBe(false);
  });

  it('consumes pendingNew exactly once', () => {
    const ctx = captureArrivalFromParams(CALENDAR_PARAMS);
    saveArrivalSession(ctx, 'minimized', { startLocation: 'Boulder', pendingNew: true });
    const first = initArrivalSession(new URLSearchParams());
    expect(first.pendingNew).toBe(true);
    const second = initArrivalSession(new URLSearchParams());
    expect(second.pendingNew).toBe(false);
    expect(second.startLocation).toBe('Boulder');
  });

  it('returns nothing after the session is cleared', () => {
    initArrivalSession(CALENDAR_PARAMS);
    clearArrivalSession();
    const init = initArrivalSession(new URLSearchParams());
    expect(init.context).toBeNull();
    expect(init.status).toBe('done');
  });

  it('expires sessions older than 12 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T06:00:00Z'));
    initArrivalSession(CALENDAR_PARAMS);
    vi.setSystemTime(new Date('2026-07-08T19:00:00Z'));
    const init = initArrivalSession(new URLSearchParams());
    expect(init.context).toBeNull();
  });

  it('survives corrupted storage', () => {
    sessionStorage.setItem('rb2-workout-arrival', '{not json');
    const init = initArrivalSession(new URLSearchParams());
    expect(init.context).toBeNull();
  });
});
