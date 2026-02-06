/**
 * Geocoding Utilities
 *
 * Handles geocoding waypoint names to coordinates using Mapbox and OSM.
 * Extracted from RouteBuilder.jsx for maintainability.
 */

import { matchRouteToOSM } from './osmCyclingService';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Geocode a waypoint name to coordinates
 * Uses OSM for trails/paths (better trail data), falls back to Mapbox.
 * Includes proximity bias and bounding box to constrain results to the user's area.
 *
 * @param {string} waypointName - Name to geocode (e.g. "Springfield", "River Trail")
 * @param {[number, number]} proximityLocation - [lng, lat] for proximity bias
 * @returns {Promise<{coordinates: [number, number], name: string}|null>}
 */
export async function geocodeWaypoint(waypointName, proximityLocation) {
  if (!waypointName || !MAPBOX_TOKEN) return null;

  const isTrailOrPath = waypointName.toLowerCase().includes('path') ||
                        waypointName.toLowerCase().includes('trail') ||
                        waypointName.toLowerCase().includes('creek') ||
                        waypointName.toLowerCase().includes('greenway');

  // For trails/paths, try OSM first since it has better trail data
  if (isTrailOrPath && proximityLocation) {
    try {
      console.log(`🗺️ Trying OSM for trail: "${waypointName}"`);
      const osmMatch = await matchRouteToOSM(
        { name: waypointName },
        { lat: proximityLocation[1], lng: proximityLocation[0] }
      );

      if (osmMatch) {
        console.log(`✅ OSM found "${waypointName}" at: ${osmMatch.name}`);
        return {
          coordinates: [osmMatch.lng, osmMatch.lat], // [lng, lat]
          name: osmMatch.name
        };
      }
    } catch (osmError) {
      console.log(`⚠️ OSM lookup failed for "${waypointName}", trying Mapbox...`);
    }
  }

  // Fall back to Mapbox geocoding
  try {
    // For trails/paths, keep the original name — the proximity bias and
    // bounding box from the user's location will constrain results to
    // the correct region without hardcoding a state name.
    let searchName = waypointName;

    const encodedName = encodeURIComponent(searchName);
    // Prioritize neighborhood and place types - put them first
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedName}.json?access_token=${MAPBOX_TOKEN}&country=US&types=neighborhood,place,locality,poi`;

    // Add proximity bias and bounding box if we have a user location
    if (proximityLocation) {
      url += `&proximity=${proximityLocation[0]},${proximityLocation[1]}`;

      // Add tighter bounding box around the user (about 50 miles / 80km radius)
      const lng = proximityLocation[0];
      const lat = proximityLocation[1];
      const radius = 0.75; // degrees, roughly 50 miles - tighter to avoid far-away matches
      const bbox = `${lng - radius},${lat - radius},${lng + radius},${lat + radius}`;
      url += `&bbox=${bbox}`;
    }

    console.log(`🔍 Geocoding waypoint: "${searchName}"`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      // Score results to find the best match
      const scoredResults = data.features.map(feature => {
        let score = 0;
        const placeName = feature.place_name.toLowerCase();
        // Strip trailing ", State" or ", XX" suffixes for matching (e.g. ", Colorado", ", CA")
        const searchLower = waypointName.toLowerCase().replace(/,\s*\w{2,}$/i, '').trim() || waypointName.toLowerCase().trim();

        // Strong bonus if the place name starts with or closely matches our search term
        if (placeName.startsWith(searchLower)) {
          score += 50;
        } else if (placeName.includes(searchLower + ',')) {
          // The search term is a distinct part of the name (e.g., "Jamestown, State")
          score += 40;
        } else if (placeName.includes(searchLower)) {
          score += 20;
        }

        // Bonus for neighborhood and place types (more likely to be what user means)
        if (feature.place_type?.includes('neighborhood')) score += 30;
        if (feature.place_type?.includes('place')) score += 25;
        if (feature.place_type?.includes('locality')) score += 20;

        // Penalize if the name has extra words before the search term
        const nameWords = feature.text?.toLowerCase().split(/\s+/) || [];
        const searchWords = searchLower.split(/\s+/);
        if (nameWords.length > searchWords.length + 1) {
          score -= 15; // Penalize overly long/complex names
        }

        // Proximity bonus - closer is better
        if (proximityLocation) {
          const [resultLng, resultLat] = feature.center;
          const distance = Math.sqrt(
            Math.pow(resultLng - proximityLocation[0], 2) +
            Math.pow(resultLat - proximityLocation[1], 2)
          );
          // Closer results get higher score (max 20 points for being very close)
          score += Math.max(0, 20 - distance * 20);
        }

        return { feature, score };
      });

      // Sort by score (highest first) and pick the best
      scoredResults.sort((a, b) => b.score - a.score);

      console.log(`📊 Geocoding candidates for "${waypointName}":`,
        scoredResults.slice(0, 3).map(r => `${r.feature.place_name} (score: ${r.score.toFixed(1)})`));

      const bestResult = scoredResults[0];
      const feature = bestResult.feature;

      // Verify the result is reasonably close to the user (within ~100km)
      if (proximityLocation) {
        const [resultLng, resultLat] = feature.center;
        const distance = Math.sqrt(
          Math.pow(resultLng - proximityLocation[0], 2) +
          Math.pow(resultLat - proximityLocation[1], 2)
        );
        // If result is more than 1 degree away (~110km), it's probably wrong
        if (distance > 1) {
          console.warn(`⚠️ Geocoded result for "${waypointName}" is too far away (${distance.toFixed(2)}° from user), skipping`);
          return null;
        }
      }

      console.log(`✅ Geocoded "${waypointName}" to: ${feature.place_name} (score: ${bestResult.score.toFixed(1)})`);
      return {
        coordinates: feature.center, // [lng, lat]
        name: feature.place_name
      };
    } else {
      console.warn(`⚠️ Could not geocode: ${waypointName}`);
      return null;
    }
  } catch (error) {
    console.error(`Geocoding error for ${waypointName}:`, error);
    return null;
  }
}
