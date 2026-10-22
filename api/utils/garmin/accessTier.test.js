import { isGarminHistoricalAccessEnabled, getGarminMaxConnections } from './accessTier.js';

describe('accessTier', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Starter access: no historical data, 1,000 connections', () => {
    vi.stubEnv('GARMIN_HISTORICAL_ACCESS_ENABLED', '');
    vi.stubEnv('GARMIN_MAX_CONNECTIONS', '');
    expect(isGarminHistoricalAccessEnabled()).toBe(false);
    expect(getGarminMaxConnections()).toBe(1000);
  });

  it('enables historical access only for the exact string "true"', () => {
    vi.stubEnv('GARMIN_HISTORICAL_ACCESS_ENABLED', '1');
    expect(isGarminHistoricalAccessEnabled()).toBe(false);
    vi.stubEnv('GARMIN_HISTORICAL_ACCESS_ENABLED', 'true');
    expect(isGarminHistoricalAccessEnabled()).toBe(true);
  });

  it('reads the connection cap from env and ignores junk', () => {
    vi.stubEnv('GARMIN_MAX_CONNECTIONS', '250');
    expect(getGarminMaxConnections()).toBe(250);
    vi.stubEnv('GARMIN_MAX_CONNECTIONS', 'lots');
    expect(getGarminMaxConnections()).toBe(1000);
  });
});
