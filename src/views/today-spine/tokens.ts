/**
 * Tokens for the Training-Arc Today. Re-exports the shared glance palette (so
 * the two Today surfaces can't drift on brand colors) and adds the chart-only
 * neutrals the spine design calls for (TSS bars, gridlines, baseline, ring
 * track). Zero border radius everywhere per the design system.
 */

export { C, FONT } from '../today-glance/tokens';

/** Chart-only neutrals from docs/today-view (kept out of the brand palette). */
export const CHART = {
  tssBar: '#e9e6dd',
  plannedBarStroke: '#e0c9a3',
  gridline: '#efeee9',
  baseline: '#dcdad3',
  ringTrack: '#EBEBE8',
  pastLine: '#141410',
  futureLine: '#7A7970',
  axisMuted: '#9a988f',
  axisFuture: '#c0a878',
  ink: '#0e0e0b',
} as const;

/** Vertical week gridlines from the prototype (SVG x positions). */
export const GRIDLINE_XS = [40, 150, 260, 370, 480, 590, 810, 920, 1030] as const;
