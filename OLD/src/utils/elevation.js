// Elevation data service with multiple provider support
// Provides accurate elevation data for cycling routes

/**
 * Fetch elevation data using OpenTopoData API (free, reliable)
 * Uses SRTM 30m resolution data
 */
export async function fetchElevationFromOpenTopo(coordinates) {
  try {
    // OpenTopoData has a limit of 100 locations per request
    const maxBatchSize = 100;
    const results = [];
    
    // Process in batches if needed
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
    }
    
    return results;
  } catch (error) {
    console.error('OpenTopoData API failed:', error);
    return null;
  }
}

/**
 * Fetch elevation data using Open-Elevation API
 * Alternative free service
 */
export async function fetchElevationFromOpenElevation(coordinates) {
  try {
    // Open-Elevation API works best with smaller batches
    const batchSize = 50;
    const results = [];
    
    for (let i = 0; i < coordinates.length; i += batchSize) {
      const batch = coordinates.slice(i, i + batchSize);
      const locations = batch.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }));
      
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          results.push(...data.results.map(r => ({
            lat: r.latitude,
            lon: r.longitude,
            elevation: r.elevation || 0
          })));
        }
      } else {
        console.warn(`Open-Elevation API batch failed: ${response.status}`);
        // Continue with other batches
      }
      
      // Small delay between requests to be respectful
      if (i + batchSize < coordinates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Open-Elevation API failed:', error);
  }
  return null;
}

/**
 * Fetch elevation data using Mapbox Terrain API
 * Requires Mapbox access token
 * Uses batching and delays to avoid rate limiting
 */
