import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WindLegend } from '../WindLegend';
import type { UseRouteWeatherReturn } from '../../../../hooks/route-builder';

function makeWeather(overrides: Partial<UseRouteWeatherReturn> = {}): UseRouteWeatherReturn {
  return {
    status: 'ready',
    error: null,
    hasRoute: true,
    refresh: vi.fn().mockResolvedValue(undefined),
    weather: {
      temperature: 18,
      feelsLike: 17,
      windSpeed: 15,
      windDirection: 'NW',
      windDegrees: 315,
      windGust: null,
      description: 'clear',
      conditions: 'clear',
      humidity: 50,
      location: 'Boulder',
    },
    wind: {
      overall: { type: 'headwind-dominant', description: '60% headwind' },
      percentages: { headwind: 60, tailwind: 20, crosswind: 20, neutral: 0 },
    },
    ...overrides,
  };
}

function renderLegend(weather: UseRouteWeatherReturn) {
  render(
    <MantineProvider>
      <WindLegend weather={weather} />
    </MantineProvider>,
  );
}

describe('WindLegend', () => {
  it('shows the color key and overall description when ready', () => {
    renderLegend(makeWeather());
    const root = screen.getByTestId('rb2-wind-legend');
    expect(root).toHaveTextContent('Headwind');
    expect(root).toHaveTextContent('Tailwind');
    expect(root).toHaveTextContent('Crosswind');
    expect(root).toHaveTextContent('15 km/h from NW');
    expect(root).toHaveTextContent('60% headwind along route');
  });

  it('shows a loading state', () => {
    renderLegend(makeWeather({ status: 'loading', weather: null, wind: null }));
    expect(screen.getByTestId('rb2-wind-legend')).toHaveTextContent(/loading conditions/i);
  });

  it('shows an error state', () => {
    renderLegend(
      makeWeather({ status: 'error', error: 'Weather unavailable.', weather: null, wind: null }),
    );
    expect(screen.getByTestId('rb2-wind-legend')).toHaveTextContent('Weather unavailable.');
  });
});
