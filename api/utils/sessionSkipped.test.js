import { describe, it, expect } from 'vitest';
import { isSkippedSession } from './sessionSkipped.js';

describe('isSkippedSession', () => {
  it('reads the status, with or without a reason', () => {
    expect(isSkippedSession({ status: 'skipped', skipped_reason: null })).toBe(true);
    expect(isSkippedSession({ status: 'skipped', skipped_reason: 'Legs need rest' })).toBe(true);
  });

  it('falls back to the reason for readers without a status', () => {
    expect(isSkippedSession({ skipped_reason: 'sick' })).toBe(true);
  });

  it('is false for planned, done and missing sessions', () => {
    expect(isSkippedSession({ status: 'planned', skipped_reason: null })).toBe(false);
    expect(isSkippedSession({ status: 'done' })).toBe(false);
    expect(isSkippedSession(null)).toBe(false);
  });
});
