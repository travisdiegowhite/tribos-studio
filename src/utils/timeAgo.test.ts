import { describe, it, expect } from 'vitest';
import { timeAgo } from './timeAgo';

describe('timeAgo', () => {
  const now = new Date('2026-07-06T12:00:00Z');

  it('returns "just now" for under a minute', () => {
    expect(timeAgo(new Date('2026-07-06T11:59:30Z'), now)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(timeAgo(new Date('2026-07-06T11:45:00Z'), now)).toBe('15m ago');
  });

  it('formats hours', () => {
    expect(timeAgo(new Date('2026-07-06T08:00:00Z'), now)).toBe('4h ago');
  });

  it('formats days under a week', () => {
    expect(timeAgo(new Date('2026-07-03T12:00:00Z'), now)).toBe('3d ago');
  });

  it('falls back to a locale date beyond a week', () => {
    const old = new Date('2026-06-01T12:00:00Z');
    expect(timeAgo(old, now)).toBe(old.toLocaleDateString());
  });

  it('handles invalid dates', () => {
    expect(timeAgo('not-a-date', now)).toBe('');
  });
});
