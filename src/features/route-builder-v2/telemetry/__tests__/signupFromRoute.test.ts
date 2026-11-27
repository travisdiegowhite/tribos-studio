import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../routing-landing/landingTelemetry', () => ({
  trackLanding: vi.fn(),
}));

import { trackLanding } from '../../../routing-landing/landingTelemetry';
import { markSignupFromRoute, consumeSignupFromRoute } from '../signupFromRoute';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('signupFromRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackLanding).mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(NOW - HOUR);
  });

  it('fires account_created_from_route for a new account after a guest save', () => {
    markSignupFromRoute('save');
    expect(consumeSignupFromRoute({ created_at: iso(10 * 60 * 1000) }, NOW)).toBe(true);
    expect(trackLanding).toHaveBeenCalledWith('account_created_from_route', {
      trigger: 'save',
      surface: 'rb2',
    });
  });

  it('fires only once per mark', () => {
    markSignupFromRoute('gen_cap');
    consumeSignupFromRoute({ created_at: iso(HOUR) }, NOW);
    expect(consumeSignupFromRoute({ created_at: iso(HOUR) }, NOW)).toBe(false);
    expect(trackLanding).toHaveBeenCalledTimes(1);
  });

  it('does not fire for an existing account that signed in, and clears the mark', () => {
    markSignupFromRoute('save');
    expect(consumeSignupFromRoute({ created_at: iso(30 * 24 * HOUR) }, NOW)).toBe(false);
    expect(trackLanding).not.toHaveBeenCalled();
    expect(localStorage.getItem('tribos_signup_from_route')).toBeNull();
  });

  it('does nothing without a mark, and keeps the mark until a user exists', () => {
    expect(consumeSignupFromRoute({ created_at: iso(HOUR) }, NOW)).toBe(false);
    markSignupFromRoute('save');
    expect(consumeSignupFromRoute(null, NOW)).toBe(false);
    expect(localStorage.getItem('tribos_signup_from_route')).not.toBeNull();
  });

  it('ignores a stale mark', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW - 8 * 24 * HOUR);
    markSignupFromRoute('save');
    expect(consumeSignupFromRoute({ created_at: iso(HOUR) }, NOW)).toBe(false);
  });
});
