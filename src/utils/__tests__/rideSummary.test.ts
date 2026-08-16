import { describe, it, expect } from 'vitest';
import { buildRideSummary } from '../rideSummary';

describe('buildRideSummary', () => {
  it('composes duration + intensity + pacing into one sentence', () => {
    expect(
      buildRideSummary({
        durationSec: 7200,
        intensityZoneName: 'Tempo',
        pacingStrategy: 'negative_split',
      }),
    ).toBe('A 2-hour brisk ride — you got stronger as it went.');
  });

  it('handles minutes, half hours, and runs', () => {
    expect(buildRideSummary({ durationSec: 45 * 60, intensityZoneName: 'Endurance' })).toBe(
      'A 45-minute steady ride.',
    );
    expect(buildRideSummary({ durationSec: 90 * 60, isRun: true })).toBe('A 1½-hour run.');
  });

  it('describes a fade without judgment', () => {
    expect(
      buildRideSummary({ durationSec: 3600, intensityZoneName: 'Threshold', pacingStrategy: 'positive_split_heavy' }),
    ).toBe('A 60-minute hard, steady ride — and faded hard late.');
  });

  it('returns null when there is nothing honest to say', () => {
    expect(buildRideSummary({ durationSec: 0 })).toBeNull();
    expect(buildRideSummary({ durationSec: 30 })).toBeNull();
  });

  it('ignores unknown pacing strategies', () => {
    expect(buildRideSummary({ durationSec: 3600, pacingStrategy: 'mystery' })).toBe('A 60-minute ride.');
  });
});
