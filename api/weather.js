// Weather API proxy - fetches weather data from OpenWeatherMap
// This avoids CORS issues and keeps API key server-side

export default async function handler(req, res) {
  // Allow GET for simple weather queries
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
      console.warn('[weather] OpenWeather API key not configured');
      // Return mock data for development
      return res.status(200).json({
        success: true,
        data: getMockWeatherData(parseFloat(lat), parseFloat(lon)),
        source: 'mock'
      });
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

    console.log(`[weather] Fetching weather for ${lat}, ${lon}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[weather] OpenWeather error:', response.status, errorText);

      // Return mock data on API error
      return res.status(200).json({
        success: true,
        data: getMockWeatherData(parseFloat(lat), parseFloat(lon)),
        source: 'mock',
        warning: 'Using mock data due to API error'
      });
    }

    const data = await response.json();

    // Transform to our format
    const weatherData = {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
      windDirection: getWindDirection(data.wind.deg),
      windDegrees: data.wind.deg,
      windGust: data.wind.gust ? Math.round(data.wind.gust * 3.6) : null,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      conditions: data.weather[0].main.toLowerCase(),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      visibility: data.visibility ? data.visibility / 1000 : 10,
      cloudCover: data.clouds?.all || 0,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      location: data.name,
    };

    console.log(`[weather] Successfully fetched weather: ${weatherData.temperature}°C, ${weatherData.windSpeed}km/h ${weatherData.windDirection}`);

    return res.status(200).json({
      success: true,
      data: weatherData,
      source: 'openweathermap'
    });

  } catch (error) {
    console.error('[weather] Error:', error);
    // Return mock data on any error
    const { lat, lon } = req.query;
    return res.status(200).json({
      success: true,
      data: getMockWeatherData(parseFloat(lat) || 37.7749, parseFloat(lon) || -122.4194),
      source: 'mock',
      warning: 'Using mock data due to error'
    });
  }
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

// Mock weather data for development
function getMockWeatherData(lat, lon) {
  // Generate semi-realistic mock data based on location
  const baseTemp = 20 - Math.abs(lat - 37) * 0.5; // Cooler further from 37 lat
  const windVariation = Math.sin(lon * 0.1) * 5;

  return {
    temperature: Math.round(baseTemp + (Math.random() * 6 - 3)),
    feelsLike: Math.round(baseTemp + (Math.random() * 4 - 2)),
    windSpeed: Math.round(12 + windVariation + (Math.random() * 8)),
    windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
    windDegrees: Math.floor(Math.random() * 360),
    windGust: Math.round(18 + (Math.random() * 10)),
    description: ['partly cloudy', 'clear sky', 'few clouds', 'scattered clouds'][Math.floor(Math.random() * 4)],
    icon: ['02d', '01d', '03d', '04d'][Math.floor(Math.random() * 4)],
    conditions: 'clouds',
    humidity: Math.round(55 + (Math.random() * 20)),
    pressure: Math.round(1010 + (Math.random() * 10)),
    visibility: 10,
    cloudCover: Math.round(20 + (Math.random() * 40)),
    sunrise: Math.floor(Date.now() / 1000) - 21600, // 6 hours ago
    sunset: Math.floor(Date.now() / 1000) + 21600, // 6 hours from now
    location: 'Your Location',
  };
}
