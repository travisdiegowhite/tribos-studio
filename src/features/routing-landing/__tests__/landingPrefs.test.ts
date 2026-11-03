import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadLandingForm,
  saveLandingForm,
  shouldShowFirstVisitCard,
  markFirstVisitCardSeen,
  DEFAULT_LANDING_FORM,
} from '../landingPrefs';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('landing form memory', () => {
  it('defaults to 30 mi, road, Comfort 2', () => {
    expect(loadLandingForm()).toEqual(DEFAULT_LANDING_FORM);
    expect(DEFAULT_LANDING_FORM.comfortLevel).toBe(2);
  });

  it('round-trips the last form', () => {
    saveLandingForm({ startLabel: 'Lyons, Colorado', start: [-105.27, 40.22], distanceMi: 50, surface: 'gravel', comfortLevel: 4 });
    expect(loadLandingForm()).toEqual({ startLabel: 'Lyons, Colorado', start: [-105.27, 40.22], distanceMi: 50, surface: 'gravel', comfortLevel: 4 });
  });

  it('drops invalid fields one by one', () => {
    localStorage.setItem(
      'routing-landing:form:v1',
      JSON.stringify({ startLabel: 7, start: [999, 1], distanceMi: 42, surface: 'track', comfortLevel: 9 }),
    );
    expect(loadLandingForm()).toEqual(DEFAULT_LANDING_FORM);
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem('routing-landing:form:v1', '{nope');
    expect(loadLandingForm()).toEqual(DEFAULT_LANDING_FORM);
  });
});

describe('first-visit card', () => {
  it('shows once', () => {
    expect(shouldShowFirstVisitCard()).toBe(true);
    markFirstVisitCardSeen();
    expect(shouldShowFirstVisitCard()).toBe(false);
  });

  it('is not shown when storage throws (rather than shown every visit)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(shouldShowFirstVisitCard()).toBe(false);
    expect(loadLandingForm()).toEqual(DEFAULT_LANDING_FORM);
  });

  it('saving with blocked storage does not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveLandingForm(DEFAULT_LANDING_FORM)).not.toThrow();
    expect(() => markFirstVisitCardSeen()).not.toThrow();
  });
});
