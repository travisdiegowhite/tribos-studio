import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 180 }),
  };
});

// Heavy children with their own data loading are out of scope here.
vi.mock('../AerobicDecoupling.jsx', () => ({ default: () => <div data-testid="decoupling" /> }));
vi.mock('../HealthTrendsChart.jsx', () => ({ default: () => null }));
vi.mock('../HistoricalInsights.jsx', () => ({ default: () => null }));
vi.mock('../TrainingLoadChart.jsx', () => ({ default: () => null }));
vi.mock('../RampRateAlert.jsx', () => ({ default: () => null }));
vi.mock('./PowerSection.jsx', () => ({ default: ({ activities }) => <div data-testid="power">{activities.length}</div> }));

const sections = vi.hoisted(() => ({ lastSport: null, activities: [] }));
vi.mock('./ProgressSections.jsx', () => ({
  useProgressSectionsData: (sport) => {
    sections.lastSport = sport;
    return { loading: false, activities: sections.activities, loadSplit: null };
  },
  ProgressDataStatus: () => null,
  YearBlock: () => null,
  ZonesBlock: () => null,
  KeyTrendsBlock: () => null,
  SegmentsBlock: () => null,
}));

import ProgressTab from './ProgressTab';
import { weeklyPaceTrend } from './PaceSection';

const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ride = (n) => ({ id: `r${n}`, sport_type: 'Ride', start_date: day(n), distance: 40000, moving_time: 5400, average_watts: 200 });
const run = (n) => ({ id: `u${n}`, sport_type: 'Run', start_date: day(n), distance: 10000, moving_time: 3000, average_watts: 250 });

function renderTab(activities) {
  sections.activities = activities;
  return render(
    <MantineProvider>
      <MemoryRouter>
      <ProgressTab
        dailyTSSData={[]}
        trainingMetrics={{ ctl: 0 }}
        activities={activities}
        speedProfile={null}
        formatDist={(km) => `${km.toFixed(1)} km`}
        formatElev={(m) => `${Math.round(m)} m`}
        isImperial={false}
        ftp={250}
        navigate={() => {}}
      />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('ProgressTab sport filter (multisport phase 4)', () => {
  it('a rider-only athlete sees no filter and the Power section', () => {
    renderTab([ride(1), ride(3)]);
    expect(screen.queryByTestId('progress-sport-filter')).toBeNull();
    expect(screen.getByTestId('power')).toBeTruthy();
    expect(screen.queryByText('Pace')).toBeNull();
  });

  it('a hybrid athlete gets All / Ride / Run; Power never counts a footpod run', () => {
    renderTab([ride(1), run(2)]);
    expect(screen.getByTestId('progress-sport-filter')).toBeTruthy();
    expect(screen.getByTestId('power').textContent).toBe('1');
    expect(screen.getByText('Pace')).toBeTruthy();
  });

  it('Run hides Power, shows Pace, and filters the sections', () => {
    renderTab([ride(1), run(2), run(9)]);
    fireEvent.click(screen.getByText('Run'));
    expect(screen.queryByTestId('power')).toBeNull();
    expect(screen.getByTestId('pace-best-efforts')).toBeTruthy();
    expect(sections.lastSport).toBe('running');
    expect(screen.getByText('Runs, 90 days')).toBeTruthy();
    expect(localStorage.getItem('tribos.progress.sport')).toBe('running');
  });

  it('a run-only athlete lands on the run view without a filter', () => {
    renderTab([run(1), run(4)]);
    expect(screen.queryByTestId('progress-sport-filter')).toBeNull();
    expect(screen.queryByTestId('power')).toBeNull();
    expect(screen.getByTestId('pace-best-efforts')).toBeTruthy();
  });

  it('Pace best efforts tag whole-run results', () => {
    renderTab([run(1)]);
    expect(screen.getByTestId('pace-source-5k').textContent).toBe('Whole run');
  });
});

describe('weeklyPaceTrend', () => {
  it('takes the weekly median of runs of 20+ minutes', () => {
    const now = new Date('2026-10-15T12:00:00');
    const trend = weeklyPaceTrend(
      [
        { start_date: '2026-10-14T07:00:00', distance: 10000, moving_time: 3000 }, // 5:00/km
        { start_date: '2026-10-13T07:00:00', distance: 10000, moving_time: 3600 }, // 6:00/km
        { start_date: '2026-10-12T07:00:00', distance: 2000, moving_time: 600 }, // too short
      ],
      now,
      2,
    );
    expect(trend).toHaveLength(2);
    expect(trend[1].pace).toBe(330);
    expect(trend[1].runs).toBe(2);
    expect(trend[0].pace).toBeNull();
  });
});
