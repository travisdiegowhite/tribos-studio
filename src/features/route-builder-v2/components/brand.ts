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
  bgBase: '#F4F4F2',
  bgSecondary: '#EBEBE8',
  border: '#DDDDD8',
  cardBg: '#FFFFFF',
  navDark: '#141410',

  // Text
  textPrimary: '#141410',
  textSecondary: '#3D3C36',
  textTertiary: '#7A7970',
  textInverse: '#FFFFFF',

  // Accents
  teal: '#2A8C82',
  tealHover: '#247770',
  orange: '#D4600A',
  gold: '#C49A0A',
  coral: '#C43C2A',

  // Misc
  focusRing: 'rgba(42, 140, 130, 0.4)',
  shadowCard: '0 1px 2px rgba(20, 20, 16, 0.06), 0 2px 8px rgba(20, 20, 16, 0.05)',
  shadowOverlay: '0 4px 12px rgba(20, 20, 16, 0.12), 0 8px 24px rgba(20, 20, 16, 0.08)',
} as const;

export const RB2_FONT = {
  heading: "'Barlow Condensed', sans-serif",
  body: "'Barlow', sans-serif",
  mono: "'DM Mono', monospace",
} as const;
