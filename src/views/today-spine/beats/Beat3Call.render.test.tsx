import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Beat3Call } from './Beat3Call';
import type { Beat3VM } from './types';

function vm(over: Partial<Beat3VM> = {}): Beat3VM {
  return {
    dayType: 'planned-hard',
    line: "Today's a good day for hard, steady effort — you're carrying productive load.",
    session: { type: 'threshold', durationMin: 75, intensity: 0.82 },
    downgraded: false,
    ...over,
  };
}

function renderBeat(v: Beat3VM) {
  return render(
    <MantineProvider>
      <Beat3Call vm={v} personaName="The Pragmatist" />
    </MantineProvider>,
  );
}

describe('Beat3Call', () => {
  it('renders the call, its silhouette, and whose call it is', () => {
    renderBeat(vm());
    expect(screen.getByText(/hard, steady effort/)).toBeTruthy();
    expect(screen.getByTestId('workout-silhouette')).toBeTruthy();
    expect(screen.getByText('The Pragmatist')).toBeTruthy();
  });

  it('draws nothing where there is no session to draw', () => {
    renderBeat(vm({ dayType: 'rest', line: 'Nothing to do today but recover.', session: null }));
    expect(screen.queryByTestId('workout-silhouette')).toBeNull();
  });

  it('redraws the silhouette when a flat day trades the session down', () => {
    const hard = renderBeat(vm());
    const before = screen.getByTestId('workout-silhouette').innerHTML;
    hard.unmount();

    renderBeat(
      vm({
        line: "You said the legs are flat, so let's trade…",
        session: { type: 'endurance', durationMin: 75, intensity: 0.42 },
        downgraded: true,
      }),
    );
    expect(screen.getByTestId('workout-silhouette').innerHTML).not.toBe(before);
  });
});
