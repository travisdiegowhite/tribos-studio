import { describe, it, expect } from 'vitest';
import { translateCTL, translateATL, translateTSB, translateTSS, colorToVar } from '../translate';
import { ctlTooltip, atlTooltip, tsbTooltip } from '../tooltips';

describe('translateCTL', () => {
  it('returns "Just getting started" for CTL 0–25', () => {
    expect(translateCTL(0)).toEqual({ label: 'Just getting started', color: 'muted' });
    expect(translateCTL(25)).toEqual({ label: 'Just getting started', color: 'muted' });
  });

  it('returns "Building your base" for CTL 26–45', () => {
    expect(translateCTL(26)).toEqual({ label: 'Building your base', color: 'orange' });
    expect(translateCTL(45)).toEqual({ label: 'Building your base', color: 'orange' });
  });

  it('returns "Solid fitness" for CTL 46–65', () => {
    expect(translateCTL(46)).toEqual({ label: 'Solid fitness', color: 'teal' });
    expect(translateCTL(65)).toEqual({ label: 'Solid fitness', color: 'teal' });
  });

  it('returns "Strong & consistent" for CTL 66–85', () => {
    expect(translateCTL(66)).toEqual({ label: 'Strong & consistent', color: 'teal' });
    expect(translateCTL(85)).toEqual({ label: 'Strong & consistent', color: 'teal' });
  });

  it('returns "High performance" for CTL 86+', () => {
    expect(translateCTL(86)).toEqual({ label: 'High performance', color: 'gold' });
    expect(translateCTL(120)).toEqual({ label: 'High performance', color: 'gold' });
  });
});

describe('translateATL', () => {
  it('returns "Legs are fresh" when ratio < 0.85', () => {
    // ATL=40, CTL=60 → ratio=0.667
    expect(translateATL(40, 60)).toEqual({ label: 'Legs are fresh', color: 'teal' });
  });

  it('returns "Good training load" when ratio 0.85–1.05', () => {
    // ATL=51, CTL=60 → ratio=0.85
    expect(translateATL(51, 60)).toEqual({ label: 'Good training load', color: 'teal' });
    // ATL=63, CTL=60 → ratio=1.05
    expect(translateATL(63, 60)).toEqual({ label: 'Good training load', color: 'teal' });
  });

  it('returns "Feeling the work" when ratio 1.06–1.20', () => {
    // ATL=64, CTL=60 → ratio=1.0667
    expect(translateATL(64, 60)).toEqual({ label: 'Feeling the work', color: 'orange' });
    // ATL=72, CTL=60 → ratio=1.20
    expect(translateATL(72, 60)).toEqual({ label: 'Feeling the work', color: 'orange' });
  });

  it('returns "Deep fatigue" when ratio > 1.20', () => {
    // ATL=73, CTL=60 → ratio=1.2167
    expect(translateATL(73, 60)).toEqual({ label: 'Deep fatigue — watch it', color: 'coral' });
  });

  it('handles CTL=0 without division by zero', () => {
    // When CTL is 0, ratio defaults to 1 → "Good training load"
    expect(translateATL(30, 0)).toEqual({ label: 'Good training load', color: 'teal' });
  });

  it('handles both ATL and CTL at 0', () => {
    expect(translateATL(0, 0)).toEqual({ label: 'Good training load', color: 'teal' });
  });
});

