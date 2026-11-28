import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../utils/weather.js', () => ({
  getWeatherData: vi.fn(async () => ({ temperature: 5, windSpeed: 10, windDegrees: 90, windDirection: 'E' })),
  analyzeWindForRoute: vi.fn(() => ({ overall: { type: 'head', description: 'Mostly headwind' }, percentages: { headwind: 60, tailwind: 20, crosswind: 20, neutral: 0 } })),
}));

import { useRouteWeather } from '../useRouteWeather';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { getWeatherData, analyzeWindForRoute } from '../../../utils/weather.js';

const COORDS = [
  [-105.27, 40.01],
  [-105.25, 40.02],
  [-105.23, 40.03],
];
const HOUR = 3600 * 1000;

function seed(startOffsetMs: number | null) {
  useRouteBuilderStore.setState({
    routeGeometry: { type: 'LineString', coordinates: COORDS },
    routeStats: { distance_km: 20, elevation_gain_m: 100, duration_s: 2 * 3600 },
    rideStartAt: startOffsetMs == null ? null : new Date(Date.now() + startOffsetMs).toISOString(),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const time = decodeURIComponent(String(url).split('time=')[1]);
    const hoursOut = Math.round((Date.parse(time) - Date.now()) / HOUR);
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: { temperature: hoursOut, windSpeed: 20, windDegrees: 270, windDirection: 'W', location: 'Boulder' },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getWeatherData).mockClear();
  vi.mocked(analyzeWindForRoute).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('useRouteWeather — planned start', () => {
  it('forecasts start, midway and finish at their arrival times; wind from midway', async () => {
    seed(24 * HOUR);
    const { result } = renderHook(() => useRouteWeather());
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const temps = result.current.timeline!.map((p) => p.weather?.temperature);
    // 2 h ride from +24 h: start +24, midway +25, finish +26.
    expect(temps).toEqual([24, 25, 26]);
    expect(result.current.weather?.temperature).toBe(24);
    expect(analyzeWindForRoute).toHaveBeenCalledWith(COORDS, 270, 20);
    expect(getWeatherData).not.toHaveBeenCalled();
  });

  it('says the forecast is too far out beyond five days, without fetching', async () => {
    seed(6 * 24 * HOUR);
    const { result } = renderHook(() => useRouteWeather());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.forecastNote).toBe('too_far');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses current conditions when no start is planned', async () => {
    seed(null);
    const { result } = renderHook(() => useRouteWeather());
    await act(async () => {
      await result.current.refresh();
    });
    expect(getWeatherData).toHaveBeenCalledTimes(1);
    expect(result.current.timeline).toBeNull();
  });
});
