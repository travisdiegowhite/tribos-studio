/**
 * Training Data Query Tool Handler
 *
 * Processes query_training_data tool calls from the AI coach,
 * enabling ad hoc questions about the athlete's activity history.
 *
 * Examples:
 * - "How many bike commutes did I do last year?"
 * - "How many times did I cross the Golden Gate Bridge?"
 * - "What's my road vs gravel mileage split this year?"
 */

import { createClient } from '@supabase/supabase-js';
import { routePassesNear } from './polylineDecode.js';

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;

/**
 * Geocode a place name to coordinates using Mapbox Geocoding API.
 *
 * @param {string} placeName - Place name to geocode
 * @returns {Promise<{latitude: number, longitude: number, resolved_name: string}|null>}
 */
async function geocodePlace(placeName) {
  if (!placeName || !MAPBOX_ACCESS_TOKEN) return null;

  try {
    const encoded = encodeURIComponent(placeName);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=poi,neighborhood,place,locality,address&limit=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [lng, lat] = feature.center;
      return {
        latitude: lat,
        longitude: lng,
        resolved_name: feature.place_name
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Resolve relative date strings to ISO date strings.
 *
 * @param {string} dateStr - ISO date or relative string
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function resolveDate(dateStr) {
  if (!dateStr) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }

  const now = new Date();
  const lower = dateStr.toLowerCase().replace(/\s+/g, '_');

  switch (lower) {
    case 'last_year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      d.setMonth(0, 1);
      return d.toISOString().split('T')[0];
    }
    case 'this_year':
    case 'ytd': {
      const d = new Date(now.getFullYear(), 0, 1);
      return d.toISOString().split('T')[0];
    }
    case 'last_year_end': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      d.setMonth(11, 31);
      return d.toISOString().split('T')[0];
    }
    default: {
      // Handle patterns like "6_months_ago", "3_months_ago", "1_year_ago", "52_weeks_ago"
      const match = lower.match(/^(\d+)_(month|months|week|weeks|year|years|day|days)_ago$/);
      if (match) {
        const amount = parseInt(match[1], 10);
        const unit = match[2].replace(/s$/, '');
        const d = new Date(now);
        if (unit === 'month') d.setMonth(d.getMonth() - amount);
        else if (unit === 'week') d.setDate(d.getDate() - amount * 7);
        else if (unit === 'year') d.setFullYear(d.getFullYear() - amount);
        else if (unit === 'day') d.setDate(d.getDate() - amount);
        return d.toISOString().split('T')[0];
      }
      return dateStr;
    }
  }
}

/**
 * Handle a training data query from the AI coach.
 *
 * @param {string} userId - The user's ID
 * @param {Object} params - Tool parameters from Claude
 * @returns {Object} Query results for the AI to interpret
 */
