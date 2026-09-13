import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  writeOnboardingDraft,
  readOnboardingDraft,
  hasOnboardingDraft,
  clearOnboardingDraft,
  DRAFT_MAX_AGE_MS,
} from '../onboardingState';

const USER = 'user-1';

describe('onboardingState: seen flag', () => {
  beforeEach(() => localStorage.clear());

  it('is unseen until marked', () => {
    expect(hasSeenOnboarding(USER)).toBe(false);
    markOnboardingSeen(USER);
    expect(hasSeenOnboarding(USER)).toBe(true);
  });

  it('is per user', () => {
    markOnboardingSeen(USER);
    expect(hasSeenOnboarding('user-2')).toBe(false);
  });

  it('is never seen without a user id', () => {
    markOnboardingSeen(undefined);
    expect(hasSeenOnboarding(undefined)).toBe(false);
  });
});

describe('onboardingState: wizard draft', () => {
  beforeEach(() => localStorage.clear());

  const draft = {
    active: 7,
    answers: { experience: 'intermediate', goal: 'event' },
    targetEventName: 'Boulder Roubaix',
    targetEventDate: '2026-10-04T00:00:00.000Z',
    selectedTerrain: ['gravel'],
    ftp: 250,
    birthYear: 1984,
    unitsPreference: 'imperial',
    pendingProvider: 'strava',
  };

  it('round-trips the wizard state', () => {
    expect(hasOnboardingDraft(USER)).toBe(false);
    writeOnboardingDraft(USER, draft);
    expect(hasOnboardingDraft(USER)).toBe(true);
    const read = readOnboardingDraft(USER);
    expect(read).toMatchObject(draft);
    expect(typeof read?.savedAt).toBe('string');
  });

  it('expires after a day', () => {
    writeOnboardingDraft(USER, draft);
    const later = new Date(Date.now() + DRAFT_MAX_AGE_MS + 1000);
    expect(readOnboardingDraft(USER, later)).toBeNull();
  });

  it('ignores a draft from another schema version', () => {
    localStorage.setItem(
      `tribos_onboarding_draft_${USER}`,
      JSON.stringify({ ...draft, v: 99, savedAt: new Date().toISOString() }),
    );
    expect(readOnboardingDraft(USER)).toBeNull();
  });

  it('ignores garbage', () => {
    localStorage.setItem(`tribos_onboarding_draft_${USER}`, '{not json');
    expect(readOnboardingDraft(USER)).toBeNull();
  });

  it('clears', () => {
    writeOnboardingDraft(USER, draft);
    clearOnboardingDraft(USER);
    expect(hasOnboardingDraft(USER)).toBe(false);
  });
});
