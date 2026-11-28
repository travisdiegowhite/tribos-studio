import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, { pickForecastSlot, slotToWeather } from './weather-forecast.js';

const T0 = Date.parse('2026-11-29T15:00:00Z') / 1000;
const LIST = [0, 1, 2, 3].map((i) => ({
  dt: T0 + i * 3 * 3600,
  main: { temp: 10 + i, feels_like: 9 + i, humidity: 40 },
  wind: { speed: 5, deg: 180 + i * 10, gust: 8 },
  weather: [{ main: 'Clear', description: 'clear sky', icon: '01d' }],
  pop: 0.2,
}));

describe('pickForecastSlot', () => {
  it('picks the nearest 3-hour slot', () => {
    expect(pickForecastSlot(LIST, (T0 + 4 * 3600) * 1000).dt).toBe(T0 + 3 * 3600);
    expect(pickForecastSlot(LIST, (T0 + 5 * 3600) * 1000).dt).toBe(T0 + 6 * 3600);
  });

  it('is null outside the forecast window', () => {
    expect(pickForecastSlot(LIST, (T0 + 30 * 3600) * 1000)).toBeNull();
    expect(pickForecastSlot(LIST, (T0 - 5 * 3600) * 1000)).toBeNull();
  });
});

describe('slotToWeather', () => {
  it('matches /api/weather’s shape, wind in km/h', () => {
    const w = slotToWeather(LIST[0], { name: 'Boulder' });
    expect(w).toMatchObject({ temperature: 10, windSpeed: 18, windDegrees: 180, windDirection: 'S', windGust: 29, location: 'Boulder', precipitationChance: 20 });
    expect(w.forecastFor).toBe(new Date(T0 * 1000).toISOString());
  });
});

describe('mode=at handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENWEATHER_API_KEY;
  });

  function call(query) {
    const res = {
      statusCode: 0,
      body: null,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    return handler({ method: 'GET', query }, res).then(() => res);
  }

  it('answers the slot for the asked time', async () => {
    process.env.OPENWEATHER_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ list: LIST, city: { name: 'Boulder' } }) })));
    const res = await call({ lat: '40', lon: '-105', mode: 'at', time: new Date((T0 + 3 * 3600) * 1000).toISOString() });
    expect(res.body.data.temperature).toBe(11);
  });

  it('says out_of_range beyond the window, and rejects a bad time', async () => {
    process.env.OPENWEATHER_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ list: LIST, city: {} }) })));
    const res = await call({ lat: '40', lon: '-105', mode: 'at', time: '2027-01-01T00:00:00Z' });
    expect(res.body).toMatchObject({ data: null, reason: 'out_of_range' });
    expect((await call({ lat: '40', lon: '-105', mode: 'at', time: 'soon' })).statusCode).toBe(400);
  });
});

describe('daily mode fallback', () => {
  it('returns mock data instead of throwing when the upstream call blows up', async () => {
    process.env.OPENWEATHER_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = {
      statusCode: 0,
      body: null,
      setHeader() {},
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await handler({ method: 'GET', query: { lat: '40', lon: '-105', tz: '420' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('mock');
    vi.unstubAllGlobals();
    delete process.env.OPENWEATHER_API_KEY;
  });
});
