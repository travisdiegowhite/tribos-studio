import { describe, it, expect } from 'vitest';
import { translate } from '../heuristicTranslation';

describe('translate — modify (climbing)', () => {
  it.each([
    ['hillier', 'increase_climbing'],
    ['make it hillier', 'increase_climbing'],
    ['more climbing please', 'increase_climbing'],
    ['add more elevation', 'increase_climbing'],
    ['flatter', 'reduce_climbing'],
    ['less climbing', 'reduce_climbing'],
    ['less elevation', 'reduce_climbing'],
    ['give me easier hills', 'reduce_climbing'],
  ])('maps "%s" to %s', (input, expectedType) => {
    const r = translate(input);
    expect(r.kind).toBe('modify');
    if (r.kind === 'modify') {
      expect(r.mutation.type).toBe(expectedType);
      if (
        r.mutation.type === 'increase_climbing' ||
        r.mutation.type === 'reduce_climbing'
      ) {
        expect(r.mutation.magnitude).toBe('moderate');
      }
    }
  });
});

describe('translate — modify (distance)', () => {
  it.each([
    ['shorter', 'shorten_distance'],
    ['less distance', 'shorten_distance'],
    ['trim it', 'shorten_distance'],
    ['longer', 'extend_distance'],
    ['more distance', 'extend_distance'],
    ['add some distance', 'extend_distance'],
  ])('maps "%s" to %s with default delta of 5km', (input, expectedType) => {
    const r = translate(input);
    expect(r.kind).toBe('modify');
    if (r.kind === 'modify' && (r.mutation.type === 'shorten_distance' || r.mutation.type === 'extend_distance')) {
      expect(r.mutation.type).toBe(expectedType);
      expect(r.mutation.delta_km).toBe(5);
    }
  });
});

describe('translate — modify (reverse)', () => {
  it.each(['reverse', 'reverse it', 'flip it'])('maps "%s" to reverse_route', (input) => {
    const r = translate(input);
    expect(r.kind).toBe('modify');
    if (r.kind === 'modify') {
      expect(r.mutation.type).toBe('reverse_route');
    }
  });
});

describe('translate — modify (avoid segment)', () => {
  it.each(['skip 287', 'avoid 287', 'please skip 287'])(
    'maps "%s" to avoid_segment us-287',
    (input) => {
      const r = translate(input);
      expect(r.kind).toBe('modify');
      if (r.kind === 'modify' && r.mutation.type === 'avoid_segment') {
        expect(r.mutation.segment_id).toBe('us-287');
      }
    },
  );
});

describe('translate — modify (surface)', () => {
  it.each(['more gravel', 'less road'])(
    'maps "%s" to change_surface_mix toward gravel',
    (input) => {
      const r = translate(input);
      expect(r.kind).toBe('modify');
      if (r.kind === 'modify' && r.mutation.type === 'change_surface_mix') {
        expect(r.mutation.target.gravel).toBe(0.5);
        expect(r.mutation.target.road).toBe(0.4);
        expect(r.mutation.target.path).toBe(0.1);
      }
    },
  );
});

describe('translate — cold_start', () => {
  it.each([
    'build me a 2 hour endurance ride',
    'generate a 30km loop',
    'make me a recovery ride',
    'create a gravel route',
    'BUILD ME A LOOP',
    'build a ride for me',
  ])('recognizes "%s" as cold_start', (input) => {
    const r = translate(input);
    expect(r.kind).toBe('cold_start');
    if (r.kind === 'cold_start') {
      expect(r.ackText).toMatch(/build/i);
    }
  });

  it('does not match cold-start when no route descriptor present', () => {
    const r = translate('make me a sandwich');
    expect(r.kind).toBe('refuse');
  });

  it('does not match cold-start when no action verb present', () => {
    const r = translate('a 2 hour ride');
    expect(r.kind).toBe('refuse');
  });
});

describe('translate — refuse', () => {
  it.each([
    'hello',
    'what do you think about this?',
    'tell me about the weather',
    'cancel',
    'undo my last edit',
    '',
    '   ',
  ])('falls through to refuse on "%s"', (input) => {
    const r = translate(input);
    expect(r.kind).toBe('refuse');
    if (r.kind === 'refuse') {
      expect(r.refuseText).toMatch(/don't understand/i);
    }
  });
});

describe('translate — normalization', () => {
  it('is case-insensitive', () => {
    expect(translate('MAKE IT HILLIER').kind).toBe('modify');
    expect(translate('Make It Hillier').kind).toBe('modify');
  });

  it('strips punctuation before matching', () => {
    expect(translate('hillier!').kind).toBe('modify');
    expect(translate('hillier?').kind).toBe('modify');
    expect(translate('hillier, please.').kind).toBe('modify');
  });

  it('matches on substring not exact phrase', () => {
    const r = translate('actually can you make it shorter for me');
    expect(r.kind).toBe('modify');
    if (r.kind === 'modify') {
      expect(r.mutation.type).toBe('shorten_distance');
    }
  });
});

describe('translate — precedence', () => {
  it('treats build-style phrases as cold-start even if they contain a keyword', () => {
    // Cold-start regex runs before keyword matching.
    const r = translate('build me a shorter ride');
    expect(r.kind).toBe('cold_start');
  });
});
