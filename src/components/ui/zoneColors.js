/**
 * Training Zone Colors Utility
 *
 * Visual Hierarchy Guidelines:
 * - Zone colors should be used for DATA VISUALIZATION only (charts, graphs)
 * - Do NOT use zone colors for buttons, badges, or interactive elements
 * - When used as backgrounds, always add opacity
 */

import { tokens } from '../../theme';

/**
 * Zone color definitions — mapped to Tribos brand palette
 * Sage → Teal → Gold → Terracotta → Mauve → Dusty Rose → Sky
 */
export const ZONE_COLORS = {
  1: tokens.colors.zone1, // Recovery - Sage
  2: tokens.colors.zone2, // Endurance - Teal
  3: tokens.colors.zone3, // Tempo - Gold
  3.5: '#C9A04E',         // Sweet Spot - Gold variant
  4: tokens.colors.zone4, // Threshold - Terracotta
  5: tokens.colors.zone5, // VO2max - Mauve
  6: tokens.colors.zone6, // Anaerobic - Dusty Rose
  7: tokens.colors.zone7, // Neuromuscular - Sky
};

/**
 * Zone names for display
 */
export const ZONE_NAMES = {
  1: 'Recovery',
  2: 'Endurance',
  3: 'Tempo',
  3.5: 'Sweet Spot',
  4: 'Threshold',
  5: 'VO2max',
  6: 'Anaerobic',
  7: 'Neuromuscular',
};

/**
 * Get zone color for chart/visualization use
 * Returns the full-saturation color for data visualization
 *
 * @param {number} zone - Zone number (1-7)
 * @returns {string} Hex color
 */
export function getZoneColor(zone) {
  return ZONE_COLORS[zone] || ZONE_COLORS[2];
}

/**
 * Get zone color with opacity for backgrounds
 * Use this when zone color is used as a background (e.g., table rows, cards)
 *
 * @param {number} zone - Zone number (1-7)
 * @param {number} opacity - Opacity value 0-1 (default 0.1)
 * @returns {string} RGBA color string
 */
export function getZoneBackgroundColor(zone, opacity = 0.1) {
  const hex = ZONE_COLORS[zone] || ZONE_COLORS[2];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get zone border color (lighter version for subtle borders)
 *
 * @param {number} zone - Zone number (1-7)
 * @param {number} opacity - Opacity value 0-1 (default 0.3)
 * @returns {string} RGBA color string
 */
export function getZoneBorderColor(zone, opacity = 0.3) {
  return getZoneBackgroundColor(zone, opacity);
}

/**
 * Get all zones as chart-ready data
 * Useful for legends and zone distribution charts
 *
 * @returns {Array} Array of zone objects with color, name, and number
 */
export function getZonesForChart() {
  return Object.entries(ZONE_COLORS)
    .filter(([zone]) => !zone.includes('.')) // Exclude 3.5
    .map(([zone, color]) => ({
      zone: parseInt(zone),
      color,
      name: ZONE_NAMES[zone],
    }));
}

/**
 * Get zone from power percentage of FTP
 *
 * @param {number} powerPct - Power as percentage of FTP (e.g., 0.75 for 75%)
 * @returns {number} Zone number
 */
export function getZoneFromPowerPct(powerPct) {
  if (powerPct < 0.55) return 1;
  if (powerPct < 0.75) return 2;
  if (powerPct < 0.87) return 3;
  if (powerPct < 0.94) return 3.5; // Sweet spot
  if (powerPct < 1.05) return 4;
  if (powerPct < 1.20) return 5;
  if (powerPct < 1.50) return 6;
  return 7;
}

/**
 * Chart color palette for non-zone data
 * Use these for general charts that aren't zone-related
 */
export const CHART_COLORS = {
  primary: tokens.colors.terracotta,
  secondary: tokens.colors.teal,
  tertiary: tokens.colors.mauve,
  quaternary: tokens.colors.gold,
  neutral: tokens.colors.textMuted,
};

/**
 * Get consistent colors for multi-series charts
 *
 * @param {number} index - Series index
 * @returns {string} Hex color
 */
export function getChartSeriesColor(index) {
  const palette = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.tertiary,
    CHART_COLORS.quaternary,
    tokens.colors.sage,
    tokens.colors.dustyRose,
  ];
  return palette[index % palette.length];
}
