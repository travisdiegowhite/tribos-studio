/**
 * Gear Tracking Defaults
 *
 * Thin compatibility layer over api/utils/gearCatalog.js, which is now the
 * single source of truth for part types, thresholds, wear factors, and the
 * metadata each part carries. Existing callers (gear.js, gearAlerts.js) keep
 * importing from here; new code should import the catalogue directly.
 *
 * All distance values are METERS.
 */

import {
  CATALOG_PARTS,
  METERS_PER_MILE,
  getCatalogThresholds,
} from './gearCatalog.js';

export { METERS_PER_MILE };

/**
 * Default component maintenance thresholds keyed by component_type.
 * Shape preserved: { warning, replace } in meters, plus `time_based_months`
 * for parts that age rather than wear (bar tape, sealant, brake fluid).
 */
export const DEFAULT_COMPONENT_THRESHOLDS = Object.fromEntries(
  CATALOG_PARTS.map((p) => [
    p.type,
    {
      warning: p.warningMeters,
      replace: p.replaceMeters,
      ...(p.wearModel === 'time' && p.serviceMonths ? { time_based_months: p.serviceMonths } : {}),
      ...(p.wearModel === 'hours' && p.serviceHours ? { service_hours: p.serviceHours, time_based_months: p.serviceMonths } : {}),
    },
  ])
);

/**
 * Running shoe thresholds (in meters). Shoes are a gear_item, not a
 * component, so they live here rather than in the parts catalogue.
 */
export const RUNNING_SHOE_THRESHOLDS = {
  warning: 350 * METERS_PER_MILE,
  replace: 400 * METERS_PER_MILE,
};

/**
 * Available component types for the UI, in catalogue order.
 */
export const COMPONENT_TYPES = CATALOG_PARTS.map((p) => ({ value: p.type, label: p.label }));

/**
 * Default metadata for tire and wheel components.
 * Used as sensible defaults when no user-specified values exist.
 */
export const DEFAULT_TIRE_METADATA = {
  tires_road: { width_mm: 28, tubeless: false, max_pressure_psi: 100 },
  tires_gravel: { width_mm: 40, tubeless: true, max_pressure_psi: 60 },
};

export const DEFAULT_WHEEL_METADATA = {
  wheels_road: { rim_width_mm: 21, hookless: false },
  wheels_gravel: { rim_width_mm: 25, hookless: false },
};

/**
 * Get default thresholds for a component type.
 * Returns { warning, replace } in meters, or null values for time-based components.
 */
export function getDefaultThresholds(componentType) {
  return getCatalogThresholds(componentType);
}
