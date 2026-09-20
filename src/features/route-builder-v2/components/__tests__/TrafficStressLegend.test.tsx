import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { TrafficStressLegend } from '../TrafficStressLegend';

const summary = {
  totalKm: 10,
  knownKm: 9,
  kmByLts: { 0: 1, 1: 4, 2: 2.5, 3: 1.5, 4: 1 },
  quietPct: 72,
  unknownPct: 10,
  stressScore: 0.3,
  lts4Km: 1,
  maxContinuousLts4Km: 0.6,
};

describe('TrafficStressLegend', () => {
  it('renders the four bands without a summary', () => {
    render(
      <MantineProvider>
        <TrafficStressLegend />
      </MantineProvider>,
    );
    const legend = screen.getByTestId('rb2-stress-legend');
    expect(legend).toHaveTextContent('Calm');
    expect(legend).toHaveTextContent('High stress');
    expect(legend).not.toHaveTextContent('km');
  });

  it('shows km per band and the unmapped share with a summary', () => {
    render(
      <MantineProvider>
        <TrafficStressLegend summary={summary} />
      </MantineProvider>,
    );
    const legend = screen.getByTestId('rb2-stress-legend');
    expect(legend).toHaveTextContent('Calm · 4.0 km');
    expect(legend).toHaveTextContent('High stress · 1.0 km');
    expect(legend).toHaveTextContent('10% unmapped');
  });

  it('converts to miles when imperial', () => {
    render(
      <MantineProvider>
        <TrafficStressLegend summary={summary} isImperial />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-stress-legend')).toHaveTextContent('Calm · 2.5 mi');
  });
});
