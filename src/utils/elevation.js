// Elevation data service with multiple provider support
// Provides accurate elevation data for cycling routes

/**
 * Fetch elevation data using OpenTopoData API (free, reliable)
 * Uses SRTM 30m resolution data
 */
async function fetchElevationFromOpenTopo(coordinates) {
  try {
    // OpenTopoData has a limit of 100 locations per request
    const maxBatchSize = 100;
    const results = [];

    for (let i = 0; i < coordinates.length; i += maxBatchSize) {
      const batch = coordinates.slice(i, i + maxBatchSize);
      const locations = batch.map(([lon, lat]) => `${lat},${lon}`).join('|');

      const url = `https://api.opentopodata.org/v1/srtm30m?locations=${locations}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results) {
          results.push(...data.results.map(r => ({
            lat: r.location.lat,
            lon: r.location.lng,
            elevation: r.elevation || 0
          })));
        }
      }

      // Small delay between batches to be respectful to the API
      if (i + maxBatchSize < coordinates.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('OpenTopoData API failed:', error);
    return null;
  }
}

/**
 * Downsample coordinates to reduce API calls while maintaining profile accuracy
 */
function downsampleCoordinates(coordinates, maxPoints = 150) {
  if (coordinates.length <= maxPoints) {
    return coordinates.map((coord, i) => ({ coord, originalIndex: i }));
  }

  const downsampled = [];
  const step = (coordinates.length - 1) / (maxPoints - 1);

  // Always include first point
  downsampled.push({ coord: coordinates[0], originalIndex: 0 });

  // Sample points at regular intervals
  for (let i = 1; i < maxPoints - 1; i++) {
    const index = Math.round(i * step);
    downsampled.push({ coord: coordinates[index], originalIndex: index });
  }

  // Always include last point
  const lastIndex = coordinates.length - 1;
  downsampled.push({ coord: coordinates[lastIndex], originalIndex: lastIndex });

  return downsampled;
}

/**
 * Interpolate elevation for all points based on sampled points
 */
function interpolateElevations(sampledElevations, totalPoints) {
  const fullElevation = new Array(totalPoints);

  // Fill in the sampled points
  sampledElevations.forEach(point => {
    fullElevation[point.originalIndex] = point.elevation;
  });

  // Interpolate missing points
  let lastKnownIndex = 0;
  for (let i = 1; i < totalPoints; i++) {
    if (fullElevation[i] === undefined) {
      // Find next known point
      let nextKnownIndex = i + 1;
      while (nextKnownIndex < totalPoints && fullElevation[nextKnownIndex] === undefined) {
        nextKnownIndex++;
      }

      if (nextKnownIndex < totalPoints) {
        // Linear interpolation
        const startElev = fullElevation[lastKnownIndex];
        const endElev = fullElevation[nextKnownIndex];
        const range = nextKnownIndex - lastKnownIndex;
        const position = i - lastKnownIndex;
        fullElevation[i] = startElev + (endElev - startElev) * (position / range);
      } else {
        // Use last known elevation
        fullElevation[i] = fullElevation[lastKnownIndex];
      }
    } else {
      lastKnownIndex = i;
    }
  }

  return fullElevation;
}

/**
 * Calculate cumulative distances along a route (in km)
 */
export function calculateCumulativeDistances(coordinates) {
  const distances = [0];
  let totalDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];

    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const segmentDistance = R * c;

    totalDistance += segmentDistance;
    distances.push(totalDistance);
  }

  return distances;
}

/**
 * Main function to get elevation data for a route
 * Returns array of { distance, elevation, lat, lon } objects
 */
export async function getElevationData(coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  console.log(`📍 Fetching elevation for ${coordinates.length} points...`);

  // Downsample for API efficiency
  const maxSamplePoints = 150;
  const needsDownsampling = coordinates.length > maxSamplePoints;

  let sampledCoords = coordinates;
  let downsampledData = null;

  if (needsDownsampling) {
    downsampledData = downsampleCoordinates(coordinates, maxSamplePoints);
    sampledCoords = downsampledData.map(d => d.coord);
    console.log(`📉 Downsampled from ${coordinates.length} to ${sampledCoords.length} points`);
  }

  // Fetch elevation from OpenTopoData
  console.log('🏔️ Fetching elevation from OpenTopoData...');
  const elevationData = await fetchElevationFromOpenTopo(sampledCoords);

  if (!elevationData || elevationData.length === 0) {
    console.warn('⚠️ Failed to fetch elevation data');
    return null;
  }

  console.log(`✅ Got elevation data for ${elevationData.length} points`);

  // Calculate distances
  const distances = calculateCumulativeDistances(coordinates);

  // If we downsampled, interpolate to get full resolution
  if (needsDownsampling && downsampledData) {
    const sampledWithIndices = elevationData.map((data, i) => ({
      ...data,
      originalIndex: downsampledData[i].originalIndex
    }));

    const fullElevation = interpolateElevations(
      sampledWithIndices.map(d => ({ elevation: d.elevation, originalIndex: d.originalIndex })),
      coordinates.length
    );

    return coordinates.map(([lon, lat], i) => ({
      distance: distances[i],
      elevation: fullElevation[i],
      lat,
      lon
    }));
  }

  // No downsampling needed
  return elevationData.map((data, i) => ({
    distance: distances[i],
    elevation: data.elevation,
    lat: data.lat,
    lon: data.lon
  }));
}

/**
 * Calculate elevation statistics from elevation profile
 */
export function calculateElevationStats(elevationProfile) {
  if (!elevationProfile || elevationProfile.length < 2) {
    return { gain: 0, loss: 0, min: 0, max: 0 };
  }

  const elevations = elevationProfile.map(p => p.elevation);

  let gain = 0;
  let loss = 0;
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);

  // Calculate gain/loss with smoothing threshold (3m to filter noise)
  const smoothingThreshold = 3;
  let lastSignificantElevation = elevations[0];

  for (let i = 1; i < elevations.length; i++) {
    const elevationChange = elevations[i] - lastSignificantElevation;

    if (Math.abs(elevationChange) >= smoothingThreshold) {
      if (elevationChange > 0) {
        gain += elevationChange;
      } else {
        loss += Math.abs(elevationChange);
      }
      lastSignificantElevation = elevations[i];
    }
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    min: Math.round(min),
    max: Math.round(max)
  };
}
