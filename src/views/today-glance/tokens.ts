/**
 * Brand tokens for the Today glance, per the redesign spec. Zero border radius
 * everywhere; Barlow Condensed headings, DM Mono data labels, Barlow body.
 * Kept local to the glance so it can diverge from the rest of Today without
 * touching the live view.
 */

export const C = {
  base: '#F4F4F2',
  secondary: '#EBEBE8',
  border: '#DDDDD8',
  card: '#FFFFFF',
  text: '#141410',
  text2: '#3D3C36',
  text3: '#7A7970',
  teal: '#2A8C82', // primary / CTA / route line
  orange: '#D4600A', // effort / interval work segments
  gold: '#C49A0A', // achievement / optimal
  coral: '#C43C2A', // warnings / fatigue
  navy: '#141410',
} as const;

export const FONT = {
  heading: "'Barlow Condensed', 'Barlow', sans-serif",
  mono: "'DM Mono', monospace",
  body: "'Barlow', sans-serif",
} as const;
