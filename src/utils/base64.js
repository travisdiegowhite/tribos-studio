// Browser-safe base64 encoding for binary buffers.
// Naive String.fromCharCode(...bytes) overflows the call stack on files
// larger than ~65k bytes (which includes every real FIT file), so chunk
// through the buffer before handing it to btoa().

const CHUNK_SIZE = 0x8000; // 32 KiB per String.fromCharCode call

/**
 * Encode an ArrayBuffer (or Uint8Array) as a base64 string.
 * Safe for multi-megabyte binary blobs.
 */
export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

export default arrayBufferToBase64;
