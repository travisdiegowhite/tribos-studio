/**
 * Smoke tests for ActivityChart: metric chips availability, honest tier
 * captions, and null-rendering for unchartable payloads. Canvas pixels are
 * not tested (jsdom has no 2D context — ChartCanvas guards it); geometry is
 * covered by the model tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ActivityChart } from './ActivityChart';
import type { NormalizedStreams } from '../model/streamTypes';

const renderChart = (streams: NormalizedStreams) =>
  render(
    <MantineProvider>
      <ActivityChart streams={streams} ftp={250} profileZones={null} />
    </MantineProvider>
  );

const base: NormalizedStreams = {
  version: 1,
  tier: 'per_second',
  source: 'fit_storage',
  sample_seconds: 1,
  t: Array.from({ length: 120 }, (_, i) => i),
  power: Array.from({ length: 120 }, () => 200),
  hr: Array.from({ length: 120 }, () => 140),
};

describe('ActivityChart', () => {
  it('renders chips for available metrics only', () => {
    renderChart(base);
    expect(screen.getByText('Power')).toBeTruthy();
    expect(screen.getByText('HR')).toBeTruthy();
    expect(screen.queryByText('Speed')).toBeNull();
  });

  it('captions the coach_ts tier with its sampling interval', () => {
    renderChart({ ...base, tier: 'coach_ts', source: 'fit_coach_context', sample_seconds: 30 });
    expect(screen.getByText(/30s samples/)).toBeTruthy();
  });

  it('captions the simplified tier as reduced detail', () => {
    renderChart({
      version: 1,
      tier: 'simplified',
      source: 'activity_streams',
      sample_seconds: null,
      power: [200, 220, 240],
      coords: [
        [-105.3, 40.0],
        [-105.29, 40.0],
        [-105.28, 40.0],
      ],
    });
    expect(screen.getByText(/Reduced detail/)).toBeTruthy();
  });

  it('renders nothing for an unchartable payload', () => {
    const { container } = renderChart({
      version: 1,
      tier: 'summary',
      source: 'none',
      sample_seconds: null,
    });
    expect(screen.queryByText('Power')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
