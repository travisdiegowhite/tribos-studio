/**
 * Mapillary street-level imagery (Phase 2, docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md
 * §3.11). Free, crowd-sourced photos along roads. Needs a Mapillary client
 * token (public by design) in VITE_MAPILLARY_TOKEN; without one the feature
 * stays hidden.
 *
 * Coverage comes as vector tiles (`sequence` lines, `image` points from zoom
 * 14); a clicked image's photo and date come from the Graph API.
 */
export function mapillaryToken(): string {
  return String(import.meta.env.VITE_MAPILLARY_TOKEN ?? '').trim();
}

export function mapillaryEnabled(): boolean {
  return mapillaryToken().length > 0;
}

export function mapillaryTileUrl(): string {
  return `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(mapillaryToken())}`;
}

/** Link to the image in Mapillary's own viewer. */
export function mapillaryViewerUrl(imageId: string): string {
  return `https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}`;
}

export interface MapillaryImage {
  id: string;
  thumbUrl: string;
  capturedAt: string | null;
  compassAngle: number | null;
}

/** One image's photo URL and capture date, or null when it can't be fetched. */
export async function fetchMapillaryImage(imageId: string, fetchImpl: typeof fetch = fetch): Promise<MapillaryImage | null> {
  if (!/^\d+$/.test(imageId) || !mapillaryEnabled()) return null;
  try {
    const url =
      `https://graph.mapillary.com/${imageId}` +
      `?fields=id,thumb_1024_url,captured_at,compass_angle&access_token=${encodeURIComponent(mapillaryToken())}`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      id?: string;
      thumb_1024_url?: string;
      captured_at?: number;
      compass_angle?: number;
    };
    if (!data?.thumb_1024_url) return null;
    return {
      id: String(data.id ?? imageId),
      thumbUrl: data.thumb_1024_url,
      capturedAt: typeof data.captured_at === 'number' ? new Date(data.captured_at).toISOString() : null,
      compassAngle: typeof data.compass_angle === 'number' ? data.compass_angle : null,
    };
  } catch {
    return null;
  }
}
