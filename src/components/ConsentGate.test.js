import { describe, it, expect } from 'vitest';
import { missingConsents } from './ConsentGate.jsx';
import { CURRENT_TOS_VERSION } from '../utils/legalVersions';

describe('missingConsents', () => {
  it('asks for terms when nothing is recorded', () => {
    expect(missingConsents(null, false)).toEqual({ terms: true, garmin: false });
  });

  it('asks again when the accepted version is older than the current one', () => {
    const profile = { tos_accepted_at: '2026-02-01', tos_version: '2026-02' };
    expect(missingConsents(profile, false).terms).toBe(true);
  });

  it('is satisfied by the current version', () => {
    const profile = { tos_accepted_at: '2026-10-22', tos_version: CURRENT_TOS_VERSION };
    expect(missingConsents(profile, false).terms).toBe(false);
  });

  it('asks for Garmin consent only when Garmin is connected without it', () => {
    const profile = { tos_accepted_at: 'x', tos_version: CURRENT_TOS_VERSION };
    expect(missingConsents(profile, true).garmin).toBe(true);
    expect(missingConsents(profile, false).garmin).toBe(false);
    expect(missingConsents({ ...profile, garmin_data_consent_at: 'x' }, true).garmin).toBe(false);
  });
});
