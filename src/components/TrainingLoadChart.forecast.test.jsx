import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import TrainingLoadChart from './TrainingLoadChart';
import { forecastFitness } from '../lib/training/session/forecast';

const history = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 23 + i));
  return { date: d.toISOString().slice(0, 10), tss: 50, ctl: 40, atl: 45, tsb: -5 };
});

function renderChart(props) {
  return render(
    <MantineProvider>
      <TrainingLoadChart data={history} {...props} />
    </MantineProvider>,
  );
}

describe('TrainingLoadChart forecast', () => {
  it('labels the projection when the plan gives one', () => {
    const forecast = forecastFitness({
      from: { date: history[history.length - 1].date, ctl: 40, atl: 45 },
      planned: [{ scheduled_date: '2026-11-24', target_rss: 80 }],
      days: 14,
    });
    renderChart({ forecast });
    expect(screen.getByTestId('forecast-legend').textContent).toMatch(/Projected/);
  });

  it('shows no projection without a forecast', () => {
    renderChart({});
    expect(screen.queryByTestId('forecast-legend')).toBeNull();
  });
});
