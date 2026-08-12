import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @sentry/node so reportStravaApiFailure's captureServerError path is inert.
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import {
  isStravaAppInactive,
  reportStravaApiFailure,
  STRAVA_APP_INACTIVE_PROCESS_ERROR,
} from './stravaAppStatus.js';

// The exact body Strava returned throughout the 2026-06-30 → 2026-08-11
// app deactivation (from Vercel runtime logs).
const APP_INACTIVE_BODY = '{"message":"Forbidden","errors":[{"resource":"Application","field":"Status","code":"Inactive"}]}';

describe('isStravaAppInactive', () => {
  it('detects the app-inactive 403 body', () => {
    expect(isStravaAppInactive(403, APP_INACTIVE_BODY)).toBe(true);
  });

  it('ignores 403s with other error bodies (e.g. private activity, athlete block)', () => {
    expect(isStravaAppInactive(403, '{"message":"Forbidden","errors":[{"resource":"Activity","field":"","code":"private"}]}')).toBe(false);
    expect(isStravaAppInactive(403, '{"message":"Forbidden"}')).toBe(false);
  });

  it('ignores non-403 statuses even with a matching body', () => {
    expect(isStravaAppInactive(401, APP_INACTIVE_BODY)).toBe(false);
    expect(isStravaAppInactive(429, '{"message":"Rate Limit Exceeded"}')).toBe(false);
    expect(isStravaAppInactive(404, '{"message":"Record Not Found"}')).toBe(false);
  });

  it('tolerates non-JSON and empty bodies', () => {
    expect(isStravaAppInactive(403, '<html>Forbidden</html>')).toBe(false);
    expect(isStravaAppInactive(403, '')).toBe(false);
    expect(isStravaAppInactive(403, undefined)).toBe(false);
  });
});

describe('reportStravaApiFailure', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns appInactive true and emits the strava.app_inactive server-sentry line', () => {
    const { appInactive } = reportStravaApiFailure({
      status: 403,
      bodyText: APP_INACTIVE_BODY,
      endpoint: '/activities/123',
      userId: 'user-1',
    });

    expect(appInactive).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[server-sentry]',
      expect.stringContaining('"tag":"strava.app_inactive"')
    );
  });

  it('returns appInactive false and stays silent for ordinary failures', () => {
    const { appInactive } = reportStravaApiFailure({
      status: 429,
      bodyText: '{"message":"Rate Limit Exceeded"}',
      endpoint: '/athlete/activities',
    });

    expect(appInactive).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      '[server-sentry]',
      expect.stringContaining('strava.app_inactive')
    );
  });
});

describe('process_error contract', () => {
  it('the marker string starts with a parenthesis-free prefix the health monitor can LIKE-match', () => {
    const prefix = STRAVA_APP_INACTIVE_PROCESS_ERROR.split(' (')[0];
    expect(prefix).toBe('Strava application inactive');
    expect(STRAVA_APP_INACTIVE_PROCESS_ERROR.startsWith(prefix)).toBe(true);
  });
});
