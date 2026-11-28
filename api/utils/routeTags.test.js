import { describe, it, expect } from 'vitest';
import { normalizeRouteTags, MAX_TAGS, MAX_TAG_LENGTH } from './routeTags.js';

describe('normalizeRouteTags', () => {
  it('trims, collapses spaces and de-duplicates case-insensitively (first spelling wins)', () => {
    expect(normalizeRouteTags(['  Gravel  loops ', 'gravel LOOPS', 'Commute', '', '   '])).toEqual([
      'Gravel loops',
      'Commute',
    ]);
  });

  it('drops non-strings and anything that is not an array', () => {
    expect(normalizeRouteTags(['ok', 3, null, { a: 1 }])).toEqual(['ok']);
    expect(normalizeRouteTags('ok')).toEqual([]);
    expect(normalizeRouteTags(null)).toEqual([]);
  });

  it('caps tag length and count', () => {
    const long = 'x'.repeat(50);
    expect(normalizeRouteTags([long])[0]).toHaveLength(MAX_TAG_LENGTH);
    const many = Array.from({ length: 15 }, (_, i) => `tag ${i}`);
    expect(normalizeRouteTags(many)).toHaveLength(MAX_TAGS);
  });
});
