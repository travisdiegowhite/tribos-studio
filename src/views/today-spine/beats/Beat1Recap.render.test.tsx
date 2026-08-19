import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Beat1Recap } from './Beat1Recap';
import type { Beat1VM } from './types';

/** Google's canonical sample polyline — three real points. */
const POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

function vm(over: Partial<Beat1VM> = {}): Beat1VM {
  return {
    state: 'ridden-today',
    line: 'Solid work today — 1h 30m with 40.0 km.',
    polyline: POLYLINE,
    tier: 'steady',
    rhythm: [
      { date: '2026-06-24', tier: 'easy', isToday: false },
      { date: '2026-06-25', tier: null, isToday: false },
      { date: '2026-06-26', tier: 'hard', isToday: false },
      { date: '2026-06-27', tier: null, isToday: false },
      { date: '2026-06-28', tier: 'steady', isToday: false },
      { date: '2026-06-29', tier: null, isToday: false },
      { date: '2026-06-30', tier: 'brisk', isToday: true },
    ],
    ...over,
  };
}

function renderBeat(v: Beat1VM) {
  return render(
    <MantineProvider>
      <Beat1Recap vm={v} />
    </MantineProvider>,
  );
}

describe('Beat1Recap', () => {
  it('leads with the sentence and cites it with the ride trace', () => {
    renderBeat(vm());
    expect(screen.getByText('Solid work today — 1h 30m with 40.0 km.')).toBeTruthy();
    expect(screen.getByTestId('route-trace')).toBeTruthy();
  });

  it('draws the rhythm strip with one cell per day', () => {
    renderBeat(vm());
    const strip = screen.getByTestId('rhythm-strip');
    expect(strip.querySelectorAll('[data-testid^="rhythm-"]')).toHaveLength(7);
    expect(strip.querySelectorAll('[data-testid="rhythm-rest"]')).toHaveLength(3);
  });

  it('omits the trace entirely rather than framing an empty box', () => {
    renderBeat(vm({ polyline: null, state: 'no-history', line: 'Once you have a couple of rides in…' }));
    expect(screen.queryByTestId('route-trace')).toBeNull();
    expect(screen.getByText(/couple of rides/)).toBeTruthy();
  });

  it('omits the trace when the geometry is too short to be a shape', () => {
    renderBeat(vm({ polyline: '_p~iF~ps|U' })); // one point
    expect(screen.queryByTestId('route-trace')).toBeNull();
  });
});
