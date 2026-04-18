import { assembleHeroParagraph, toPlainText, toneForFS, toneForTrend } from './heroAssembler.js';

function baseContext(overrides = {}) {
  return {
    archetype: 'pragmatist',
    experienceLevel: 'intermediate',
    date: '2026-04-18',
    rider: { firstName: 'Alex', hasActivePlan: true },
    fitness: {
      tfi: 60,
      afi: 55,
      fs: 5,
      efi: 80,
      tfiDelta28d: 12,
      tfiDeltaPct28d: 20,
      trend: 'building',
    },
    block: { phase: 'build', weekInPhase: 3, blockName: 'Build', blockPurpose: '' },
    plan: { id: 'plan-1', name: 'Test', currentWeek: 3, totalWeeks: 8 },
    week: { plannedCount: 5, completedCount: 2, daysIntoWeek: 3, posture: 'on_track' },
    lastRide: {
      id: 'ride-1',
      type: 'Ride',
      workoutType: 'tempo',
      daysAgo: 1,
      rss: 70,
      wasPrescribed: true,
      intensityVsExpected: 'as_expected',
    },
    lastRidePlannedMatch: { id: 'p', name: 'Tempo', target_tss: 70, workout_type: 'tempo' },
    nextWorkout: null,
    nextAnchor: { type: 'none', label: '', daysOut: null },
    classification: {
      openerState: 'building',
      formState: 'neutral',
      intensityVsExpected: 'as_expected',
      weekPosture: 'on_track',
      daysSinceLastRide: 1,
    },
    coldStart: { active: false, hasActivePlan: true, hasRecentActivity: true },
    ...overrides,
  };
}

function baseVoice(overrides = {}) {
  return {
    fields: {
      opener: 'Right on pattern',
      rideDescriptor: 'tempo block',
      intensityModifier: '',
      blockInterpretation: 'exactly where the plan wants you',
    },
    fieldsValid: { opener: true, rideDescriptor: true, intensityModifier: true, blockInterpretation: true },
    fallbackCount: 0,
    fullFallback: false,
    coldStart: false,
    source: 'haiku',
    ...overrides,
  };
}

