import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeRouteWind,
  fetchWeatherAt,
  getRouteWeather,
} from './routeWeatherContext.js';
import { buildRouteCoachSystemPrompt } from './routeCoachContext.js';

// A due-west leg: heading 270°. Wind FROM the west (270°) is a headwind;
// wind FROM the east (90°) is a tailwind.
const WEST_LEG = [
  [-105.0, 40.0],
  [-105.1, 40.0],
];

describe('analyzeRouteWind', () => {
  it('returns null for calm wind (< 5 km/h)', () => {
    expect(analyzeRouteWind(WEST_LEG, 270, 3)).toBeNull();
  });

  it('returns null for degenerate geometry', () => {
    expect(analyzeRouteWind([[-105, 40]], 270, 20)).toBeNull();
    expect(analyzeRouteWind(null, 270, 20)).toBeNull();
  });

  it('classifies a headwind when wind comes from the heading direction', () => {
    const r = analyzeRouteWind(WEST_LEG, 270, 25);
    expect(r).not.toBeNull();
    expect(r.headwind).toBe(100);
    expect(r.tailwind).toBe(0);
    expect(r.overall).toMatch(/headwind/);
  });

  it('classifies a tailwind when wind comes from behind', () => {
    const r = analyzeRouteWind(WEST_LEG, 90, 25);
    expect(r.tailwind).toBe(100);
    expect(r.headwind).toBe(0);
  });

  it('classifies a crosswind when wind is perpendicular', () => {
    // Heading west (270°); wind from the south (180°) is a 90° crosswind.
    const r = analyzeRouteWind(WEST_LEG, 180, 25);
    expect(r.crosswind).toBe(100);
  });

  it('percentages sum to 100', () => {
    const r = analyzeRouteWind(WEST_LEG, 270, 25);
    const sum = r.headwind + r.tailwind + r.crosswind + r.neutral;
    expect(sum).toBe(100);
  });
});

describe('fetchWeatherAt / getRouteWeather — key guard', () => {
  const realKey = process.env.OPENWEATHER_API_KEY;
  beforeEach(() => {
    delete process.env.OPENWEATHER_API_KEY;
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = realKey;
    vi.restoreAllMocks();
  });

  it('fetchWeatherAt returns null with no API key (never mock data for the coach)', async () => {
    await expect(fetchWeatherAt(40, -105)).resolves.toBeNull();
  });

  it('getRouteWeather returns null with no API key', async () => {
    await expect(getRouteWeather([-105, 40], WEST_LEG)).resolves.toBeNull();
  });
});

describe('getRouteWeather — happy path (mocked fetch)', () => {
  const realKey = process.env.OPENWEATHER_API_KEY;
  beforeEach(() => {
    process.env.OPENWEATHER_API_KEY = 'owm-test';
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = realKey;
    vi.restoreAllMocks();
  });

  it('returns conditions plus the route-wind breakdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        main: { temp: 18.4, feels_like: 17.1, humidity: 50 },
        wind: { speed: 8, deg: 270 }, // 8 m/s ≈ 29 km/h from the west
        weather: [{ main: 'Clouds', description: 'broken clouds' }],
        name: 'Boulder',
      }),
    });

    const r = await getRouteWeather([-105.0, 40.0], WEST_LEG);
    expect(r).not.toBeNull();
    expect(r.temperatureC).toBe(18);
    expect(r.windSpeedKmh).toBe(29);
    expect(r.windDirection).toBe('W');
    // Heading west into a west wind → headwind-dominant.
    expect(r.wind.headwind).toBe(100);
  });

  it('returns null when the API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(getRouteWeather([-105, 40], WEST_LEG)).resolves.toBeNull();
  });
});

describe('buildRouteCoachSystemPrompt — weather block', () => {
  const baseSnapshot = {
    stats: { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 },
    routeProfile: 'road',
    startLocation: [-105, 40],
    geometry: { type: 'LineString', coordinates: WEST_LEG },
  };

  it('omits the block when weather is null', () => {
    const prompt = buildRouteCoachSystemPrompt({
      persona: null,
      prescription: null,
      fitnessState: null,
      familiarRoads: null,
      weather: null,
      routeSnapshot: baseSnapshot,
      userLocalDate: null,
    });
    expect(prompt).not.toMatch(/WIND & WEATHER/);
  });

  it('renders wind, conditions, and the tailwind guidance when weather is present', () => {
    const prompt = buildRouteCoachSystemPrompt({
      persona: null,
      prescription: null,
      fitnessState: null,
      familiarRoads: null,
      weather: {
        temperatureC: 18,
        feelsLikeC: 17,
        windSpeedKmh: 29,
        windGustKmh: 40,
        windDegrees: 270,
        windDirection: 'W',
        conditions: 'clouds',
        description: 'broken clouds',
        wind: { headwind: 100, tailwind: 0, crosswind: 0, neutral: 0, overall: '100% headwind' },
      },
      routeSnapshot: baseSnapshot,
      userLocalDate: null,
    });
    expect(prompt).toMatch(/WIND & WEATHER/);
    expect(prompt).toMatch(/29 km\/h from the W/);
    expect(prompt).toMatch(/100% headwind/);
    expect(prompt).toMatch(/tailwind on\s+the way home/);
  });

  it('surfaces a hazard line for thunderstorms', () => {
    const prompt = buildRouteCoachSystemPrompt({
      persona: null,
      prescription: null,
      fitnessState: null,
      familiarRoads: null,
      weather: {
        temperatureC: 22,
        feelsLikeC: 22,
        windSpeedKmh: 15,
        windGustKmh: null,
        windDegrees: 200,
        windDirection: 'SSW',
        conditions: 'thunderstorm',
        description: 'thunderstorm with heavy rain',
        wind: null,
      },
      routeSnapshot: baseSnapshot,
      userLocalDate: null,
    });
    expect(prompt).toMatch(/HAZARD/);
  });
});