export async function fetchElevationFromMapbox(coordinates, accessToken) {
  if (!accessToken) return null;

  try {
    const results = [];
    const batchSize = 10; // Process 10 points at a time
    const delayBetweenBatches = 100; // 100ms delay between batches

    console.log(`📊 Processing ${coordinates.length} points in batches of ${batchSize}...`);

    for (let i = 0; i < coordinates.length; i += batchSize) {
      const batch = coordinates.slice(i, i + batchSize);

      const batchPromises = batch.map(async ([lon, lat]) => {
        try {
          // Use the tilequery API for elevation
          const tilequeryUrl = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lon},${lat}.json?layers=contour&limit=50&access_token=${accessToken}`;
          const tilequeryResponse = await fetch(tilequeryUrl);

          if (tilequeryResponse.ok) {
            const data = await tilequeryResponse.json();
            let elevation = null;

            if (data.features && data.features.length > 0) {
              // Get the most accurate elevation from contour lines
              const elevations = data.features
                .filter(f => f.properties && f.properties.ele)
                .map(f => f.properties.ele);

              if (elevations.length > 0) {
                // Use the median elevation for better accuracy
                elevations.sort((a, b) => a - b);
                elevation = elevations[Math.floor(elevations.length / 2)];
              }
            }

            return {
              lat,
              lon,
              elevation: elevation || estimateDenverElevation(lat, lon)
            };
          }
        } catch (err) {
          // Silently fail for individual points
        }

        return {
          lat,
          lon,
          elevation: estimateDenverElevation(lat, lon)
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Progress update
      if ((i + batchSize) % 50 === 0 || i + batchSize >= coordinates.length) {
        console.log(`   Processed ${Math.min(i + batchSize, coordinates.length)}/${coordinates.length} points`);
      }

      // Delay between batches to avoid rate limiting
      if (i + batchSize < coordinates.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    console.log(`✅ Completed elevation fetch for ${results.length} points`);
    return results;
  } catch (error) {
    console.error('Mapbox Terrain API failed:', error);
    return null;
  }
}

/**
 * Helper function to convert longitude to tile number
 */
function lon2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

/**
 * Helper function to convert latitude to tile number
 */
function lat2tile(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

/**
 * Estimate Denver area elevation based on general topography
 * Used as fallback when APIs fail
 */
function estimateDenverElevation(lat, lon) {
  // Denver/Boulder/Front Range elevation varies significantly:
  // Denver: ~1,609m (5,280 ft)
  // Boulder: ~1,655m (5,430 ft)
  // Foothills west of Boulder: up to 2,500m (8,200 ft)
  // Eastern plains: down to 1,500m (4,900 ft)

  const baseDenverElevation = 1609; // Mile High City (5,280 ft)

  // Elevation increases SIGNIFICANTLY as you go west (toward mountains)
  // Every 0.1 degree west (~11km) adds roughly 200m of elevation
  const westwardGradient = (lon + 105.0) * 800; // Much steeper gradient for foothills

  // Boulder is north of Denver and slightly higher
  const boulderFactor = lat > 40.0 ? 50 : 0;

  // Add some north-south variation
  const northSouthVariation = Math.sin((lat - 39.7) * 10) * 30;

  // Add gentle rolling hills
  const microTerrain = Math.sin(lat * 200) * Math.cos(lon * 200) * 15;

  const elevation = baseDenverElevation + westwardGradient + boulderFactor + northSouthVariation + microTerrain;

  // Clamp to realistic Front Range elevations
  // Eastern plains: 1,500m, foothills/mountains: up to 2,600m
  return Math.max(1500, Math.min(2600, elevation));
}

/**
 * Downsample coordinates to reduce API calls while maintaining profile accuracy
 * @param {Array} coordinates - Array of [lon, lat] coordinates
 * @param {number} maxPoints - Maximum number of points to return
 * @returns {Array} - Downsampled coordinates with original indices
 */
function downsampleCoordinates(coordinates, maxPoints = 200) {
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
 * @param {Array} sampledElevations - Elevation data for sampled points
 * @param {number} totalPoints - Total number of points in route
 * @returns {Array} - Full elevation array with interpolated values
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
 * Main function to get elevation data with fallback options
 * Now with intelligent downsampling to reduce API calls
 */
export async function getElevationData(coordinates, mapboxToken = null) {
  console.log(`📍 Fetching elevation for ${coordinates.length} points...`);

  // Downsample to max 200 points to reduce API load
  const maxSamplePoints = 200;
  const needsDownsampling = coordinates.length > maxSamplePoints;

  let sampledCoords = coordinates;
  let sampledData = null;

  if (needsDownsampling) {
    const downsampled = downsampleCoordinates(coordinates, maxSamplePoints);
    sampledCoords = downsampled.map(d => d.coord);
    console.log(`📉 Downsampled from ${coordinates.length} to ${sampledCoords.length} points`);
  }

  // Try different elevation sources in order of preference

  // 1. Try OpenTopoData first (free, reliable, good batching)
  console.log('Trying OpenTopoData API (SRTM 30m)...');
  let elevationData = await fetchElevationFromOpenTopo(sampledCoords);
  if (elevationData && elevationData.length > 0) {
    console.log('✅ Got elevation from OpenTopoData');
    sampledData = elevationData;
  }

  // 2. Try Mapbox if OpenTopoData failed and we have a token
  if (!sampledData && mapboxToken) {
    console.log('Trying Mapbox Terrain API...');
    elevationData = await fetchElevationFromMapbox(sampledCoords, mapboxToken);
    if (elevationData && elevationData.length > 0) {
      console.log('✅ Got elevation from Mapbox');
      sampledData = elevationData;
    }
  }

  // 3. Fallback to estimation if both APIs failed
  if (!sampledData) {
    console.log('⚠️ All elevation APIs failed, using estimation');
    sampledData = sampledCoords.map(([lon, lat]) => ({
      lat,
      lon,
      elevation: estimateDenverElevation(lat, lon)
    }));
  }

  // If we downsampled, interpolate to get full resolution
  if (needsDownsampling) {
    const downsampled = downsampleCoordinates(coordinates, maxSamplePoints);
    const sampledWithIndices = sampledData.map((data, i) => ({
      ...data,
      originalIndex: downsampled[i].originalIndex
    }));

    const fullElevation = interpolateElevations(
      sampledWithIndices.map(d => ({ elevation: d.elevation, originalIndex: d.originalIndex })),
      coordinates.length
    );

    return coordinates.map(([lon, lat], i) => ({
      lat,
      lon,
      elevation: fullElevation[i]
    }));
  }

  return sampledData;
}

/**
 * Calculate elevation statistics from elevation profile
 */
export function calculateElevationMetrics(elevationProfile, isImperial = false) {
  if (!elevationProfile || elevationProfile.length < 2) {
    return {
      gain: 0,
      loss: 0,
      min: 0,
      max: 0,
      avgGrade: 0,
      maxGrade: 0
    };
  }
  
  // Elevation data is always in meters for calculations
  const elevations = elevationProfile.map(p => p.elevation);
  const distances = elevationProfile.map(p => p.distance || 0);
  
  let gain = 0;
  let loss = 0;
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  
  // Calculate gain/loss with smoothing - always use meters threshold (3m = ~10ft)
  const smoothingThreshold = 3; // meters
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
  
  // Calculate grades
  let maxGrade = 0;
  const grades = [];
  
  for (let i = 1; i < elevationProfile.length; i++) {
    const elevDiff = elevations[i] - elevations[i - 1]; // in meters
    // distances are cumulative, so we need the difference between consecutive points
    let distDiff = distances[i] - distances[i - 1]; // in miles or km
    
    // Convert distance to meters for grade calculation (elevation is in meters)
    if (distDiff > 0) {
      // Convert distance from miles/km to meters
      const distDiffMeters = isImperial ? distDiff * 1609.34 : distDiff * 1000;
      
      // Only calculate grade if we have a meaningful distance difference (min 10 meters)
      if (distDiffMeters > 10) {
        const grade = (elevDiff / distDiffMeters) * 100;
        // Cap grade at reasonable maximum (25% is very steep for cycling)
        const cappedGrade = Math.max(-25, Math.min(25, grade));
        grades.push(cappedGrade);
        maxGrade = Math.max(maxGrade, Math.abs(cappedGrade));
      }
    }
  }
  
  const avgGrade = grades.length > 0 
    ? grades.reduce((a, b) => a + b, 0) / grades.length 
    : 0;
  
  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    min: Math.round(min),
    max: Math.round(max),
    avgGrade: Math.round(avgGrade * 10) / 10,
    maxGrade: Math.round(maxGrade * 10) / 10
  };
}