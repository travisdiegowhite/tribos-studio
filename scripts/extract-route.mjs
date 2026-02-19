/**
 * Extract route polyline from Supabase for the landing page.
 *
 * Usage:
 *   1. Copy your Supabase URL and anon key from your .env file
 *   2. Run: VITE_SUPABASE_URL=xxx VITE_SUPABASE_ANON_KEY=yyy node scripts/extract-route.mjs
 *   3. Copy the output into RouteStep.jsx
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  console.error('Usage: VITE_SUPABASE_URL=xxx VITE_SUPABASE_ANON_KEY=yyy node scripts/extract-route.mjs');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function decodePolyline(encoded) {
  if (!encoded) return [];
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// Downsample to ~150 points for smooth rendering without bloating the bundle
function downsample(coords, targetPoints = 150) {
  if (coords.length <= targetPoints) return coords;
  const step = (coords.length - 1) / (targetPoints - 1);
  const result = [];
  for (let i = 0; i < targetPoints - 1; i++) {
    const idx = Math.round(i * step);
    result.push(coords[idx]);
  }
  result.push(coords[coords.length - 1]); // Always include last point
  return result;
}

async function main() {
  // Search for Erie Gravel ride
  const { data, error } = await supabase
    .from('activities')
    .select('id, name, map_summary_polyline, start_date, distance, total_elevation_gain, moving_time')
    .ilike('name', '%Erie%Gravel%')
    .order('start_date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Query error:', error.message);
    // Try broader search
    const { data: data2, error: error2 } = await supabase
      .from('activities')
      .select('id, name, map_summary_polyline, start_date, distance, total_elevation_gain, moving_time')
      .gte('start_date', '2026-02-13T00:00:00')
      .lte('start_date', '2026-02-15T23:59:59')
      .order('start_date', { ascending: false })
      .limit(5);

    if (error2) {
      console.error('Fallback query error:', error2.message);
      process.exit(1);
    }

    if (!data2 || data2.length === 0) {
      console.error('No activities found for Feb 14');
      process.exit(1);
    }

    console.log('Found activities:');
    data2.forEach(a => console.log(`  ${a.start_date} — ${a.name} (${(a.distance/1609.34).toFixed(1)}mi)`));

    const activity = data2[0];
    outputRoute(activity);
    return;
  }

  if (!data || data.length === 0) {
    console.error('No "Erie Gravel" activities found. Trying date range...');
    // Date range fallback
    const { data: data2 } = await supabase
      .from('activities')
      .select('id, name, map_summary_polyline, start_date, distance, total_elevation_gain, moving_time')
      .gte('start_date', '2026-02-13T00:00:00')
      .lte('start_date', '2026-02-15T23:59:59')
      .order('start_date', { ascending: false })
      .limit(5);

    if (data2 && data2.length > 0) {
      console.log('Found activities for Feb 14:');
      data2.forEach(a => console.log(`  ${a.start_date} — ${a.name} (${(a.distance/1609.34).toFixed(1)}mi)`));
      outputRoute(data2[0]);
    } else {
      console.error('No activities found.');
    }
    return;
  }

  console.log(`Found: ${data[0].name} (${data[0].start_date})`);
  outputRoute(data[0]);
}

function outputRoute(activity) {
  if (!activity.map_summary_polyline) {
    console.error('No polyline data for this activity!');
    return;
  }

  const fullCoords = decodePolyline(activity.map_summary_polyline);
  console.log(`\nDecoded ${fullCoords.length} GPS points`);

  const sampled = downsample(fullCoords, 150);
  console.log(`Downsampled to ${sampled.length} points\n`);

  // Output stats
  const distMi = activity.distance ? (activity.distance / 1609.34).toFixed(1) : '?';
  const elevFt = activity.total_elevation_gain ? Math.round(activity.total_elevation_gain * 3.281) : '?';
  const timeMin = activity.moving_time ? Math.round(activity.moving_time / 60) : '?';
  const timeH = Math.floor(timeMin / 60);
  const timeM = timeMin % 60;

  console.log(`// ${activity.name} — ${distMi} mi, ${elevFt} ft, ${timeH}h ${timeM}m`);
  console.log(`// ${fullCoords.length} GPS points downsampled to ${sampled.length}`);
  console.log(`// Date: ${activity.start_date}\n`);

  console.log('const fullRoute = [');
  sampled.forEach((c, i) => {
    const comma = i < sampled.length - 1 ? ',' : ',';
    console.log(`  [${c[0].toFixed(5)}, ${c[1].toFixed(5)}]${comma}`);
  });
  console.log('];');

  console.log(`\n// Route stats for the landing page:`);
  console.log(`// Distance: ${distMi} mi`);
  console.log(`// Elevation: ${elevFt} ft`);
  console.log(`// Time: ${timeH}h ${String(timeM).padStart(2, '0')}m`);
}

main().catch(console.error);