describe('assembleHeroParagraph', () => {
  it('returns a HeroSegment[] of text | highlight kinds', () => {
    const { paragraph } = assembleHeroParagraph(baseContext(), baseVoice());
    expect(Array.isArray(paragraph)).toBe(true);
    for (const seg of paragraph) {
      expect(['text', 'highlight']).toContain(seg.kind);
      expect(typeof seg.value).toBe('string');
      if (seg.kind === 'highlight') expect(typeof seg.tone).toBe('string');
    }
  });

  it('includes a tfiDelta highlight segment with +N points', () => {
    const { paragraph } = assembleHeroParagraph(baseContext(), baseVoice());
    const hi = paragraph.find((s) => s.kind === 'highlight' && /points/.test(s.value));
    expect(hi).toBeTruthy();
    expect(hi.value).toMatch(/\+?\d+ points?/);
    expect(hi.tone).toBe('positive');
  });

  it('renders the FS value as a highlight on the ride sentence', () => {
    const { paragraph } = assembleHeroParagraph(baseContext(), baseVoice());
    const fsSeg = paragraph.find((s) => s.kind === 'highlight' && /^[+-]?\d+$/.test(s.value));
    expect(fsSeg).toBeTruthy();
    expect(fsSeg.value).toBe('+5');
  });

  it('skips the ride slot entirely when there is no last ride', () => {
    const { paragraph } = assembleHeroParagraph(
      baseContext({ lastRide: null, lastRidePlannedMatch: null }),
      baseVoice({ fields: { ...baseVoice().fields, rideDescriptor: '', intensityModifier: '' } }),
    );
    const hasRideMention = paragraph.some((s) => /last ride|pushed form/.test(s.value));
    expect(hasRideMention).toBe(false);
  });

  it('returns a cold-start welcome when context is cold_start', () => {
    const { paragraph, coldStart } = assembleHeroParagraph(
      baseContext({
        coldStart: { active: true, hasActivePlan: false, hasRecentActivity: false },
      }),
      baseVoice(),
    );
    expect(coldStart).toBe(true);
    expect(paragraph[0].kind).toBe('text');
    expect(paragraph[0].value).toMatch(/Welcome/);
    expect(paragraph.some((s) => /training plan/.test(s.value))).toBe(true);
  });

  it('uses the race-anchored forward-action template when race is within cutoff', () => {
    const { paragraph } = assembleHeroParagraph(
      baseContext({
        nextAnchor: { type: 'race', label: 'Gravel Epic', daysOut: 22 },
      }),
      baseVoice(),
    );
    const raceHi = paragraph.find((s) => s.kind === 'highlight' && s.value === 'Gravel Epic');
    expect(raceHi).toBeTruthy();
    expect(raceHi.tone).toBe('neutral');
    const prev = paragraph[paragraph.indexOf(raceHi) - 1];
    expect(prev.value).toMatch(/workouts? left this week into $/);
  });

  it('uses the progression forward-action template otherwise', () => {
    const { paragraph } = assembleHeroParagraph(baseContext(), baseVoice());
    const joined = paragraph.map((s) => s.value).join('');
    expect(joined).toMatch(/Fitness is building/);
    expect(joined).toMatch(/sessions left this week to keep it moving/);
  });

  it('multi-day-ago ride sentence uses the {daysAgo} days back template', () => {
    const { paragraph } = assembleHeroParagraph(
      baseContext({
        lastRide: {
          id: 'r', workoutType: 'tempo', daysAgo: 3, rss: 70,
          wasPrescribed: true, intensityVsExpected: 'as_expected',
        },
        classification: {
          openerState: 'resuming', formState: 'neutral',
          intensityVsExpected: 'as_expected', weekPosture: 'on_track',
          daysSinceLastRide: 3,
        },
      }),
      baseVoice(),
    );
    const joined = paragraph.map((s) => s.value).join('');
    expect(joined).toMatch(/Your last ride 3 days back/);
  });

  it('omits the block interpretation slot when the voice field is empty', () => {
    const { paragraph } = assembleHeroParagraph(
      baseContext(),
      baseVoice({ fields: { ...baseVoice().fields, blockInterpretation: '' } }),
    );
    const joined = paragraph.map((s) => s.value).join('');
    expect(joined).not.toMatch(/exactly where the plan wants you/);
  });
});

describe('toPlainText', () => {
  it('joins segments into a single collapsed string', () => {
    const paragraph = [
      { kind: 'text', value: 'Hello ' },
      { kind: 'highlight', value: 'world', tone: 'positive' },
      { kind: 'text', value: '.' },
    ];
    expect(toPlainText(paragraph)).toBe('Hello world.');
  });

  it('accepts either a paragraph array or a wrapper with segments', () => {
    const wrapped = { segments: [{ kind: 'text', value: 'x' }] };
    expect(toPlainText(wrapped)).toBe('x');
    expect(toPlainText(null)).toBe('');
  });
});

describe('tone helpers', () => {
  it('toneForFS maps by archetype thresholds', () => {
    expect(toneForFS(10, 'pragmatist')).toBe('positive');
    expect(toneForFS(0, 'pragmatist')).toBe('effort');
    expect(toneForFS(-10, 'pragmatist')).toBe('fatigue');
  });

  it('toneForTrend maps sign into positive / fatigue / neutral', () => {
    expect(toneForTrend(10, 'pragmatist')).toBe('positive');
    expect(toneForTrend(-10, 'pragmatist')).toBe('fatigue');
    expect(toneForTrend(0, 'pragmatist')).toBe('neutral');
    expect(toneForTrend(null, 'pragmatist')).toBe('neutral');
  });
});
