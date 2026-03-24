// Weather Forecast API proxy - fetches 5-day forecast from OpenWeatherMap
// Returns daily summaries aggregated from 3-hour intervals

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing lat or lon parameters' });
    }

    const API_KEY = process.env.OPENWEATHER_API_KEY;

    if (!API_KEY) {
      console.warn('[weather-forecast] OpenWeather API key not configured');
      return res.status(200).json({
        success: true,
        data: getMockForecastData(),
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
        data: getMockForecastData(),
        source: 'mock',
        warning: 'Using mock data due to API error'
      });
    }

    const data = await response.json();
    const dailySummaries = aggregateToDailySummaries(data.list);

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
      data: getMockForecastData(),
      source: 'mock',
      warning: 'Using mock data due to error'
    });
  }
}

// Aggregate 3-hour intervals into daily summaries
function aggregateToDailySummaries(intervals) {
  const days = {};

  for (const interval of intervals) {
    // Group by UTC date (YYYY-MM-DD)
    const date = interval.dt_txt.split(' ')[0];

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
function getMockForecastData() {
  const result = {};
  const now = new Date();

  for (let i = 0; i < 5; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

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
