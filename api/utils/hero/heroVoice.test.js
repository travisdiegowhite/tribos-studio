import { validateField, generateHeroVoice } from './heroVoice.js';

describe('validateField', () => {
  const denylist = ['Alice', 'Strava', 'Tribos'];

  it('accepts an opener within the word-count band', () => {
    const result = validateField('opener', 'Time to put in the work', denylist);
    expect(result.ok).toBe(true);
    expect(result.value).toBe('Time to put in the work');
  });

  it('rejects opener that is too short', () => {
    expect(validateField('opener', 'Go', denylist)).toMatchObject({ ok: false, reason: 'too_short' });
  });

  it('rejects opener that is too long', () => {
    const tooLong = 'one two three four five six seven eight nine';
    expect(validateField('opener', tooLong, denylist)).toMatchObject({ ok: false, reason: 'too_long' });
  });

  it('rejects digits in blockInterpretation', () => {
    expect(validateField('blockInterpretation', 'you are in week 4 of base', denylist))
      .toMatchObject({ ok: false, reason: 'contains_digit' });
  });

  it('rejects em-dash / semicolon / quote punctuation', () => {
    expect(validateField('opener', 'A good call — time to work', denylist))
      .toMatchObject({ ok: false, reason: 'forbidden_punct' });
    expect(validateField('opener', 'Call it; it is fine', denylist))
      .toMatchObject({ ok: false, reason: 'forbidden_punct' });
    expect(validateField('opener', 'Ride "hard" today', denylist))
      .toMatchObject({ ok: false, reason: 'forbidden_punct' });
  });

  it('rejects proper nouns from the denylist', () => {
    expect(validateField('opener', 'Nice ride on Strava today', denylist))
      .toMatchObject({ ok: false, reason: 'proper_noun' });
    expect(validateField('opener', 'Alice, time to work', denylist))
      .toMatchObject({ ok: false, reason: 'proper_noun' });
  });

  it('accepts empty rideDescriptor (min 0)', () => {
    expect(validateField('rideDescriptor', '', denylist)).toEqual({ ok: true, value: '' });
  });

  it('rejects empty opener (min 2)', () => {
    expect(validateField('opener', '', denylist)).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('generateHeroVoice', () => {
  function baseContext(overrides = {}) {
    return {
      archetype: 'pragmatist',
      experienceLevel: 'intermediate',
      date: '2026-04-18',
      rider: { firstName: 'Alex', hasActivePlan: true },
      fitness: { tfi: 60, afi: 55, fs: 5, efi: 80, tfiDelta28d: 8, tfiDeltaPct28d: 12, trend: 'building' },
      block: { phase: 'build', weekInPhase: 3 },
      plan: { id: 'p', name: 'Test', currentWeek: 3, totalWeeks: 8 },
      week: { plannedCount: 5, completedCount: 2, daysIntoWeek: 2, posture: 'on_track' },
      lastRide: {
        id: 'abc',
        rss: 70,
        workoutType: 'tempo',
        wasPrescribed: true,
        intensityVsExpected: 'as_expected',
        daysAgo: 1,
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

  function mockAnthropic(textOverride) {
    return {
      messages: {
        create: async () => ({
          content: [{ text: textOverride }],
        }),
      },
    };
  }

  it('returns cold-start fallback without calling Haiku', async () => {
    const ctx = baseContext({
      coldStart: { active: true, hasActivePlan: false, hasRecentActivity: false },
    });
    const result = await generateHeroVoice(ctx, { anthropic: mockAnthropic('{}') });
    expect(result.coldStart).toBe(true);
    expect(result.fullFallback).toBe(true);
    expect(result.fields.opener).toBeTruthy();
  });

  it('keeps valid Haiku fields', async () => {
    const good = JSON.stringify({
      opener: 'Here is where things sit',
      rideDescriptor: 'solid tempo',
      intensityModifier: 'steady',
      blockInterpretation: 'the block is building quiet strength',
    });
    const result = await generateHeroVoice(baseContext(), { anthropic: mockAnthropic(good) });
    expect(result.source).toBe('haiku');
    expect(result.fullFallback).toBe(false);
    expect(result.fieldsValid.opener).toBe(true);
  });

  it('swaps invalid fields with fallbacks', async () => {
    const mixed = JSON.stringify({
      opener: 'Here is where things sit',
      rideDescriptor: 'solid tempo',
      intensityModifier: 'week 4 of build', // contains digit
      blockInterpretation: 'the block is building quiet strength',
    });
    const result = await generateHeroVoice(baseContext(), { anthropic: mockAnthropic(mixed) });
    expect(result.fieldsValid.intensityModifier).toBe(false);
    expect(result.fallbackCount).toBe(1);
    expect(result.fullFallback).toBe(false);
  });

  it('falls back entirely when ≥3 fields fail', async () => {
    const bad = JSON.stringify({
      opener: 'A', // too short
      rideDescriptor: 'ride 5 today', // digit
      intensityModifier: 'week 4', // digit
      blockInterpretation: 'too short', // < 3 words
    });
    const result = await generateHeroVoice(baseContext(), { anthropic: mockAnthropic(bad) });
    expect(result.fullFallback).toBe(true);
    expect(result.source).toBe('majority_failure_fallback');
  });

  it('falls back when Haiku returns unparseable output', async () => {
    const result = await generateHeroVoice(baseContext(), {
      anthropic: mockAnthropic('this is not json at all'),
    });
    expect(result.fullFallback).toBe(true);
    expect(result.source).toBe('parse_failure_fallback');
  });
});
