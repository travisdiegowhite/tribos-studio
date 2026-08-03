import { describe, it, expect } from 'vitest';
import {
  buildEvidenceSection,
  deriveSpeakingCue,
  divergenceMaySoftenModel,
  DIVERGENCE_CONFIDENCE_FLOOR,
} from './evidenceCoachSection.js';

const row = (week, verdict, confidence, extra = {}) => ({
  week,
  verdict,
  confidence,
  narrative_facts: ['Best 1-minute power up 4.3% on your previous 90-day best'],
  model_divergence: { tfi: 49, fs: -13, modelNarrative: 'fatigued', disagrees: verdict === 'ahead' },
  signals: {},
  ...extra,
});

describe('divergence floor (Phase 2 Decision 2)', () => {
  it('grants model-softening at ahead + diverges + confidence >= 0.4', () => {
    expect(divergenceMaySoftenModel(row('2026-07-27', 'ahead', 0.7))).toBe(true);
    expect(divergenceMaySoftenModel(row('2026-07-27', 'ahead', DIVERGENCE_CONFIDENCE_FLOOR))).toBe(true);
  });

  it('denies below the floor even when diverging', () => {
    const r = row('2026-06-01', 'ahead', 0.35);
    expect(divergenceMaySoftenModel(r)).toBe(false);
    const section = buildEvidenceSection([r]);
    expect(section).toContain('MODEL-SOFTENING PERMISSION: not granted');
    // Receipts may still surface if independently interesting.
    expect(section).toContain('Best 1-minute power');
  });

  it('denies for non-ahead verdicts regardless of confidence', () => {
    expect(divergenceMaySoftenModel(row('2026-03-09', 'behind', 0.9))).toBe(false);
    expect(divergenceMaySoftenModel(row('2026-04-13', 'consistent', 0.9))).toBe(false);
  });
});

describe('cadence throttle (Phase 2 Decision 1)', () => {
  it('mid-run ahead week is SILENT — no proactive verdict language', () => {
    const rows = [
      row('2025-09-15', 'ahead', 0.75),
      row('2025-09-08', 'ahead', 0.75),
      row('2025-09-01', 'ahead', 0.75),
    ];
    expect(deriveSpeakingCue(rows)).toBe('silent');
    const section = buildEvidenceSection(rows);
    expect(section).toContain('SPEAKING RULE THIS WEEK: silent');
    expect(section).toContain('Do NOT proactively mention');
  });

  it('first week of a new ahead run is a transition — speaks once', () => {
    const rows = [row('2026-07-27', 'ahead', 0.7), row('2026-07-20', 'consistent', 0.75)];
    expect(deriveSpeakingCue(rows)).toBe('transition');
    expect(buildEvidenceSection(rows)).toContain('SPEAKING RULE THIS WEEK: transition');
  });

  it('insufficient_data weeks do not break a run (no false transitions)', () => {
    const rows = [
      row('2026-06-15', 'ahead', 0.95),
      row('2026-06-08', 'insufficient_data', 0),
      row('2026-06-01', 'ahead', 0.75),
    ];
    // Same verdict as last emitted week; confidence jumped 0.2 → milestone,
    // not transition.
    expect(deriveSpeakingCue(rows)).toBe('milestone');
  });

  it('a sustained run gets a monthly update at 4-week marks', () => {
    const run = ['2025-09-29', '2025-09-22', '2025-09-15', '2025-09-08'].map((w) => row(w, 'ahead', 0.75));
    expect(deriveSpeakingCue(run)).toBe('monthly_update');
  });

  it('insufficient_data latest week is always silent', () => {
    expect(deriveSpeakingCue([row('2026-05-18', 'insufficient_data', 0)])).toBe('silent');
  });
});

describe('section content', () => {
  it('returns empty string with no rows (section simply absent)', () => {
    expect(buildEvidenceSection([])).toBe('');
    expect(buildEvidenceSection(null)).toBe('');
  });

  it('always carries the §8 hard guards verbatim anchors', () => {
    const section = buildEvidenceSection([row('2026-07-27', 'ahead', 0.7)]);
    expect(section).toContain('NEVER override fatigue language when Form Score is at or below -30');
    expect(section).toContain('NEVER scold or alarm on a "behind" verdict');
    expect(section).toContain('react only to 3+ consecutive behind weeks');
    expect(section).toContain('NEVER prescribes extra load');
    expect(section).toContain('No metric jargon');
  });

  it('flags divergence explicitly when evidence disagrees with the model', () => {
    const section = buildEvidenceSection([row('2026-07-27', 'ahead', 0.7)]);
    expect(section).toContain('the evidence DISAGREES with this narrative');
  });
});
