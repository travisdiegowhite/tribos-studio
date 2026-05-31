import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { SurfaceSummaryBar } from '../SurfaceSummaryBar';

function renderBar(segments: string[] | null) {
  return render(
    <MantineProvider>
      <SurfaceSummaryBar segments={segments} />
    </MantineProvider>,
  );
}

describe('SurfaceSummaryBar', () => {
  it('renders nothing when segments are null', () => {
    renderBar(null);
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders nothing when segments are empty', () => {
    renderBar([]);
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders nothing when every segment is unknown', () => {
    renderBar(['unknown', 'unknown']);
    expect(screen.queryByTestId('rb2-surface-summary')).toBeNull();
  });

  it('renders distribution percentages for known surfaces', () => {
    // 6 paved + 4 gravel = 60% / 40%.
    const segments = [
      ...Array(6).fill('paved'),
      ...Array(4).fill('gravel'),
    ];
    renderBar(segments);
    const bar = screen.getByTestId('rb2-surface-summary');
    expect(bar).toHaveTextContent('60% Paved');
    expect(bar).toHaveTextContent('40% Gravel');
  });
});
