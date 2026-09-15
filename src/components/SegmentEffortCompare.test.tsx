import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const hookState: { status: string; comparisons: unknown[]; familiarOnly: unknown[]; summary: unknown } = {
  status: 'ready',
  comparisons: [],
  familiarOnly: [],
  summary: null,
};
vi.mock('../hooks/useSegmentEffortComparison', () => ({
  useSegmentEffortComparison: () => hookState,
}));

import SegmentEffortCompare, { compareRepeatsHref } from './SegmentEffortCompare';

const segment = (id: string, name: string) => ({
  id,
  display_name: name,
  terrain_type: 'rolling',
  distance_meters: 1500,
  avg_gradient: 1.1,
  ride_count: 5,
});

const metric = {
  key: 'duration' as const,
  label: 'Time',
  kind: 'cost' as const,
  current: 600,
  typical: 620,
  deltaPct: -3.2,
  trend: 'down' as const,
};

beforeEach(() => {
  hookState.status = 'ready';
  hookState.comparisons = [
    {
      segment: segment('s1', 'Nelson Rd → 63rd St'),
      metrics: [metric],
      verdict: 'Quicker than usual.',
      historyCount: 4,
      totalTraversalCount: 4,
      isFastest: true,
      isBestEfficiency: false,
      effort: 'similar',
    },
  ];
  hookState.familiarOnly = [{ segment: segment('s2', 'Lee Hill'), totalTraversalCount: 2, lastRiddenAt: null }];
});

describe('SegmentEffortCompare', () => {
  it('offers a compare-repeats link on every segment when given a handler', () => {
    const onCompareRepeats = vi.fn();
    render(
      <MantineProvider>
        <SegmentEffortCompare ride={{ id: 'r1' }} enabled onCompareRepeats={onCompareRepeats} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compare repeats of Nelson Rd → 63rd St' }));
    expect(onCompareRepeats).toHaveBeenCalledWith('s1');
    fireEvent.click(screen.getByRole('button', { name: 'Compare repeats of Lee Hill' }));
    expect(onCompareRepeats).toHaveBeenCalledWith('s2');
  });

  it('shows no links without a handler', () => {
    render(
      <MantineProvider>
        <SegmentEffortCompare ride={{ id: 'r1' }} enabled />
      </MantineProvider>,
    );
    expect(screen.getByText('Nelson Rd → 63rd St')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Compare repeats/ })).toBeNull();
  });

  it('links to the REPEATS tab anchored on the segment', () => {
    expect(compareRepeatsHref('abc/1')).toBe('/train?tab=repeats&segment=abc%2F1');
  });
});
