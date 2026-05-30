import { describe, it, expect } from 'vitest';
import { deriveTss } from './deriveTss.js';

describe('deriveTss', () => {
  it('matches the canonical TSS=100 case (1 hour at FTP, NP=FTP)', () => {
    const r = deriveTss({ np: 250, ftp: 250, durationSec: 3600 });
    expect(r.intensityFactor).toBe(1);
    expect(r.tss).toBe(100);
    // canonical/legacy dual-write
    expect(r.rideIntensity).toBe(r.intensityFactor);
    expect(r.rss).toBe(r.tss);
  });

  it('computes a typical endurance ride (~62 TSS for 1h @ 80% FTP)', () => {
    const r = deriveTss({ np: 200, ftp: 250, durationSec: 3600 });
    expect(r.intensityFactor).toBe(0.8);
    // (3600 * 200 * 0.8) / (250 * 3600) * 100 = 64
    expect(r.tss).toBe(64);
    expect(r.rss).toBe(64);
  });

  it('scales with duration (90 min @ 80% FTP)', () => {
    const r = deriveTss({ np: 200, ftp: 250, durationSec: 5400 });
    expect(r.intensityFactor).toBe(0.8);
    expect(r.tss).toBe(96);
  });

  it('handles a sweet-spot interval (30 min @ 90% FTP)', () => {
    const r = deriveTss({ np: 225, ftp: 250, durationSec: 1800 });
    expect(r.intensityFactor).toBe(0.9);
    // 1800 * 225 * 0.9 / (250 * 3600) * 100 = 40.5
    expect(r.tss).toBe(40.5);
  });

  it('rounds IF to 3 decimals and TSS to 1 decimal', () => {
    const r = deriveTss({ np: 271, ftp: 250, durationSec: 3600 });
    // 271/250 = 1.084
    expect(r.intensityFactor).toBe(1.084);
    expect(Number.isInteger(r.tss * 10)).toBe(true);
  });

  it('returns all nulls when NP is missing', () => {
    const r = deriveTss({ np: null, ftp: 250, durationSec: 3600 });
    expect(r).toEqual({ intensityFactor: null, rideIntensity: null, tss: null, rss: null });
  });

  it('returns all nulls when FTP is missing', () => {
    const r = deriveTss({ np: 200, ftp: null, durationSec: 3600 });
    expect(r).toEqual({ intensityFactor: null, rideIntensity: null, tss: null, rss: null });
  });

  it('returns all nulls when duration is zero', () => {
    const r = deriveTss({ np: 200, ftp: 250, durationSec: 0 });
    expect(r.tss).toBeNull();
  });

  it('returns all nulls when inputs are not finite numbers', () => {
    expect(deriveTss({ np: NaN, ftp: 250, durationSec: 3600 }).tss).toBeNull();
    expect(deriveTss({ np: 200, ftp: Infinity, durationSec: 3600 }).tss).toBeNull();
    expect(deriveTss({ np: '200', ftp: 250, durationSec: 3600 }).tss).toBeNull();
  });

  it('handles no-args call without throwing', () => {
    expect(() => deriveTss()).not.toThrow();
    expect(deriveTss().tss).toBeNull();
  });

  it('always returns rss === tss and rideIntensity === intensityFactor (D4 — power tier, no terrain)', () => {
    const r = deriveTss({ np: 215, ftp: 250, durationSec: 4200 });
    expect(r.rss).toBe(r.tss);
    expect(r.rideIntensity).toBe(r.intensityFactor);
  });
});
