import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @sentry/node before importing the module under test.
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from '@sentry/node';

describe('serverSentry', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // reset the module-level `initialized` flag
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.SENTRY_DSN;
  });

  it('logs structured line and skips Sentry when no DSN configured', async () => {
    const { captureServerError } = await import('./serverSentry.js');
    captureServerError(new Error('boom'), { tag: 'garmin.test', extra: { a: 1 } });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[server-sentry]',
      expect.stringContaining('"tag":"garmin.test"')
    );
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initializes once and forwards exceptions with the tag when DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const { captureServerError } = await import('./serverSentry.js');

    const err = new Error('boom');
    captureServerError(err, { tag: 'garmin.token_death', extra: { user_id: 'u1' } });
    captureServerError(err, { tag: 'garmin.token_death' });

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 })
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: { tag: 'garmin.token_death' }, extra: { user_id: 'u1' } })
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('routes string messages through captureMessage at error level', async () => {
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const { captureServerError } = await import('./serverSentry.js');

    captureServerError('SLI breach: queue_lag', { tag: 'garmin.queue_lag' });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'SLI breach: queue_lag',
      expect.objectContaining({ level: 'error', tags: { tag: 'garmin.queue_lag' } })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('flushServerSentry resolves false when Sentry never initialized', async () => {
    const { flushServerSentry } = await import('./serverSentry.js');
    await expect(flushServerSentry()).resolves.toBe(false);
    expect(Sentry.flush).not.toHaveBeenCalled();
  });

  it('flushServerSentry delegates to Sentry.flush once initialized', async () => {
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const { captureServerError, flushServerSentry } = await import('./serverSentry.js');

    captureServerError('warm-up', { tag: 'garmin.test' });
    await expect(flushServerSentry(500)).resolves.toBe(true);
    expect(Sentry.flush).toHaveBeenCalledWith(500);
  });
});
