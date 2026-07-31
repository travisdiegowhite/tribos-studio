/**
 * Mapbox Static Images URL builder for the activity share card.
 *
 * Follows the precedent in src/pages/MyRoutes.jsx (routeThumbUrl). We pass
 * `logo=false&attribution=false` ONLY because the card renderer bakes
 * "© Mapbox © OpenStreetMap" text onto the image itself — Mapbox's static
 * image terms require attribution on or alongside the image, and a card
 * posted to social media leaves the app, so it must carry its own credit.
 */
import { downsampleCoords, encodePolyline, type LngLat } from './geometry';

export type CardTheme = 'dark' | 'light';

/** Static Images URLs beyond ~8k chars fail — stay safely under. */
const MAX_URL_LENGTH = 7500;

/** Point budgets tried in order until the URL fits. */
const POINT_BUDGETS = [90, 60, 40, 25];

const STYLE_BY_THEME: Record<CardTheme, string> = {
  dark: 'dark-v11',
  light: 'outdoors-v12',
};

/** Route line: teal, 4px, fully opaque — matches the brand route color. */
const PATH_STYLE = 'path-4+2A8C82-1';

export interface ShareMapUrlOptions {
  coords: LngLat[];
  theme: CardTheme;
  /** Requested image width in px (Static API caps at 1280; @2x doubles output). */
  width_px: number;
  height_px: number;
}

/**
 * Build a Static Images URL for the (already privacy-trimmed) route, or null
 * when there aren't enough points to draw a line or no token is configured.
 */
export function buildShareMapUrl({ coords, theme, width_px, height_px }: ShareMapUrlOptions): string | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) return null;

  const style = STYLE_BY_THEME[theme] ?? STYLE_BY_THEME.dark;

  for (const budget of POINT_BUDGETS) {
    const encoded = encodePolyline(downsampleCoords(coords, budget));
    if (!encoded) return null;
    const path = `${PATH_STYLE}(${encodeURIComponent(encoded)})`;
    const url =
      `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${path}/auto/${width_px}x${height_px}@2x` +
      `?padding=40&access_token=${token}&logo=false&attribution=false`;
    if (url.length <= MAX_URL_LENGTH) return url;
  }
  return null;
}
