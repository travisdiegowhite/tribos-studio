/**
 * Client-side photo downscale for uploads.
 *
 * A phone photo is 4–12 MB; the gear-photos bucket caps objects at 5 MB,
 * Claude caps an image at 5 MB, and detail (sidewall text, sprocket count)
 * plateaus well under 1,600 px on the long edge. So we resize in the browser
 * and upload a JPEG, which also strips EXIF (location, device) before the
 * bytes ever leave the phone.
 */

const DEFAULT_MAX_EDGE_PX = 1600;
const DEFAULT_QUALITY = 0.85;

/**
 * @param {File|Blob} file
 * @param {{ maxEdgePx?: number, quality?: number }} [opts]
 * @returns {Promise<Blob>} image/jpeg
 */
export async function resizeImageFile(file, opts = {}) {
  const maxEdge = opts.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const source = await loadImageSource(file);
  const { width, height } = source;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(source, 0, 0, targetW, targetH);
  if (typeof source.close === 'function') source.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality);
  });
  return blob;
}

/**
 * Decode a File into something drawImage accepts. createImageBitmap honours
 * EXIF orientation on modern browsers; the <img> fallback covers the rest.
 */
async function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
  } finally {
    // Revoke after the draw; the caller draws synchronously after resolve.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
