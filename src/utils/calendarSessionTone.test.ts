import { describe, it, expect } from 'vitest';
import { sessionTone, sessionToneStyle, sessionRuleBorder } from './calendarSessionTone';

describe('sessionTone', () => {
  it('groups workout types by intensity', () => {
    expect(sessionTone('recovery', 'cycling')).toBe('recovery');
    expect(sessionTone('long_ride', 'cycling')).toBe('endurance');
    expect(sessionTone('sweet_spot', 'cycling')).toBe('tempo');
    expect(sessionTone('vo2max', 'running')).toBe('hard');
  });

  it('treats strength-type work and sport "other" as support', () => {
    expect(sessionTone('strength', null)).toBe('support');
    expect(sessionTone('flexibility', undefined)).toBe('support');
    expect(sessionTone('endurance', 'other')).toBe('support');
  });

  it('marks a skipped session skipped whatever its type', () => {
    expect(sessionTone('vo2max', 'cycling', true)).toBe('skipped');
    expect(sessionTone('strength', 'other', true)).toBe('skipped');
  });

  it('falls back to neutral for unknown types', () => {
    expect(sessionTone('mystery', 'cycling')).toBe('neutral');
    expect(sessionTone(null, 'cycling')).toBe('neutral');
  });
});

describe('sessionToneStyle', () => {
  it('washes key sessions but not support or unknown ones', () => {
    expect(sessionToneStyle('endurance').wash).toContain('color-mix');
    expect(sessionToneStyle('support').wash).toBeUndefined();
    expect(sessionToneStyle('neutral').wash).toBeUndefined();
    expect(sessionToneStyle('skipped').wash).toBeUndefined();
  });

  it('reserves magenta RSS for threshold and up', () => {
    expect(sessionToneStyle('hard').rssColor).toBe('var(--color-signal-text)');
    expect(sessionToneStyle('endurance').rssColor).toBe('var(--color-text-primary)');
  });
});

describe('sessionRuleBorder', () => {
  it('draws runs double, support dashed, rides solid', () => {
    expect(sessionRuleBorder('endurance', 'running')).toMatch(/double/);
    expect(sessionRuleBorder('support', 'other')).toMatch(/dashed/);
    expect(sessionRuleBorder('tempo', 'cycling')).toMatch(/solid/);
    expect(sessionRuleBorder('skipped', 'running')).toMatch(/dashed/);
  });
});
