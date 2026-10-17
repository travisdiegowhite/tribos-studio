import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cloneElement } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 280 }),
  };
});

const thresholds = vi.hoisted(() => ({
  value: { thresholdPaceSec: null, lthr: null, maxHr: null, restingHr: null },
}));
vi.mock('../hooks/useRunThresholds', () => ({
  useRunThresholds: () => thresholds.value,
}));

import RideStreamsChart from './RideStreamsChart';
import RideZonesChart, { computePaceZones } from './RideZonesChart';
import { getSecondaryStats } from '../utils/shareCard/renderShareCard';

// A 20-point run heading north at ~5:00/km with one-leg cadence.
const run = {
  sport_type: 'Run',
  moving_time: 1200,
  max_heartrate: 182,
  activity_streams: {
    coords: Array.from({ length: 20 }, (_, i) => [-105.5, 39.9 + i * 0.001]),
    heartRate: Array.from({ length: 20 }, (_, i) => 150 + (i % 3)),
    speed: Array.from({ length: 20 }, () => 3.33),
    cadence: Array.from({ length: 20 }, () => 86),
    elevation: Array.from({ length: 20 }, (_, i) => 1600 + i),
  },
};

const wrap = (node) => render(<MantineProvider>{node}</MantineProvider>);

describe('run activity analysis (multisport phase 4)', () => {
  it('the streams chart shows pace and steps per minute, not speed and rpm', () => {
    wrap(<RideStreamsChart activity={run} />);
    expect(screen.getByText('Pace')).toBeTruthy();
    expect(screen.queryByText('Speed')).toBeNull();
    expect(document.body.textContent).toContain('Pace (/km)');
    expect(document.body.textContent).not.toContain('rpm');
  });

  it('labels distance in miles for an imperial runner', () => {
    wrap(<RideStreamsChart activity={run} isImperial />);
    expect(document.body.textContent).toContain('Distance (mi)');
    expect(document.body.textContent).toContain('Pace (/mi)');
  });

  it('buckets pace into zones against threshold pace', () => {
    // 5:00/km easy against a 4:00/km threshold (×1.25) is Z2.
    const zones = computePaceZones(Array(10).fill(3.333), 240);
    expect(zones.find((z) => z.zone === 2).percent).toBe(100);
    // Standing still is not counted.
    expect(computePaceZones([0, 0.2], 240)).toBeNull();
    expect(computePaceZones([3.3], null)).toBeNull();
  });

  it('offers pace zones for a run when a threshold pace is known', () => {
    thresholds.value = { thresholdPaceSec: 240, lthr: null, maxHr: null, restingHr: null };
    wrap(<RideZonesChart activity={run} ftp={250} maxHr={182} />);
    expect(screen.getByText('Pace Zones')).toBeTruthy();
    expect(screen.queryByText('Power Zones')).toBeNull();
  });

  it('a run without a threshold pace gets HR zones only', () => {
    thresholds.value = { thresholdPaceSec: null, lthr: null, maxHr: null, restingHr: null };
    wrap(<RideZonesChart activity={run} ftp={250} maxHr={182} />);
    expect(screen.queryByText('Pace Zones')).toBeNull();
    expect(screen.getByText('Zone Distribution')).toBeTruthy();
  });

  it('the share card shows average pace for a run', () => {
    const metrics = {
      distance: 10,
      elevation: 50,
      duration: 3000,
      avgPower: 0,
      avgHR: 150,
      avgSpeed: 12,
      powerTSS: null,
      estimatedTSS: 55,
      powerSport: false,
    };
    const stats = getSecondaryStats({ ride: run, metrics, isImperial: false });
    expect(stats.find((s) => s.label === 'AVG PACE')).toMatchObject({ value: '5:00', unit: '/km' });
    expect(stats.find((s) => s.label === 'AVG SPEED')).toBeUndefined();
    const imperial = getSecondaryStats({ ride: run, metrics, isImperial: true });
    expect(imperial.find((s) => s.label === 'AVG PACE')).toMatchObject({ value: '8:03', unit: '/mi' });
  });
});
