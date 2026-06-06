import { describe, it, expect } from 'vitest';
import { evaluateProgression } from './sequencerBlockOps.js';

const TODAY = '2026-06-10';

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// daily_stats[0] = today; needs >=5 rows for afiGrowth4d. afiToday <= afi4dAgo
// keeps growth <= 0 (recovering).
function makeCtx({ fs = 25, afiToday = 40, afi4dAgo = 45, blockType = 'threshold', ftpRisePct = 0, aRaceInDays = null }) {
  const daily_stats = [
    { date: TODAY, form_score: fs, afi: afiToday, tfi: 60 },
    { date: addDays(TODAY, -1), form_score: fs, afi: afiToday, tfi: 60 },
    { date: addDays(TODAY, -2), form_score: fs, afi: afiToday, tfi: 60 },
    { date: addDays(TODAY, -3), form_score: fs, afi: afiToday, tfi: 60 },
    { date: addDays(TODAY, -4), form_score: fs, afi: afi4dAgo, tfi: 60 },
  ];
  return {
    daily_stats,
    current_block: { block_type: blockType },
    progression: { ftp_rise_pct: ftpRisePct },
    upcoming_events:
      aRaceInDays == null
        ? []
        : [{ id: 'r1', tier: 'A', status: 'upcoming', date: addDays(TODAY, aRaceInDays) }],
  };
}

const z2 = { date: TODAY, session_type: 'z2', target_rss: 55, target_duration_min: 75, prescribed_intervals: null, long_ride_flag: false, notes: '' };

describe('evaluateProgression', () => {
  it('upgrades a z2 day to tempo when fresh in a build block', () => {
    const out = evaluateProgression(makeCtx({ fs: 25 }), z2);
    expect(out.upgraded).toBe(true);
    expect(out.substitute.session_type).toBe('tempo');
    expect(out.substitute.target_rss).toBeGreaterThan(55);
    expect(out.reason).toMatch(/Form Score/i);
  });

  it('does nothing when neither fresh nor FTP has risen', () => {
    expect(evaluateProgression(makeCtx({ fs: 5, ftpRisePct: 0 }), z2)).toEqual({ upgraded: false });
  });

  it('does not push inside a taper block', () => {
    expect(evaluateProgression(makeCtx({ fs: 25, blockType: 'taper' }), z2)).toEqual({ upgraded: false });
  });

  it('does not push within the taper window of an A race', () => {
    expect(evaluateProgression(makeCtx({ fs: 25, aRaceInDays: 7 }), z2)).toEqual({ upgraded: false });
  });

  it('does not push when fatigue is still climbing (afiGrowth4d > 0)', () => {
    expect(evaluateProgression(makeCtx({ fs: 25, afiToday: 50, afi4dAgo: 40 }), z2)).toEqual({ upgraded: false });
  });

  it('steps threshold up to vo2 on a real FTP gain (not freshness)', () => {
    const threshold = { ...z2, session_type: 'threshold', target_rss: 85 };
    const out = evaluateProgression(makeCtx({ fs: 0, ftpRisePct: 0.08 }), threshold);
    expect(out.upgraded).toBe(true);
    expect(out.substitute.session_type).toBe('vo2');
    expect(out.reason).toMatch(/FTP/i);
  });

  it('leaves non-eligible session types (rest/z1) alone', () => {
    const rest = { ...z2, session_type: 'rest', target_rss: 0 };
    expect(evaluateProgression(makeCtx({ fs: 25 }), rest)).toEqual({ upgraded: false });
  });
});
