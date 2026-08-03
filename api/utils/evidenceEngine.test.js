// Regression fixtures for the Performance Evidence Engine, frozen from the
// Phase 1/2 calibration run (docs/EVIDENCE_ENGINE_CALIBRATION.md). Each
// fixture is a real athlete-week with its 240-day input window and the
// verdict the calibrated engine emitted. If a threshold or rule change moves
// any of these verdicts, that change needs a full re-calibration (both
// ground truths + the 23-variant sensitivity sweep), not just a green test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeWeekVerdict, DEFAULT_CONFIG } from './evidenceEngine.js';

const fixtures = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'evidenceEngine.fixtures.json'), 'utf8')
);

function datasetFrom(fx) {
  const dailyTfi = new Map(fx.daily.map((d) => [d.date, d.tfi]));
  // Week-end model snapshot: last available day <= Sunday, as the job does.
  const weekEndMs = Date.parse(`${fx.week}T00:00:00Z`) + 7 * 86400000;
  let weekModel = null;
  for (let back = 1; back <= 14 && !weekModel; back++) {
    const d = new Date(weekEndMs - back * 86400000).toISOString().slice(0, 10);
    const row = fx.daily.find((r) => r.date === d);
    if (row) weekModel = { tfi: Math.round(row.tfi), fs: Math.round(row.fs) };
  }
  const model = new Map(weekModel ? [[fx.week, weekModel]] : []);
  return { rides: fx.rides, segments: fx.segments, model, dailyTfi };
}

describe('evidence engine calibration fixtures', () => {
  for (const fx of fixtures) {
    it(`${fx.week} — ${fx.label}`, () => {
      const v = computeWeekVerdict(datasetFrom(fx), fx.week, DEFAULT_CONFIG, fx.prevVerdict);
      expect(v.verdict).toBe(fx.expected.verdict);
      expect(v.verdictRaw).toBe(fx.expected.verdictRaw);
      expect(v.score).toBe(fx.expected.score);
      expect(v.confidence).toBe(fx.expected.confidence);
      if (fx.expected.disagrees != null) {
        expect(v.model_divergence?.disagrees).toBe(fx.expected.disagrees);
      }
    });
  }

  it('founding week carries athlete-siding receipts', () => {
    const fx = fixtures.find((f) => f.week === '2026-07-27');
    const v = computeWeekVerdict(datasetFrom(fx), fx.week, DEFAULT_CONFIG, fx.prevVerdict);
    const text = v.narrative_facts.join(' | ');
    expect(text).toMatch(/1-minute power .* up 4\.3%/);
    expect(text).toMatch(/lower heart rate/);
    expect(v.model_divergence.modelNarrative).toBe('fatigued');
  });

  it('insufficient_data week emits zero confidence and no score', () => {
    const fx = fixtures.find((f) => f.week === '2024-10-07');
    const v = computeWeekVerdict(datasetFrom(fx), fx.week, DEFAULT_CONFIG, fx.prevVerdict);
    expect(v.verdict).toBe('insufficient_data');
    expect(v.confidence).toBe(0);
    expect(v.score).toBeNull();
  });

  it("ef.metric knob default is 'avg_power' (shipped v1 per Decision 3)", () => {
    expect(DEFAULT_CONFIG.ef.metric).toBe('avg_power');
  });
});
