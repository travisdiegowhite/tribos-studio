import { describe, it, expect } from 'vitest';
import { firstToShow } from '../firstToShow';

const alt = (kind: string, level: number) => ({ kind, level }) as never;
const plan = (over: object) => ({ outcome: 'alternatives', level: 2, route: null, alternatives: [], refusal: null, calls: 0, budget: 12, tried: [], ...over }) as never;

describe('firstToShow', () => {
  it('draws the ok route', () => {
    const route = alt('primary', 2);
    expect(firstToShow(plan({ outcome: 'ok', route }))).toBe(route);
  });

  it('draws a same-level shape or distance alternative at once', () => {
    const shape = alt('shape', 2);
    expect(firstToShow(plan({ alternatives: [alt('comfort_up', 3), shape] }))).toBe(shape);
  });

  it('does not draw a comfort-up alternative unasked', () => {
    expect(firstToShow(plan({ alternatives: [alt('comfort_up', 3)] }))).toBeNull();
  });

  it('draws nothing on a refusal', () => {
    expect(firstToShow(plan({ outcome: 'refused' }))).toBeNull();
  });
});
