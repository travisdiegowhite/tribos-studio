/**
 * Encode coordinates as a Google/Mapbox polyline (precision 5), with even
 * downsampling to a point budget. Used to compute `routes.thumb_polyline`
 * (migration 104) at save time so the library can render Static Images
 * thumbnails without loading full geometry per row.
 */

/**
 * @param {Array<[number, number]>} coordinates - [lng, lat] pairs (a third
 *   elevation element is ignored)
 * @param {number} maxPoints - Even-sample budget (Static Images URLs have
 *   length limits; 60 points ≈ 350 chars encoded)
 * @returns {string|null}
 */
export function encodeThumbPolyline(coordinates, maxPoints = 60) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const n = coordinates.length;
  const k = Math.min(maxPoints, n);
  const sampled = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (n - 1)) / (k - 1));
    const c = coordinates[idx];
    if (!Array.isArray(c) || c.length < 2) return null;
    sampled.push(c);
  }

  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const [lng, lat] of sampled) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    output += encodeSigned(latE5 - prevLat) + encodeSigned(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }
  return output;
}

function encodeSigned(value) {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}

export default { encodeThumbPolyline };
