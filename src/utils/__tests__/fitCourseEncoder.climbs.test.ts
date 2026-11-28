import { describe, it, expect } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { encodeFitCourse } from '../fitCourseEncoder';

function decode(data: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(data));
  const { messages, errors } = decoder.read();
  return { messages: messages as Record<string, Array<Record<string, unknown>>>, errors };
}

/** ~100 m steps north: flat km, a 4 km 6% climb, flat km. */
function climbingCoords(): [number, number, number][] {
  const coords: [number, number, number][] = [];
  let ele = 1600;
  for (let i = 0; i <= 60; i++) {
    const km = i / 10;
    if (km > 1 && km <= 5) ele += 6;
    coords.push([-105, 40 + i * 0.0008993, ele]);
  }
  return coords;
}

describe('FIT course climbs', () => {
  it('writes a category course point at each climb start, in route order', () => {
    const coords = climbingCoords();
    const { messages, errors } = decode(
      encodeFitCourse({
        name: 'Climb test',
        coordinates: coords,
        cues: [
          {
            type: 15,
            direction: 'left',
            instruction: 'Turn left',
            streetNames: ['Late St'],
            distance_km: 5.5,
            coordinate: [coords[55][0], coords[55][1]],
          },
        ],
      }),
    );
    expect(errors).toEqual([]);
    const points = messages.coursePointMesgs ?? [];
    const types = points.map((p) => p.type);
    expect(types).toContain('thirdCategory');
    // The climb (km 1) comes before the turn (km 5.5).
    expect(types.indexOf('thirdCategory')).toBeLessThan(types.indexOf('left'));
  });
});
