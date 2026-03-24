/**
 * Weather forecast types for training planner integration
 */

export interface DailyForecast {
  date: string;            // YYYY-MM-DD
  temperature: number;     // Celsius (representative/avg)
  temperatureHigh: number; // Celsius
  temperatureLow: number;  // Celsius
  windSpeed: number;       // km/h
  windDirection: string;   // Cardinal (N, NE, etc.)
  conditions: string;      // e.g., 'Clouds', 'Rain', 'Clear'
  description: string;     // e.g., 'scattered clouds'
  icon: string;            // OpenWeatherMap icon code
  humidity: number;        // percentage
}
