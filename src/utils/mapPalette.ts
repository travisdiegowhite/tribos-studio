/**
 * Map colours for the site palette — white paper, black ink, magenta route,
 * lime highlight, one ultramarine accent. No orange or red, so maps match
 * the rest of tribos (see the Design System section of CLAUDE.md).
 */
export const MAP_PALETTE = {
  /** The planned route line — magenta reads on light, dark and satellite tiles. */
  route: '#FF3DB8',
  /** White casing under the route line. */
  casing: '#FFFFFF',
  /** A segment the rider is acting on (clip preview, selection). */
  highlight: '#B6F500',
  ink: '#0A0A14',
  accent: '#2B2BFF',
  muted: '#9C9CAA',
} as const;

/**
 * Route line coloured relative to the rider's comfort level
 * (docs/ROUTING-LANDING-SPEC.md §2). Used on the comfort result views only;
 * everywhere else the route stays `MAP_PALETTE.route`. Keys match
 * `SegmentTone` in comfortValidator.ts. A blocked tone never reaches a
 * returned route; it's ink so a leak would be visible rather than pretty.
 */
export const COMFORT_TONE_COLORS = {
  within: '#00C2FF',
  at: '#2B2BFF',
  flagged: '#FF3DB8',
  unknown: '#9C9CAA',
  blocked: '#0A0A14',
} as const;

export const LIGHT_BASEMAP = 'mapbox://styles/mapbox/light-v11';
export const DARK_BASEMAP = 'mapbox://styles/mapbox/dark-v11';

/**
 * Basemap that matches the current colour scheme: the light Mapbox style on
 * the white page, the dark one in dark mode. Reads Mantine's scheme attribute
 * at render time, so a map picks it up on mount.
 */
export function getBaseMapStyle(): string {
  if (typeof document === 'undefined') return LIGHT_BASEMAP;
  return document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark'
    ? DARK_BASEMAP
    : LIGHT_BASEMAP;
}
