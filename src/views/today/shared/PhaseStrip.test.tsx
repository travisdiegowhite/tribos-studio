import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PhaseStrip } from './PhaseStrip';
import type { PlanPhase } from '../../../types/training';

const PHASES: PlanPhase[] = [
  { phase: 'base', focus: 'aerobic', weeks: [1, 2, 3, 4] },
  { phase: 'build', focus: 'threshold', weeks: [5, 6, 7, 8] },
  { phase: 'peak', focus: 'race', weeks: [9, 10] },
];

describe('PhaseStrip', () => {
  it('renders an empty bar shell when phases are missing', () => {
    const { queryAllByTestId } = render(
      <PhaseStrip phases={[]} totalWeeks={0} currentWeek={0} />
    );
    expect(queryAllByTestId('phase-segment')).toHaveLength(0);
    expect(queryAllByTestId('phase-marker')).toHaveLength(0);
  });

  it('renders one segment per phase plus the marker', () => {
    const { queryAllByTestId, getByTestId } = render(
      <PhaseStrip phases={PHASES} totalWeeks={10} currentWeek={1} />
    );
    expect(queryAllByTestId('phase-segment')).toHaveLength(3);
    expect(getByTestId('phase-marker')).toBeTruthy();
  });

  it('places the marker proportionally across the plan', () => {
    const { getByTestId } = render(
      <PhaseStrip phases={PHASES} totalWeeks={10} currentWeek={5} />
    );
    const marker = getByTestId('phase-marker') as HTMLDivElement;
    // Week 5 of 10 -> ((5 - 0.5) / 10) * 100 = 45%.
    expect(marker.style.left).toContain('45');
  });

  it('clamps the marker to 0% when currentWeek is below the first week', () => {
    const { getByTestId } = render(
      <PhaseStrip phases={PHASES} totalWeeks={10} currentWeek={0} />
    );
    const marker = getByTestId('phase-marker') as HTMLDivElement;
    expect(marker.style.left).toContain('0%');
  });
});
