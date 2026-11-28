import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { WeatherPanel } from '../WeatherPanel';
import { useRouteBuilderStore } from '../../../../stores/routeBuilderStore';
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

function renderPanel(weather: UseRouteWeatherReturn, isImperial = false) {
  render(
    <MantineProvider>
      <WeatherPanel weather={weather} isImperial={isImperial} />
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

  it('renders °F and mph when imperial', () => {
    renderPanel(makeWeather(), true);
    // 18°C → 64°F primary; 15 km/h → 9 mph.
    expect(screen.getByText('64°F')).toBeInTheDocument();
    expect(screen.getByText('9 mph')).toBeInTheDocument();
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

describe('WeatherPanel — planned start', () => {
  it('switching to a planned start stores it and shows a time input', () => {
    useRouteBuilderStore.setState({ rideStartAt: null });
    render(
      <MantineProvider>
        <WeatherPanel weather={makeWeather()} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Planned start' }));
    const stored = useRouteBuilderStore.getState().rideStartAt as string | null;
    expect(stored).not.toBeNull();
    expect(Date.parse(stored as string)).toBeGreaterThan(Date.now());
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    useRouteBuilderStore.setState({ rideStartAt: null });
  });

  it('shows the start / midway / finish strip and the too-far note', () => {
    const at = new Date().toISOString();
    const point = { temperature: 9, feelsLike: 8, windSpeed: 12, windDirection: 'W', windDegrees: 270, windGust: null, description: '', conditions: '', humidity: 50, location: '' };
    const { unmount } = render(
      <MantineProvider>
        <WeatherPanel
          weather={makeWeather({
            timeline: [
              { label: 'Start', at, weather: point },
              { label: 'Midway', at, weather: point },
              { label: 'Finish', at, weather: null },
            ],
          })}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-weather-timeline')).toHaveTextContent(/Start/);
    expect(screen.getByTestId('rb2-weather-timeline')).toHaveTextContent(/9°C/);
    unmount();
    render(
      <MantineProvider>
        <WeatherPanel weather={makeWeather({ weather: null, wind: null, forecastNote: 'too_far' })} />
      </MantineProvider>,
    );
    expect(screen.getByTestId('rb2-weather-too-far')).toHaveTextContent(/five days/);
  });
});

