/**
 * Regression guard for the shared coach voice contract: the rule blocks say
 * what they must say, and every LLM endpoint stays wired to them. If an
 * endpoint drops the import, this test fails before a rider ever sees
 * un-governed coach copy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VOCABULARY_RULES,
  TRANSLATION_RULES,
  DATA_CORRECTION_NOTICE,
  buildCoachVoiceRules,
} from './coachVoiceRules.js';

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const WIRED_ENDPOINTS = [
  'coach.js',
  'fitness-summary.js',
  'coach-check-in-generate.js',
  'coach-ride-analysis.js',
  'proactive-insights-process.js',
  'accountability-coach.js',
  'review-week.js',
];

describe('coachVoiceRules blocks', () => {
  it('bans the Peaksware vocabulary by name', () => {
    expect(VOCABULARY_RULES).toContain('TSS, CTL,');
    expect(VOCABULARY_RULES).toContain('NEVER emit');
    expect(VOCABULARY_RULES).toContain('RSS (ride stress score)');
  });

  it('requires translation before numbers', () => {
    expect(TRANSLATION_RULES).toContain('Never open with raw numbers');
    expect(TRANSLATION_RULES).toContain('Plain English first');
  });

  it('includes the correction notice by default and omits it on request', () => {
    expect(buildCoachVoiceRules()).toContain('DATA CORRECTION NOTICE (2026-08-02)');
    expect(buildCoachVoiceRules({ correctionNotice: false })).not.toContain('DATA CORRECTION NOTICE');
    expect(DATA_CORRECTION_NOTICE).toContain('2026-08-02');
  });
});

describe('every LLM endpoint imports the shared voice rules', () => {
  for (const file of WIRED_ENDPOINTS) {
    it(`${file} imports coachVoiceRules`, () => {
      const src = readFileSync(join(API_DIR, file), 'utf8');
      expect(src).toMatch(/from '\.\/utils\/coachVoiceRules\.js'/);
    });
  }
});
