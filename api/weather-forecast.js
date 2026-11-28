// Weather Forecast API proxy - fetches 5-day forecast from OpenWeatherMap
// Returns daily summaries aggregated from 3-hour intervals.
//
// mode=at&time=<ISO>: the 3-hour slot nearest that time, in /api/weather's
// field shape, for the route builder's "weather at your start time" (Phase 2,
// docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.9). Beyond the 5-day window the
// answer is `data: null, reason: 'out_of_range'`.

const DEG_TO_CARDINAL = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const SLOT_HALF_WIDTH_MS = 90 * 60 * 1000;

/** The forecast slot nearest `targetMs`, or null when it's outside the list's window. */
export function pickForecastSlot(list, targetMs) {
  if (!Array.isArray(list) || list.length === 0 || !Number.isFinite(targetMs)) return null;
  const first = list[0].dt * 1000;
  const last = list[list.length - 1].dt * 1000;
  if (targetMs < first - SLOT_HALF_WIDTH_MS || targetMs > last + SLOT_HALF_WIDTH_MS) return null;
  let best = list[0];
  for (const slot of list) {
    if (Math.abs(slot.dt * 1000 - targetMs) < Math.abs(best.dt * 1000 - targetMs)) best = slot;
  }
  return best;
}

/** A forecast slot in /api/weather's shape (wind in km/h). */
export function slotToWeather(slot, city) {
  const deg = slot.wind?.deg ?? 0;
  return {
    temperature: Math.round(slot.main?.temp ?? 0),
    feelsLike: Math.round(slot.main?.feels_like ?? slot.main?.temp ?? 0),
    windSpeed: Math.round((slot.wind?.speed ?? 0) * 3.6),
    windDirection: DEG_TO_CARDINAL[Math.round(deg / 22.5) % 16],
    windDegrees: deg,
    windGust: slot.wind?.gust != null ? Math.round(slot.wind.gust * 3.6) : null,
    description: slot.weather?.[0]?.description ?? '',
    icon: slot.weather?.[0]?.icon ?? null,
    conditions: slot.weather?.[0]?.main ?? '',
    humidity: slot.main?.humidity ?? null,
    precipitationChance: typeof slot.pop === 'number' ? Math.round(slot.pop * 100) : null,
    location: city?.name ?? '',
    forecastFor: new Date(slot.dt * 1000).toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Declared outside the try: the catch below uses it for the mock fallback
  // (it used to be try-scoped, so an error threw a ReferenceError instead).
  const tzOffsetMinutes = parseInt(req.query?.tz, 10) || 0;

  try {
    const { lat, lon, mode, time } = req.query;
    const targetMs = mode === 'at' ? Date.parse(time) : NaN;
    if (mode === 'at' && !Number.isFinite(targetMs)) {
      return res.status(400).json({ error: 'mode=at needs an ISO time' });
    }

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing lat or lon parameters' });
    }


    const API_KEY = process.env.OPENWEATHER_API_KEY;

    if (!API_KEY) {
      console.warn('[weather-forecast] OpenWeather API key not configured');
      if (mode === 'at') {
        return res.status(200).json({ success: true, data: getMockAtWeather(targetMs), source: 'mock' });
      }
      return res.status(200).json({
        success: true,
        data: getMockForecastData(tzOffsetMinutes),
        source: 'mock'
      });
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

    console.log(`[weather-forecast] Fetching forecast for ${lat}, ${lon}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[weather-forecast] OpenWeather error:', response.status, errorText);
      return res.status(200).json({
        success: true,
        data: getMockForecastData(tzOffsetMinutes),
        source: 'mock',
        warning: 'Using mock data due to API error'
      });
    }

    const data = await response.json();

    if (mode === 'at') {
      const slot = pickForecastSlot(data.list, targetMs);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.status(200).json(
        slot
          ? { success: true, data: slotToWeather(slot, data.city), source: 'openweathermap' }
          : { success: true, data: null, reason: 'out_of_range', source: 'openweathermap' },
      );
    }

    const dailySummaries = aggregateToDailySummaries(data.list, tzOffsetMinutes);

    console.log(`[weather-forecast] Successfully fetched ${Object.keys(dailySummaries).length} days of forecast`);

    // Cache for 30 minutes — forecast data changes slowly
    res.setHeader('Cache-Control', 'public, max-age=1800');

    return res.status(200).json({
      success: true,
      data: dailySummaries,
      source: 'openweathermap'
    });

  } catch (error) {
    console.error('[weather-forecast] Error:', error);
    return res.status(200).json({
      success: true,
      data: getMockForecastData(tzOffsetMinutes),
      source: 'mock',
      warning: 'Using mock data due to error'
    });
  }
}

// Aggregate 3-hour intervals into daily summaries
// tzOffsetMinutes: browser's getTimezoneOffset() value (e.g., 420 for UTC-7)
function aggregateToDailySummaries(intervals, tzOffsetMinutes = 0) {
  const days = {};

  for (const interval of intervals) {
    // Convert UTC timestamp to local date using the client's timezone offset
    // getTimezoneOffset() returns minutes AHEAD of UTC (negative for east, positive for west)
    // So UTC-7 (PDT) = 420, UTC+1 (CET) = -60
    const utcMs = interval.dt * 1000;
    const localMs = utcMs - (tzOffsetMinutes * 60 * 1000);
    const localDate = new Date(localMs);
    const date = localDate.toISOString().split('T')[0];

    if (!days[date]) {
      days[date] = {
        temps: [],
        tempMaxes: [],
        tempMins: [],
        winds: [],
        windDirs: [],
        conditions: [],
        icons: [],
        humidities: [],
      };
    }

    const d = days[date];
    d.temps.push(interval.main.temp);
    d.tempMaxes.push(interval.main.temp_max);
    d.tempMins.push(interval.main.temp_min);
    d.winds.push(interval.wind.speed * 3.6); // m/s → km/h
    d.windDirs.push(interval.wind.deg);
    d.conditions.push(interval.weather[0].main);
    d.icons.push(interval.weather[0].icon);
    d.humidities.push(interval.main.humidity);
  }

  const result = {};

  for (const [date, d] of Object.entries(days)) {
    // Most frequent condition
    const conditionCounts = {};
    d.conditions.forEach(c => { conditionCounts[c] = (conditionCounts[c] || 0) + 1; });
    const topCondition = Object.entries(conditionCounts).sort((a, b) => b[1] - a[1])[0][0];

    // Icon matching the most frequent condition (prefer daytime 'd' icons)
    const dayIcons = d.icons.filter(i => i.endsWith('d'));
    const iconPool = dayIcons.length > 0 ? dayIcons : d.icons;
    const iconCounts = {};
    iconPool.forEach(i => { iconCounts[i] = (iconCounts[i] || 0) + 1; });
    const topIcon = Object.entries(iconCounts).sort((a, b) => b[1] - a[1])[0][0];

    // Wind direction at peak wind speed
    const maxWindIdx = d.winds.indexOf(Math.max(...d.winds));

    result[date] = {
      date,
      temperature: Math.round(d.temps.reduce((a, b) => a + b, 0) / d.temps.length),
      temperatureHigh: Math.round(Math.max(...d.tempMaxes)),
      temperatureLow: Math.round(Math.min(...d.tempMins)),
      windSpeed: Math.round(Math.max(...d.winds)),
      windDirection: getWindDirection(d.windDirs[maxWindIdx]),
      conditions: topCondition,
      description: topCondition.toLowerCase(),
      icon: topIcon,
      humidity: Math.round(d.humidities.reduce((a, b) => a + b, 0) / d.humidities.length),
    };
  }

  return result;
}

// Convert wind degrees to cardinal direction
function getWindDirection(degrees) {
  if (degrees === undefined || degrees === null) return 'N';
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// Mock forecast data for development
// tzOffsetMinutes: browser's getTimezoneOffset() value
function getMockForecastData(tzOffsetMinutes = 0) {
  const result = {};
  // Calculate "now" in the caller's local timezone
  const nowUtcMs = Date.now();
  const localNowMs = nowUtcMs - (tzOffsetMinutes * 60 * 1000);

  for (let i = 0; i < 5; i++) {
    const localMs = localNowMs + (i * 24 * 60 * 60 * 1000);
    const dateStr = new Date(localMs).toISOString().split('T')[0];

    const baseTemp = 18 + Math.sin(i * 0.8) * 4;
    result[dateStr] = {
      date: dateStr,
      temperature: Math.round(baseTemp),
      temperatureHigh: Math.round(baseTemp + 3 + Math.random() * 2),
      temperatureLow: Math.round(baseTemp - 3 - Math.random() * 2),
      windSpeed: Math.round(10 + Math.random() * 15),
      windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
      conditions: ['Clear', 'Clouds', 'Rain', 'Clear', 'Clouds'][i],
      description: ['clear sky', 'scattered clouds', 'light rain', 'clear sky', 'few clouds'][i],
      icon: ['01d', '03d', '10d', '01d', '02d'][i],
      humidity: Math.round(45 + Math.random() * 30),
    };
  }

  return result;
}

function getMockAtWeather(targetMs) {
  return {
    temperature: 14,
    feelsLike: 13,
    windSpeed: 12,
    windDirection: 'W',
    windDegrees: 270,
    windGust: 20,
    description: 'few clouds',
    icon: '02d',
    conditions: 'Clouds',
    humidity: 50,
    precipitationChance: 10,
    location: '',
    forecastFor: new Date(Number.isFinite(targetMs) ? targetMs : Date.now()).toISOString(),
  };
}
