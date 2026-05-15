import { describe, expect, it } from 'vitest';
import {
  MAGNITUDE_TO_FRACTION,
  fractionForMagnitude,
} from '../../shared/magnitudes';

describe('magnitudes', () => {
  it('maps small/moderate/large to 15/30/50%', () => {
    expect(MAGNITUDE_TO_FRACTION.small).toBe(0.15);
    expect(MAGNITUDE_TO_FRACTION.moderate).toBe(0.3);
    expect(MAGNITUDE_TO_FRACTION.large).toBe(0.5);
  });

  it('fractionForMagnitude returns the table value', () => {
    expect(fractionForMagnitude('small')).toBe(0.15);
    expect(fractionForMagnitude('moderate')).toBe(0.3);
    expect(fractionForMagnitude('large')).toBe(0.5);
  });
});
