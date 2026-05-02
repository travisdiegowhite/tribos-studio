import { describe, it, expect } from 'vitest';
import {
  formWordFromScore,
  fitnessWord,
  fatigueWordFromAFI,
  trendWord,
  efiWord,
  tcasWord,
  colorVar,
} from './todayVocabulary';

describe('formWordFromScore', () => {
  it('maps spec bands to the correct word + token', () => {
    expect(formWordFromScore(-25)).toEqual({ word: 'Drained', token: 'coral' });
    expect(formWordFromScore(-21)).toEqual({ word: 'Drained', token: 'coral' });
    expect(formWordFromScore(-20)).toEqual({ word: 'Loaded', token: 'orange' });
    expect(formWordFromScore(-11)).toEqual({ word: 'Loaded', token: 'orange' });
    expect(formWordFromScore(-10)).toEqual({ word: 'Sweet spot', token: 'teal' });
    expect(formWordFromScore(0)).toEqual({ word: 'Sweet spot', token: 'teal' });
    expect(formWordFromScore(5)).toEqual({ word: 'Sweet spot', token: 'teal' });
    expect(formWordFromScore(6)).toEqual({ word: 'Sharp', token: 'gold' });
    expect(formWordFromScore(15)).toEqual({ word: 'Sharp', token: 'gold' });
    expect(formWordFromScore(16)).toEqual({ word: 'Stale', token: 'gray' });
  });

  it('returns Building baseline for null/undefined/NaN', () => {
    expect(formWordFromScore(null)).toEqual({ word: 'Building baseline', token: 'gray' });
    expect(formWordFromScore(undefined)).toEqual({ word: 'Building baseline', token: 'gray' });
    expect(formWordFromScore(Number.NaN)).toEqual({ word: 'Building baseline', token: 'gray' });
  });
});

describe('fitnessWord', () => {
  it('maps trend deltas to building / holding / detraining', () => {
    expect(fitnessWord(10)).toEqual({ word: 'Building', token: 'teal' });
    expect(fitnessWord(0)).toEqual({ word: 'Holding', token: 'gold' });
    expect(fitnessWord(-5)).toEqual({ word: 'Detraining', token: 'orange' });
  });

  it('returns Building baseline for null', () => {
    expect(fitnessWord(null).word).toBe('Building baseline');
  });
});

describe('fatigueWordFromAFI', () => {
  it('maps AFI ratio to Low / Productive / High / Overload', () => {
    expect(fatigueWordFromAFI(10, 100).word).toBe('Low');
    expect(fatigueWordFromAFI(50, 100).word).toBe('Productive');
    expect(fatigueWordFromAFI(80, 100).word).toBe('High');
    expect(fatigueWordFromAFI(95, 100).word).toBe('Overload');
  });

  it('handles missing or zero max', () => {
    expect(fatigueWordFromAFI(50, null).word).toBe('Building baseline');
    expect(fatigueWordFromAFI(50, 0).word).toBe('Building baseline');
  });
});

describe('trendWord', () => {
  it('maps deltas to Building / Holding / Declining', () => {
    expect(trendWord(5)).toEqual({ word: 'Building', token: 'teal' });
    expect(trendWord(0)).toEqual({ word: 'Holding', token: 'gold' });
    expect(trendWord(-5)).toEqual({ word: 'Declining', token: 'orange' });
  });
});

describe('efiWord', () => {
  it('maps EFI bands to Off plan / Drifting / On track / Locked in', () => {
    expect(efiWord(20).word).toBe('Off plan');
    expect(efiWord(40).word).toBe('Drifting');
    expect(efiWord(70).word).toBe('On track');
    expect(efiWord(90).word).toBe('Locked in');
  });
});

describe('tcasWord', () => {
  it('maps TCAS bands to Review / Building / Strong / Peak', () => {
    expect(tcasWord(15).word).toBe('Review');
    expect(tcasWord(45).word).toBe('Building');
    expect(tcasWord(70).word).toBe('Strong');
    expect(tcasWord(95).word).toBe('Peak');
  });
});

describe('colorVar', () => {
  it('returns CSS variables for each token', () => {
    expect(colorVar('teal')).toBe('var(--color-teal)');
    expect(colorVar('orange')).toBe('var(--color-orange)');
    expect(colorVar('gold')).toBe('var(--color-gold)');
    expect(colorVar('coral')).toBe('var(--color-coral)');
    expect(colorVar('gray')).toBe('var(--tribos-neutral-gray)');
  });
});
