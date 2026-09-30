/**
 * Brand tokens for the Today surfaces (spine + glance). Every value is a CSS
 * variable from src/styles/global.css, so Today follows the theme — light
 * paper or the dark ink page — like the rest of the app. Zero border radius
 * everywhere; Tribos Display headings, Courier Prime data, Archivo body.
 *
 * These strings work anywhere CSS does: inline styles, template-literal
 * borders, and SVG fill/stroke attributes. Mapbox paint properties can't read
 * CSS variables — use MAP_COLORS there.
 */

export const C = {
  base: 'var(--color-bg)',
  secondary: 'var(--color-bg-secondary)',
  border: 'var(--color-border)',
  card: 'var(--color-card)',
  text: 'var(--color-text-primary)',
  text2: 'var(--color-text-secondary)',
  text3: 'var(--color-text-muted)',
  teal: 'var(--color-ink)', // primary / CTA / emphasis (legacy key → ink)
  orange: 'var(--color-signal)', // effort / interval work segments (→ signal)
  gold: 'var(--color-done)', // achievement / ridden (→ done, moss)
  coral: 'var(--color-signal-text)', // warnings / fatigue (→ signal text)
  navy: 'var(--color-ink)',
} as const;

/** Literal colours for Mapbox paint, which can't resolve CSS variables. */
export const MAP_COLORS = {
  route: '#FF3DB8', // signal — reads on both light-v11 and dark-v11 tiles
  effort: '#B6F500', // moment fluoro for interval segments
} as const;

export const FONT = {
  heading: "'Tribos Display', 'Archivo', sans-serif",
  mono: "'Courier Prime', monospace",
  body: "'Archivo', sans-serif",
} as const;
