import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { SurfaceSummaryBar, type SurfaceSummaryBarProps } from '../SurfaceSummaryBar';

function renderBar(props: SurfaceSummaryBarProps) {
  return render(
    <MantineProvider>
      <SurfaceSummaryBar {...props} />
    </MantineProvider>,
  );
}

const result = {
  segments: ['paved', 'gravel', 'unpaved', 'unknown'] as Array<'paved' | 'gravel' | 'unpaved' | 'unknown'>,
  inferences: [],
  summary: {
    totalKm: 10,
    knownKm: 9,
    kmByCategory: { paved: 5, gravel: 3, unpaved: 1, unknown: 1 },
    distribution: { paved: 50, gravel: 30, unpaved: 10 },
    gravelPct: 40,
    taggedPct: 70,
    inferredPct: 20,
    unknownPct: 10,
    evidenceKm: {
      paved: { 'surface=asphalt': 5 },
      gravel: { 'surface=gravel': 2.1, 'tracktype=grade2': 0.9 },
      unpaved: { 'highway=track': 1 },
      unknown: {},
    },
  },
  source: 'brouter_trace' as const,
};

describe('SurfaceSummaryBar', () => {
  it('renders nothing when segments are null', () => {
    renderBar({ segments: null });
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders nothing when segments are empty', () => {
    renderBar({ segments: [] });
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders nothing when every segment is unknown', () => {
    renderBar({ segments: ['unknown', 'unknown'] });
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders distribution percentages for known surfaces (legacy segments)', () => {
    // 6 paved + 4 gravel = 60% / 40%.
    const segments = [...Array(6).fill('paved'), ...Array(4).fill('gravel')];
    renderBar({ segments });
    const bar = screen.getByTestId('rb2-surface-summary');
    expect(bar).toHaveTextContent('60% Paved');
    expect(bar).toHaveTextContent('40% Gravel');
    expect(screen.queryByTestId('rb2-surface-provenance')).toBeNull();
  });

  it('with a full result: shares from the summary, a provenance line and evidence tooltips', () => {
    renderBar({ result });
    const bar = screen.getByTestId('rb2-surface-summary');
    expect(bar).toHaveTextContent('50% Paved');
    expect(bar).toHaveTextContent('30% Gravel');
    expect(bar).toHaveTextContent('10% Unpaved');
    expect(screen.getByTestId('rb2-surface-provenance')).toHaveTextContent('tagged 70% · inferred 20% · unmapped 10%');
    expect(screen.getByTestId('rb2-surface-legend-gravel').getAttribute('title')).toBe(
      'surface=gravel 2.1 km · tracktype=grade2 0.9 km',
    );
    expect(screen.getByTestId('rb2-surface-legend-unpaved').getAttribute('title')).toBe('highway=track 1.0 km');
  });

  it('says so when surface data is unavailable', () => {
    renderBar({ result: null, status: 'unavailable' });
    expect(screen.getByTestId('rb2-surface-summary')).toHaveTextContent('surface data unavailable');
  });

  it('stays hidden while loading', () => {
    renderBar({ result: null, status: 'loading' });
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });
});
