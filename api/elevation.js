// Elevation API proxy - fetches elevation data from OpenTopoData
// This avoids CORS issues by proxying the request through our server

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { coordinates } = req.body;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Limit to 100 points per request (OpenTopoData limit)
    const maxPoints = 100;
    const limitedCoords = coordinates.slice(0, maxPoints);

    // Format coordinates for OpenTopoData API: lat,lon|lat,lon|...
    const locations = limitedCoords
      .map(([lon, lat]) => `${lat},${lon}`)
      .join('|');

    const url = `https://api.opentopodata.org/v1/srtm30m?locations=${locations}`;

    console.log(`[elevation] Fetching ${limitedCoords.length} points from OpenTopoData`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[elevation] OpenTopoData error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Elevation API error',
        details: errorText
      });
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('[elevation] OpenTopoData returned non-OK status:', data);
      return res.status(500).json({ error: 'Elevation API returned error', details: data });
    }

    // Transform results to our format
    const results = data.results.map(r => ({
      lat: r.location.lat,
      lon: r.location.lng,
      elevation: r.elevation || 0
    }));

    console.log(`[elevation] Successfully fetched ${results.length} elevation points`);

    return res.status(200).json({
      success: true,
      results,
      source: 'opentopodata'
    });

  } catch (error) {
    console.error('[elevation] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch elevation data',
      message: error.message
    });
  }
}
