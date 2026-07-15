import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cloneElement } from 'react';
import { MantineProvider } from '@mantine/core';
import RideStreamsChart from './RideStreamsChart';

// ResponsiveContainer measures the DOM, which jsdom can't do — give the
// chart fixed dimensions so the full SVG (axes, series) actually renders.
vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 280 }),
  };
});

const renderChart = (activity) =>
  render(<MantineProvider>{<RideStreamsChart activity={activity} />}</MantineProvider>);

// A short outdoor ride: 20 GPS points heading north with all sensors
const outdoorActivity = {
  moving_time: 1200,
  activity_streams: {
    coords: Array.from({ length: 20 }, (_, i) => [-105.5, 39.9 + i * 0.001]),
    power: Array.from({ length: 20 }, (_, i) => 200 + (i % 5) * 10),
    heartRate: Array.from({ length: 20 }, (_, i) => 140 + (i % 3)),
    speed: Array.from({ length: 20 }, () => 8.5),
    cadence: Array.from({ length: 20 }, () => 90),
    elevation: Array.from({ length: 20 }, (_, i) => 1600 + i),
  },
};

describe('RideStreamsChart', () => {
  it('renders chips for available metrics but not elevation (background-only)', () => {
    renderChart(outdoorActivity);
    expect(screen.getByText('Power')).toBeTruthy();
    expect(screen.getByText('Heart Rate')).toBeTruthy();
    expect(screen.getByText('Speed')).toBeTruthy();
    expect(screen.getByText('Cadence')).toBeTruthy();
    expect(screen.queryByText('Elevation')).toBeNull();
  });

  it('labels the x-axis with distance for GPS rides', () => {
    renderChart(outdoorActivity);
    expect(screen.getByText('Distance (km)')).toBeTruthy();
  });

  it('renders visible axis labels for power and heart rate', () => {
    renderChart(outdoorActivity);
    expect(screen.getByText('Power (W)')).toBeTruthy();
    expect(screen.getByText('Heart Rate (bpm)')).toBeTruthy();
  });

  it('labels the x-axis with time for indoor rides with a known duration', () => {
    renderChart({
      moving_time: 3600,
      activity_streams: {
        power: Array.from({ length: 30 }, () => 210),
        heartRate: Array.from({ length: 30 }, () => 145),
      },
    });
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.queryByText('Distance (km)')).toBeNull();
  });

  it('falls back to sample labeling with no coords and no duration', () => {
    renderChart({
      activity_streams: {
        heartRate: Array.from({ length: 10 }, () => 130),
      },
    });
    expect(screen.getByText('Sample')).toBeTruthy();
  });

  it('renders nothing without streams', () => {
    const { container } = renderChart({});
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
    expect(screen.queryByText('Power')).toBeNull();
  });

  it('renders the elevation background even with only elevation data', () => {
    const { container } = renderChart({
      moving_time: 600,
      activity_streams: {
        coords: Array.from({ length: 10 }, (_, i) => [-105.5, 39.9 + i * 0.001]),
        elevation: Array.from({ length: 10 }, (_, i) => 1600 + i * 5),
      },
    });
    expect(container.querySelector('.recharts-area')).toBeTruthy();
  });
});
