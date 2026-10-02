/**
 * Route Builder 2.0 brand tokens (P1.3).
 *
 * Single source of truth for the Tribos palette used across rb2
 * components. Co-located here so a single change updates every
 * surface, and so grep can confirm no retired blue (#3A5A8C) leaks
 * into the new code.
 */

export const RB2 = {
  // Surfaces
  bgBase: '#F3F3F6',
  bgSecondary: '#EAEAF0',
  border: '#D6D6E0',
  cardBg: '#FFFFFF',
  navDark: '#0A0A14',

  // Text
  textPrimary: '#0A0A14',
  textSecondary: '#3C3C4A',
  textTertiary: '#6A6A7A',
  // Muted grey for disabled icon buttons — visibly present (so controls don't
  // look "missing") but clearly inactive. Sits between border and textTertiary.
  textDisabled: '#B8B8C4',
  textInverse: '#FFFFFF',

  // Accents — the site palette. The old key names stay so call sites don't
  // change: "teal" is the primary action (ink), "orange" the effort magenta,
  // "gold" the lime-family highlight, "coral" magenta text for warnings.
  teal: '#0A0A14',
  tealHover: '#2A2A36',
  orange: '#FF3DB8',
  gold: '#6E9600',
  coral: '#C4007A',

  // Misc
  focusRing: 'rgba(43, 43, 255, 0.4)',
  shadowCard: '0 1px 2px rgba(20, 20, 16, 0.06), 0 2px 8px rgba(20, 20, 16, 0.05)',
  shadowOverlay: '0 4px 12px rgba(20, 20, 16, 0.12), 0 8px 24px rgba(20, 20, 16, 0.08)',
} as const;

export const RB2_FONT = {
  heading: "'Archivo', sans-serif",
  body: "'Archivo', sans-serif",
  mono: "'Courier Prime', monospace",
} as const;
