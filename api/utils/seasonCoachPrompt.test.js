import { describe, it, expect } from 'vitest';
import {
  PayloadError,
  buildSeasonCoachSystemPrompt,
  renderPayload,
  sanitizePayload,
} from './seasonCoachPrompt.js';
import { VOCABULARY_RULES } from './coachVoiceRules.js';
import { PERSONA_DATA } from './personaData.js';

const RACE = {
  name: 'BWR San Diego',
  role: 'Goal',
  date: 'Sun, May 2, 2027',
  sport: 'bike',
  effort: 'long',
  verdict: 'On track',
  reason: 'A full build.',
  buildWeeks: 6,
  blockNote: 'Shares one build with Boulder Roubaix; the build aims at BWR San Diego.',
};
const raw = (over = {}) => ({
  today: 'Sun, Oct 11, 2026',
  season: { from: 'Mon, Aug 17, 2026', to: 'Sun, Oct 10, 2027', typicalHours: 8 },
  races: [RACE],
  firstLook: false,
  changes: [{ kind: 'moved', text: 'BWR San Diego moved 1 week later.' }],
  question: null,
  ...over,
});

describe('sanitizePayload', () => {
  it('rejects a missing payload or races list', () => {
    expect(() => sanitizePayload(null)).toThrow(PayloadError);
    expect(() => sanitizePayload({})).toThrow(PayloadError);
  });

  it('rejects too many races', () => {
    expect(() => sanitizePayload(raw({ races: Array.from({ length: 61 }, () => RACE) }))).toThrow(/Too many races/);
  });

  it('clips text, flattens changes to sentences and drops unknown fields', () => {
    const p = sanitizePayload(raw({ question: 'q'.repeat(900), extra: 'ignored', races: [{ ...RACE, name: 'x'.repeat(300) }] }));
    expect(p.question).toHaveLength(500);
    expect(p.races[0].name).toHaveLength(120);
    expect(p.changes).toEqual(['BWR San Diego moved 1 week later.']);
    expect(p).not.toHaveProperty('extra');
  });

  it('treats non-numbers as missing', () => {
    const p = sanitizePayload(raw({ races: [{ ...RACE, buildWeeks: '6' }], season: { typicalHours: 'lots' } }));
    expect(p.races[0].buildWeeks).toBeNull();
    expect(p.season.typicalHours).toBeNull();
  });
});

describe('renderPayload', () => {
  it('lists every race with its date, verdict and block note', () => {
    const text = renderPayload(sanitizePayload(raw()));
    expect(text).toContain('Today is Sun, Oct 11, 2026.');
    expect(text).toContain('BWR San Diego — Sun, May 2, 2027 — Goal race, bike, long effort — On track, build 6 weeks. A full build.');
    expect(text).toContain('Shares one build with Boulder Roubaix');
    expect(text).toContain('- BWR San Diego moved 1 week later.');
    expect(text).toContain('wants your read');
  });

  it('says when this is the first conversation, or when nothing changed', () => {
    expect(renderPayload(sanitizePayload(raw({ firstLook: true })))).toContain('first time');
    expect(renderPayload(sanitizePayload(raw({ changes: [] })))).toContain('Nothing has changed');
  });

  it('carries no ISO dates (the coach never sees a date it would have to convert)', () => {
    expect(renderPayload(sanitizePayload(raw()))).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('buildSeasonCoachSystemPrompt', () => {
  it('includes the rules and the vocabulary rules', () => {
    const { system, personaName } = buildSeasonCoachSystemPrompt();
    expect(personaName).toBeNull();
    expect(system).toContain('SEASON PLANNER RULES');
    expect(system).toContain('Never compute, infer or convert a date');
    expect(system).toContain('2 to 4 sentences');
    expect(system).toContain(VOCABULARY_RULES.split('\n')[0]);
  });

  it('adds the persona and the rider name', () => {
    const { system, personaName } = buildSeasonCoachSystemPrompt({ personaId: 'pragmatist', riderName: 'Travis' });
    expect(personaName).toBe(PERSONA_DATA.pragmatist.name);
    expect(system).toContain(`COACHING PERSONA: ${PERSONA_DATA.pragmatist.name.toUpperCase()}`);
    expect(system).toContain("The athlete's preferred name is: Travis");
  });

  it('ignores an unknown persona', () => {
    expect(buildSeasonCoachSystemPrompt({ personaId: 'nope' }).personaName).toBeNull();
  });
});
