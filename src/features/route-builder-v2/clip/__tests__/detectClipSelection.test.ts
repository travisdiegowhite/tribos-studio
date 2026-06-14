import { describe, it, expect } from 'vitest';
import { detectClipSelection } from '../detectClipSelection';
import type { Coordinate } from '../../../../types/geo';

/** East main line with a ~550m north-and-back spur, then continue east. */
function routeWithSpur(): Coordinate[] {
  const main1: Coordinate[] = Array.from({ length: 8 }, (_, i) => [-105 + i * 0.001, 40]);
  const px = main1[main1.length - 1][0];
  const out: Coordinate[] = Array.from({ length: 5 }, (_, i) => [px, 40 + (i + 1) * 0.001]);
  const back: Coordinate[] = Array.from({ length: 5 }, (_, i) => [px, 40 + (5 - i - 1) * 0.001]);
  const main2: Coordinate[] = Array.from({ length: 8 }, (_, i) => [px + (i + 1) * 0.001, 40]);
  return [...main1, ...out, ...back, ...main2];
}

const SPUR = routeWithSpur();
const APEX: Coordinate = [SPUR[7][0], 40.005]; // top of the jut

describe('detectClipSelection', () => {
  it('returns a selection when clicking on a spur', () => {
    const sel = detectClipSelection(SPUR, APEX);
    expect(sel).not.toBeNull();
    expect(sel!.endIndex).toBeGreaterThan(sel!.startIndex);
    expect(sel!.highlightGeoJSON.type).toBe('Feature');
    expect(sel!.stats.distanceSaved).toBeGreaterThan(0);
  });

  it('returns null when the click misses the line', () => {
    const sel = detectClipSelection(SPUR, [-106, 41]); // ~100km away
    expect(sel).toBeNull();
  });

  it('returns null on a straight (non-tangent) line', () => {
    const straight: Coordinate[] = Array.from(
      { length: 20 },
      (_, i) => [-105 + i * 0.0012, 40] as Coordinate,
    );
    const sel = detectClipSelection(straight, [-105 + 10 * 0.0012, 40]);
    expect(sel).toBeNull();
  });

  it('returns null for too-short geometry', () => {
    expect(detectClipSelection([[-105, 40], [-104.999, 40]], [-105, 40])).toBeNull();
  });
});
