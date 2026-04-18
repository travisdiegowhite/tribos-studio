import { assembleHeroParagraph } from './heroAssembler.js';

function baseContext(overrides = {}) {
  return {
    archetype: 'pragmatist',
    experienceLevel: 'intermediate',
    date: '2026-04-18',
    rider: { firstName: 'Alex' },
    metrics: { tfi: 60, afi: 55, formScore: 5, ctlDeltaPct: 3 },
    plan: { blockName: 'Build', blockPurpose: 'Work', currentWeek: 3, totalWeeks: 8 },
    week: { plannedCount: 5, completedCount: 2, daysIntoWeek: 2, posture: 'on_track' },
    lastRide: {
      id: 'ride-1',
      type: 'Ride',
      rss: 70,
      durationSeconds: 3600,
      distanceMeters: 32000,
      startDateTzDate: '2026-04-17',
    },
    lastRidePlannedMatch: { id: 'p', name: 'Tempo', target_tss: 70, workout_type: 'tempo' },
    nextWorkout: {
      id: 'w-1',
      name: 'Sweet Spot 3x12',
      scheduledDate: '2026-04-19',
      workoutType: 'sweet_spot',
      targetRss: 80,
    },
    raceAnchor: null,
    classification: {
      openerState: 'holding',
      formState: 'neutral',
      intensityVsExpected: 'near',
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
      opener: 'Here is where things sit',
      rideDescriptor: 'solid tempo',
      intensityModifier: 'steady',
      blockInterpretation: 'the block is building quiet strength',
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
  it('emits segments in the canonical order: opener → ride → block → week → anchor', () => {
    const { segments } = assembleHeroParagraph(baseContext(), baseVoice());
    expect(segments.map((s) => s.type)).toEqual(['opener', 'ride', 'block', 'week', 'anchor']);
  });

  it('skips the ride segment when there is no last ride', () => {
    const { segments } = assembleHeroParagraph(
      baseContext({ lastRide: null, lastRidePlannedMatch: null }),
      baseVoice({ fields: { ...baseVoice().fields, rideDescriptor: '' } }),
    );
    expect(segments.map((s) => s.type)).toEqual(['opener', 'block', 'week', 'anchor']);
  });

  it('emits cold-start CTA segments for brand-new riders', () => {
    const { segments, coldStart } = assembleHeroParagraph(
      baseContext({
        plan: null,
        lastRide: null,
        coldStart: { active: true, hasActivePlan: false, hasRecentActivity: false },
      }),
      baseVoice({ coldStart: true, fields: { ...baseVoice().fields, rideDescriptor: '' } }),
    );
    expect(coldStart).toBe(true);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0].type).toBe('opener');
    expect(segments.some((s) => s.type === 'cta')).toBe(true);
  });

  it('tags ride tone as caution when intensity was above target', () => {
    const { segments } = assembleHeroParagraph(
      baseContext({
        classification: {
          openerState: 'holding',
          formState: 'neutral',
          intensityVsExpected: 'above',
          weekPosture: 'on_track',
          daysSinceLastRide: 1,
        },
      }),
      baseVoice(),
    );
    const ride = segments.find((s) => s.type === 'ride');
    expect(ride.tone).toBe('caution');
  });

  it('tags week tone as warning when rider is behind plan', () => {
    const { segments } = assembleHeroParagraph(
      baseContext({ week: { plannedCount: 5, completedCount: 1, daysIntoWeek: 5, posture: 'behind' } }),
      baseVoice(),
    );
    const week = segments.find((s) => s.type === 'week');
    expect(week.tone).toBe('warning');
  });

  it('converts remaining-count digits to words in the week sentence', () => {
    const { segments } = assembleHeroParagraph(
      baseContext({ week: { plannedCount: 5, completedCount: 2, daysIntoWeek: 2, posture: 'on_track' } }),
      baseVoice(),
    );
    const week = segments.find((s) => s.type === 'week');
    expect(week.text).not.toMatch(/\d/);
    expect(week.text.toLowerCase()).toContain('three');
  });

  it('prefers race anchor when one is within the cutoff window', () => {
    const { segments } = assembleHeroParagraph(
      baseContext({
        raceAnchor: { name: 'Gravel Epic', race_type: 'gravel', race_date: '2026-05-10', priority: 1, days_until: 22 },
      }),
      baseVoice(),
    );
    const anchor = segments.find((s) => s.type === 'anchor');
    expect(anchor.text.toLowerCase()).toContain('gravel');
    expect(anchor.tone).toBe('positive');
  });
});
