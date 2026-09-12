import { describe, it, expect, vi } from 'vitest';

// The cron builds a service-role client at module load; stub it so the
// module evaluates under vitest. Only the pure guard is under test here.
vi.mock('../utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({}),
}));

const { isTooOldForWelcome, WELCOME_MAX_ACCOUNT_AGE_MS } = await import('./welcome-email.js');

const NOW = new Date('2026-09-12T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

describe('welcome-email: isTooOldForWelcome', () => {
  it('welcomes an account created minutes ago', () => {
    expect(isTooOldForWelcome(hoursAgo(0.25), NOW)).toBe(false);
  });

  it('welcomes an account created inside the 48h window', () => {
    expect(isTooOldForWelcome(hoursAgo(47), NOW)).toBe(false);
  });

  it('skips an account created before the window', () => {
    // The January cohort whose profile row only appears on their next login.
    expect(isTooOldForWelcome(hoursAgo(49), NOW)).toBe(true);
    expect(isTooOldForWelcome('2026-01-15T09:00:00Z', NOW)).toBe(true);
  });

  it('never blocks on a missing or unparseable timestamp', () => {
    expect(isTooOldForWelcome(null, NOW)).toBe(false);
    expect(isTooOldForWelcome(undefined, NOW)).toBe(false);
    expect(isTooOldForWelcome('not a date', NOW)).toBe(false);
  });

  it('exposes the cutoff as 48 hours', () => {
    expect(WELCOME_MAX_ACCOUNT_AGE_MS).toBe(48 * 60 * 60 * 1000);
  });
});
