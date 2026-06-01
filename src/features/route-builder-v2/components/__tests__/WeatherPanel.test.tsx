import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WeatherPanel } from '../WeatherPanel';
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
      windGust: 22,
      description: 'partly cloudy',
      conditions: 'clouds',
      humidity: 55,
      location: 'Boulder',
    },
    wind: {
      overall: { type: 'headwind-dominant', description: '60% headwind' },
      percentages: { headwind: 60, tailwind: 20, crosswind: 20, neutral: 0 },
    },
    ...overrides,
  };
}

function renderPanel(weather: UseRouteWeatherReturn) {
  render(
    <MantineProvider>
      <WeatherPanel weather={weather} />
    </MantineProvider>,
  );
}

describe('WeatherPanel', () => {
  it('prompts to build a route when there is none', () => {
    renderPanel(makeWeather({ hasRoute: false, status: 'idle', weather: null, wind: null }));
    expect(screen.getByTestId('rb2-weather-panel')).toHaveTextContent(/build or generate a route/i);
  });

  it('renders conditions, wind compass and route-wind breakdown', () => {
    renderPanel(makeWeather());
    expect(screen.getByText('18°C')).toBeInTheDocument();
    expect(screen.getByText(/from NW/)).toBeInTheDocument();
    expect(screen.getByTestId('rb2-weather-wind-compass')).toBeInTheDocument();
    expect(screen.getByTestId('rb2-weather-wind-breakdown')).toHaveTextContent('60% headwind');
    expect(screen.getByText('Head 60%')).toBeInTheDocument();
  });

  it('fetches on mount when a route exists but nothing is loaded', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderPanel(makeWeather({ status: 'idle', weather: null, wind: null, refresh }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows an error message on failure', () => {
    renderPanel(
      makeWeather({ status: 'error', error: 'Weather is unavailable right now.', weather: null }),
    );
    expect(screen.getByTestId('rb2-weather-error')).toHaveTextContent('unavailable');
  });

  it('refresh button re-fetches', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderPanel(makeWeather({ refresh }));
    fireEvent.click(screen.getByTestId('rb2-weather-refresh'));
    expect(refresh).toHaveBeenCalled();
  });
});
