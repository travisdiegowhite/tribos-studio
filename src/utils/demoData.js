// Demo Mode Data - No authentication required
// This provides a realistic experience without needing a real Supabase account

export const DEMO_MODE_KEY = 'cycling_ai_demo_mode';

export const demoUser = {
  id: 'demo-user-id',
  email: 'demo@tribos.studio',
  user_metadata: {
    full_name: 'Demo Rider'
  }
};

export const demoRoutes = [
  {
    id: 'demo-route-1',
    user_id: 'demo-user-id',
    name: 'Morning Hill Climb',
    distance: 42.5,
    elevation_gain: 850,
    duration: 7200, // 2 hours in seconds
    average_speed: 21.25,
    max_speed: 58.3,
    average_power: 245,
    normalized_power: 268,
    average_hr: 152,
    max_hr: 182,
    average_cadence: 85,
    calories: 1250,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    route_polyline: 'sample_polyline_data', // Would contain actual polyline in real scenario
    weather_conditions: { temp: 18, conditions: 'Partly Cloudy' },
    bike_computer_source: 'wahoo',
    notes: 'Great climbing session, felt strong on the hills'
  },
  {
    id: 'demo-route-2',
    user_id: 'demo-user-id',
    name: 'Coastal Recovery Ride',
    distance: 35.2,
    elevation_gain: 220,
    duration: 5400, // 1.5 hours
    average_speed: 23.47,
    max_speed: 45.2,
    average_power: 180,
    normalized_power: 195,
    average_hr: 128,
    max_hr: 145,
    average_cadence: 88,
    calories: 850,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    route_polyline: 'sample_polyline_data',
    weather_conditions: { temp: 22, conditions: 'Sunny' },
    bike_computer_source: 'strava',
    notes: 'Easy spin along the coast, perfect recovery day'
  },
  {
    id: 'demo-route-3',
    user_id: 'demo-user-id',
    name: 'Interval Training Session',
    distance: 28.0,
    elevation_gain: 180,
    duration: 3600, // 1 hour
    average_speed: 28.0,
    max_speed: 52.8,
    average_power: 285,
    normalized_power: 320,
    average_hr: 165,
    max_hr: 188,
    average_cadence: 92,
    calories: 980,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    route_polyline: 'sample_polyline_data',
    weather_conditions: { temp: 16, conditions: 'Overcast' },
    bike_computer_source: 'wahoo',
    notes: '8x3min intervals at threshold, tough but good'
  },
  {
    id: 'demo-route-4',
    user_id: 'demo-user-id',
    name: 'Weekend Long Ride',
    distance: 95.6,
    elevation_gain: 1450,
    duration: 14400, // 4 hours
    average_speed: 23.9,
    max_speed: 62.5,
    average_power: 220,
    normalized_power: 242,
    average_hr: 142,
    max_hr: 175,
    average_cadence: 83,
    calories: 3200,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    route_polyline: 'sample_polyline_data',
    weather_conditions: { temp: 20, conditions: 'Clear' },
    bike_computer_source: 'strava',
    notes: 'Epic century attempt, legs felt great until km 80'
  },
  {
    id: 'demo-route-5',
    user_id: 'demo-user-id',
    name: 'Commute to Work',
    distance: 15.3,
    elevation_gain: 95,
    duration: 2100, // 35 minutes
    average_speed: 26.1,
    max_speed: 42.0,
    average_power: 195,
    normalized_power: 210,
    average_hr: 135,
    max_hr: 158,
    average_cadence: 87,
    calories: 420,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    route_polyline: 'sample_polyline_data',
    weather_conditions: { temp: 14, conditions: 'Light Rain' },
    bike_computer_source: 'wahoo',
    notes: 'Quick commute, beat my PR by 2 minutes!'
  }
];

export const demoStats = {
  total_rides: 5,
  total_distance: 216.6, // km
  total_elevation: 2795, // m
  total_time: 32700, // seconds (9+ hours)
  avg_speed: 24.5,
  avg_power: 225,
  avg_hr: 144,
  total_calories: 6700
};

export const demoPreferences = {
  user_id: 'demo-user-id',
  preferences: {
    units: 'metric',
    theme: 'light',
    default_map_type: 'terrain',
    auto_sync_strava: false,
    auto_sync_wahoo: false
  }
};

// Helper to enable demo mode
export const enableDemoMode = () => {
  localStorage.setItem(DEMO_MODE_KEY, 'true');
};

// Helper to disable demo mode
export const disableDemoMode = () => {
  localStorage.removeItem(DEMO_MODE_KEY);
};

// Check if in demo mode
export const isDemoMode = () => {
  return localStorage.getItem(DEMO_MODE_KEY) === 'true';
};

// Get demo session (mimics Supabase session structure)
export const getDemoSession = () => {
  if (!isDemoMode()) return null;

  return {
    user: demoUser,
    access_token: 'demo-token',
    refresh_token: 'demo-refresh',
    expires_at: Date.now() + 3600000 // 1 hour from now
  };
};
