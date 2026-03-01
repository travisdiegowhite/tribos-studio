/**
 * Module 2: Weather
 * Fetches current weather for the user's location and provides a riding tip.
 */

/**
 * Generate weather content for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function weatherModule(supabase, userId) {
  const location = await getUserLocation(supabase, userId);
  if (!location) return null;

  const API_KEY = process.env.OPENWEATHER_API_KEY;
  if (!API_KEY) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&appid=${API_KEY}&units=metric`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    const weather = {
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      high: Math.round(data.main.temp_max),
      low: Math.round(data.main.temp_min),
      description: data.weather[0].description,
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
      windDirection: getWindDirection(data.wind.deg),
      humidity: data.main.humidity,
      locationName: data.name || location.name || 'Your area',
    };

    const tip = getRidingTip(weather);

    return buildWeatherBlock(weather, tip);
  } catch (err) {
    console.error('[daily-email] Weather fetch failed:', err.message);
    return null;
  }
}

async function getUserLocation(supabase, userId) {
  // Try user profile first (if location fields exist)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('location_lat, location_lon, location_name')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.location_lat && profile?.location_lon) {
    return { lat: profile.location_lat, lon: profile.location_lon, name: profile.location_name };
  }

  // Fall back to latest activity with GPS data
  const { data: activity } = await supabase
    .from('activities')
    .select('start_latlng')
    .eq('user_id', userId)
    .not('start_latlng', 'is', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activity?.start_latlng) {
    // start_latlng is typically [lat, lon] array
    const latlng = Array.isArray(activity.start_latlng)
      ? activity.start_latlng
      : null;
    if (latlng && latlng.length >= 2) {
      return { lat: latlng[0], lon: latlng[1], name: null };
    }
  }

  return null;
}

function getWindDirection(degrees) {
  if (degrees === undefined || degrees === null) return 'N';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

function getRidingTip(weather) {
  if (weather.windSpeed >= 40) return 'Very windy — consider the trainer or sheltered routes today.';
  if (weather.temp <= 0) return 'Below freezing — watch for ice and dress in layers.';
  if (weather.temp <= 5) return 'Cold out there. Thermal layers and shoe covers recommended.';
  if (weather.description.includes('rain') || weather.description.includes('drizzle')) {
    return 'Rain expected — fenders and bright lights if you head out.';
  }
  if (weather.description.includes('snow')) return 'Snow in the forecast. Trainer day.';
  if (weather.description.includes('thunderstorm')) return 'Storms expected — save the ride for another time.';
  if (weather.temp >= 35) return 'Extreme heat — ride early, hydrate aggressively.';
  if (weather.temp >= 30) return 'Hot day ahead. Start early and bring extra water.';
  if (weather.windSpeed >= 25) return 'Breezy — plan your route with the wind in mind.';
  if (weather.description.includes('clear') && weather.temp >= 15 && weather.temp <= 28) {
    return 'Perfect riding weather. Get out there.';
  }
  return 'Solid day for a ride.';
}

function buildWeatherBlock(weather, tip) {
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Weather · ${escapeHtml(weather.locationName)}</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width: 50%;">
                <p style="margin: 0 0 4px 0; font-size: 32px; font-weight: 700; color: #2C2C2C;">${weather.temp}°C</p>
                <p style="margin: 0; font-size: 14px; color: #6B6B5E;">Feels like ${weather.feelsLike}°C</p>
              </td>
              <td style="width: 50%; text-align: right;">
                <p style="margin: 0 0 4px 0; font-size: 14px; color: #4A4A42;">${escapeHtml(weather.description)}</p>
                <p style="margin: 0 0 4px 0; font-size: 13px; color: #6B6B5E;">Wind: ${weather.windSpeed} km/h ${weather.windDirection}</p>
                <p style="margin: 0; font-size: 13px; color: #6B6B5E;">H: ${weather.high}° · L: ${weather.low}°</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px; border-top: 1px solid #EDEDE8; padding-top: 12px;">
            <tr>
              <td>
                <p style="margin: 0; font-size: 14px; color: #4A4A42; font-style: italic;">${escapeHtml(tip)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `WEATHER — ${weather.locationName}\n${weather.temp}°C (feels like ${weather.feelsLike}°C) · ${weather.description}\nWind: ${weather.windSpeed} km/h ${weather.windDirection} · H: ${weather.high}° L: ${weather.low}°\n${tip}\n`;

  return { html, plainText };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