describe('translateTSB', () => {
  it('returns "In the hole" for TSB <= -20', () => {
    expect(translateTSB(-20)).toEqual({ label: 'In the hole', color: 'coral' });
    expect(translateTSB(-30)).toEqual({ label: 'In the hole', color: 'coral' });
  });

  it('returns "Digging in" for TSB -19 to -10', () => {
    expect(translateTSB(-19)).toEqual({ label: 'Digging in', color: 'orange' });
    expect(translateTSB(-10)).toEqual({ label: 'Digging in', color: 'orange' });
  });

  it('returns "Training sweet spot" for TSB -9 to +2', () => {
    expect(translateTSB(-9)).toEqual({ label: 'Training sweet spot', color: 'teal' });
    expect(translateTSB(0)).toEqual({ label: 'Training sweet spot', color: 'teal' });
    expect(translateTSB(2)).toEqual({ label: 'Training sweet spot', color: 'teal' });
  });

  it('returns "Primed to perform" for TSB +3 to +15', () => {
    expect(translateTSB(3)).toEqual({ label: 'Primed to perform', color: 'gold' });
    expect(translateTSB(15)).toEqual({ label: 'Primed to perform', color: 'gold' });
  });

  it('returns "Tapered" for TSB > 15', () => {
    expect(translateTSB(16)).toEqual({ label: 'Tapered — ready to go', color: 'gold' });
    expect(translateTSB(30)).toEqual({ label: 'Tapered — ready to go', color: 'gold' });
  });
});

describe('translateTSS', () => {
  it('returns "Easy spin" for TSS 0–50', () => {
    expect(translateTSS(0)).toEqual({ label: 'Easy spin', color: 'teal' });
    expect(translateTSS(50)).toEqual({ label: 'Easy spin', color: 'teal' });
  });

  it('returns "Productive ride" for TSS 51–100', () => {
    expect(translateTSS(51)).toEqual({ label: 'Productive ride', color: 'teal' });
    expect(translateTSS(100)).toEqual({ label: 'Productive ride', color: 'teal' });
  });

  it('returns "Solid effort" for TSS 101–150', () => {
    expect(translateTSS(101)).toEqual({ label: 'Solid effort', color: 'orange' });
    expect(translateTSS(150)).toEqual({ label: 'Solid effort', color: 'orange' });
  });

  it('returns "Big day" for TSS 151–200', () => {
    expect(translateTSS(151)).toEqual({ label: 'Big day', color: 'orange' });
    expect(translateTSS(200)).toEqual({ label: 'Big day', color: 'orange' });
  });

  it('returns "Epic" for TSS > 200', () => {
    expect(translateTSS(201)).toEqual({ label: 'Epic — rest incoming', color: 'coral' });
    expect(translateTSS(350)).toEqual({ label: 'Epic — rest incoming', color: 'coral' });
  });
});

describe('colorToVar', () => {
  it('maps all colors to CSS variables', () => {
    expect(colorToVar('teal')).toBe('var(--color-teal)');
    expect(colorToVar('orange')).toBe('var(--color-orange)');
    expect(colorToVar('gold')).toBe('var(--color-gold)');
    expect(colorToVar('coral')).toBe('var(--color-coral)');
    expect(colorToVar('muted')).toBe('var(--color-text-muted)');
  });
});

describe('tooltip functions', () => {
  it('ctlTooltip returns different copy per range', () => {
    expect(ctlTooltip(10)).toContain('early-stage');
    expect(ctlTooltip(30)).toContain('building phase');
    expect(ctlTooltip(50)).toContain('aerobic base');
    expect(ctlTooltip(70)).toContain('consistent work');
    expect(ctlTooltip(90)).toContain('Elite');
  });

  it('atlTooltip returns different copy per ratio range', () => {
    expect(atlTooltip(40, 60)).toContain('recovered');
    expect(atlTooltip(55, 60)).toContain('productive zone');
    expect(atlTooltip(66, 60)).toContain('above your fitness');
    expect(atlTooltip(80, 60)).toContain('outpacing');
  });

  it('tsbTooltip returns different copy per range', () => {
    expect(tsbTooltip(-25)).toContain('fatigue hole');
    expect(tsbTooltip(-15)).toContain('Working hard');
    expect(tsbTooltip(-5)).toContain('ideal for training');
    expect(tsbTooltip(10)).toContain('clearing');
    expect(tsbTooltip(20)).toContain('fully rested');
  });
});
