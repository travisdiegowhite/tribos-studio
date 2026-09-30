/**
 * Tokens for the Training-Arc Today. Re-exports the shared glance palette (so
 * the two Today surfaces can't drift on brand colors) and adds the chart-only
 * neutrals the spine design calls for (TSS bars, gridlines, baseline, ring
 * track). Zero border radius everywhere per the design system.
 */

export { C, FONT, MAP_COLORS } from '../today-glance/tokens';

/** Chart colours (CSS variables from global.css, so the arc follows the theme). */
export const CHART = {
  tssBar: 'var(--chart-bar)',
  plannedBarStroke: 'var(--chart-bar-planned)',
  gridline: 'var(--chart-grid)',
  baseline: 'var(--chart-baseline)',
  ringTrack: 'var(--color-bg-secondary)',
  pastLine: 'var(--chart-fitness)',
  futureLine: 'var(--chart-future)',
  axisMuted: 'var(--color-text-muted)',
  axisFuture: 'var(--chart-future)',
  ink: 'var(--color-ink)',
} as const;

/** Vertical week gridlines from the prototype (SVG x positions). */
export const GRIDLINE_XS = [40, 150, 260, 370, 480, 590, 810, 920, 1030] as const;