export async function handleTrainingDataQuery(userId, params) {
  console.log(`📋 Training data query for user ${userId}:`, JSON.stringify(params));

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const {
    filters = {},
    aggregation = 'count',
    group_by = 'none',
    limit = 10,
    sort_by = 'start_date',
    sort_order = 'desc'
  } = params;

  try {
    // Resolve date filters
    const dateFrom = resolveDate(filters.date_from);
    const dateTo = resolveDate(filters.date_to);

    // Geocode location if needed
    let geoLocation = null;
    if (filters.near_location?.place_name) {
      geoLocation = await geocodePlace(filters.near_location.place_name);
      if (!geoLocation) {
        return {
          success: false,
          error: `Could not find location: "${filters.near_location.place_name}". Try a more specific name (e.g., "Golden Gate Bridge, San Francisco").`
        };
      }
      console.log(`📍 Geocoded "${filters.near_location.place_name}" to ${geoLocation.latitude}, ${geoLocation.longitude} (${geoLocation.resolved_name})`);
    }

    // Determine which columns to fetch
    const isGeoQuery = !!geoLocation;
    const needsFullActivities = aggregation === 'list_activities' || isGeoQuery;

    // Build the select columns based on what we need
    let selectColumns = 'id, type, sport_type, start_date, distance, moving_time, total_elevation_gain, average_watts, average_speed, average_heartrate, commute, trainer, name';
    if (isGeoQuery) {
      selectColumns += ', map_summary_polyline';
    }

    // Build Supabase query
    let query = supabase
      .from('activities')
      .select(selectColumns)
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null);

    // Apply date filters
    if (dateFrom) {
      query = query.gte('start_date', `${dateFrom}T00:00:00Z`);
    }
    if (dateTo) {
      query = query.lte('start_date', `${dateTo}T23:59:59Z`);
    }

    // Apply type filter
    if (filters.activity_types && filters.activity_types.length > 0) {
      query = query.in('type', filters.activity_types);
    }

    // Apply commute filter
    if (filters.commute === true) {
      query = query.eq('commute', true);
    } else if (filters.commute === false) {
      query = query.eq('commute', false);
    }

    // Apply trainer filter
    if (filters.trainer === true) {
      query = query.eq('trainer', true);
    } else if (filters.trainer === false) {
      query = query.eq('trainer', false);
    }

    // Apply name search (case-insensitive)
    if (filters.name_contains) {
      query = query.ilike('name', `%${filters.name_contains}%`);
    }

    // Apply distance filters (convert km to meters for DB)
    if (filters.min_distance_km) {
      query = query.gte('distance', filters.min_distance_km * 1000);
    }
    if (filters.max_distance_km) {
      query = query.lte('distance', filters.max_distance_km * 1000);
    }

    // Apply sort
    const sortColumn = {
      'start_date': 'start_date',
      'distance': 'distance',
      'duration': 'moving_time',
      'elevation_gain': 'total_elevation_gain'
    }[sort_by] || 'start_date';

    query = query.order(sortColumn, { ascending: sort_order === 'asc' });

    // For geographic queries, we need all matching activities to filter by location.
    // For non-geo queries with list_activities, limit at DB level.
    if (!isGeoQuery && aggregation === 'list_activities') {
      query = query.limit(Math.min(limit, 50));
    }

    const { data: activities, error } = await query;

    if (error) throw error;

    if (!activities || activities.length === 0) {
      return {
        success: true,
        result: aggregation === 'count' ? { count: 0 } : { value: 0 },
        total_activities_matched: 0,
        summary: 'No activities found matching these criteria.'
      };
    }

    // Apply geographic filter if needed
    let filteredActivities = activities;
    if (isGeoQuery) {
      const radiusKm = filters.near_location?.radius_km || 0.5;
      filteredActivities = activities.filter(a => {
        if (!a.map_summary_polyline) return false;
        return routePassesNear(
          a.map_summary_polyline,
          geoLocation.latitude,
          geoLocation.longitude,
          radiusKm
        );
      });

      console.log(`📍 Geographic filter: ${filteredActivities.length}/${activities.length} activities pass near ${geoLocation.resolved_name}`);

      if (filteredActivities.length === 0) {
        return {
          success: true,
          result: { count: 0 },
          geocoded_location: geoLocation,
          total_activities_matched: 0,
          summary: `No activities found passing within ${radiusKm}km of ${geoLocation.resolved_name}.`
        };
      }
    }

    // Apply aggregation and grouping
    const result = applyAggregation(filteredActivities, aggregation, group_by, limit);

    const response = {
      success: true,
      result,
      total_activities_matched: filteredActivities.length
    };

    if (geoLocation) {
      response.geocoded_location = geoLocation;
    }

    // Generate a concise summary
    response.summary = generateSummary(result, aggregation, group_by, filteredActivities.length, geoLocation);

    console.log(`📋 Training data query result:`, JSON.stringify(response.summary));
    return response;

  } catch (error) {
    console.error('Training data query error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Apply aggregation and optional grouping to activities.
 */
function applyAggregation(activities, aggregation, groupBy, limit) {
  if (groupBy && groupBy !== 'none') {
    return applyGroupedAggregation(activities, aggregation, groupBy);
  }

  return applySingleAggregation(activities, aggregation, limit);
}

/**
 * Apply aggregation without grouping.
 */
function applySingleAggregation(activities, aggregation, limit) {
  switch (aggregation) {
    case 'count':
      return { count: activities.length };

    case 'sum_distance_km':
      return {
        value: round2(activities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000),
        unit: 'km'
      };

    case 'sum_duration_hours':
      return {
        value: round2(activities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600),
        unit: 'hours'
      };

    case 'sum_elevation_m':
      return {
        value: Math.round(activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0)),
        unit: 'meters'
      };

    case 'avg_distance_km':
      return {
        value: round2(activities.reduce((sum, a) => sum + (a.distance || 0), 0) / activities.length / 1000),
        unit: 'km'
      };

    case 'avg_duration_hours':
      return {
        value: round2(activities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / activities.length / 3600),
        unit: 'hours'
      };

    case 'avg_speed_kph':
      return {
        value: round2(activities.reduce((sum, a) => sum + (a.average_speed || 0), 0) / activities.length * 3.6),
        unit: 'km/h'
      };

    case 'avg_power_watts': {
      const withPower = activities.filter(a => a.average_watts > 0);
      if (withPower.length === 0) return { value: 0, unit: 'watts', note: 'No power data available' };
      return {
        value: Math.round(withPower.reduce((sum, a) => sum + a.average_watts, 0) / withPower.length),
        unit: 'watts',
        activities_with_power: withPower.length
      };
    }

    case 'list_activities':
      return {
        activities: activities.slice(0, Math.min(limit, 50)).map(formatActivity)
      };

    default:
      return { count: activities.length };
  }
}

/**
 * Apply aggregation with grouping.
 */
function applyGroupedAggregation(activities, aggregation, groupBy) {
  // Group activities
  const groups = {};
  for (const activity of activities) {
    const key = getGroupKey(activity, groupBy);
    if (!groups[key]) groups[key] = [];
    groups[key].push(activity);
  }

  // Aggregate within each group
  const groupResults = Object.entries(groups).map(([key, groupActivities]) => {
    const agg = applySingleAggregation(groupActivities, aggregation, 50);
    return {
      group: key,
      ...agg,
      activity_count: groupActivities.length
    };
  });

  // Sort groups by value (descending) for sum/avg aggregations, by group key for time-based grouping
  if (['month', 'week', 'year'].includes(groupBy)) {
    groupResults.sort((a, b) => a.group.localeCompare(b.group));
  } else {
    groupResults.sort((a, b) => (b.value || b.count || 0) - (a.value || a.count || 0));
  }

  // Calculate total for percentage context
  let total = null;
  if (aggregation === 'sum_distance_km' || aggregation === 'sum_duration_hours' || aggregation === 'sum_elevation_m') {
    total = round2(groupResults.reduce((sum, g) => sum + (g.value || 0), 0));
  } else if (aggregation === 'count') {
    total = groupResults.reduce((sum, g) => sum + (g.count || 0), 0);
  }

  return { groups: groupResults, total };
}

/**
 * Get the group key for an activity based on the group_by parameter.
 */
function getGroupKey(activity, groupBy) {
  switch (groupBy) {
    case 'type':
      return activity.type || 'Unknown';
    case 'month': {
      const d = new Date(activity.start_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    case 'week': {
      const d = new Date(activity.start_date);
      const dayOfWeek = d.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + mondayOffset);
      return monday.toISOString().split('T')[0];
    }
    case 'year': {
      return new Date(activity.start_date).getFullYear().toString();
    }
    case 'commute':
      return activity.commute ? 'Commute' : 'Non-commute';
    default:
      return 'all';
  }
}

/**
 * Format an activity for the list_activities response.
 */
function formatActivity(a) {
  return {
    name: a.name,
    type: a.type,
    date: a.start_date ? new Date(a.start_date).toISOString().split('T')[0] : null,
    distance_km: round2((a.distance || 0) / 1000),
    duration_hours: round2((a.moving_time || 0) / 3600),
    elevation_m: Math.round(a.total_elevation_gain || 0),
    avg_watts: a.average_watts || null,
    avg_speed_kph: a.average_speed ? round2(a.average_speed * 3.6) : null,
    commute: a.commute || false
  };
}

/**
 * Generate a human-readable summary of the query results.
 */
function generateSummary(result, aggregation, groupBy, totalMatched, geoLocation) {
  const locationNote = geoLocation ? ` near ${geoLocation.resolved_name}` : '';

  if (result.groups) {
    const groupLines = result.groups.map(g => {
      if (aggregation === 'count') return `${g.group}: ${g.count}`;
      return `${g.group}: ${g.value} ${g.unit || ''}`;
    }).join(', ');
    return `${totalMatched} activities matched${locationNote}. By ${groupBy}: ${groupLines}. Total: ${result.total}`;
  }

  if (aggregation === 'count') {
    return `${result.count} activities found${locationNote}.`;
  }

  if (aggregation === 'list_activities') {
    return `${totalMatched} activities found${locationNote}. Showing ${result.activities.length}.`;
  }

  return `${aggregation}: ${result.value} ${result.unit || ''}${locationNote} (${totalMatched} activities).`;
}

function round2(num) {
  return Math.round(num * 100) / 100;
}
