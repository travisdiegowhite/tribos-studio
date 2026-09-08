/**
 * Shared gear constants for frontend components.
 *
 * Derived from the parts catalogue in api/utils/gearCatalog.js so the picker,
 * the labels, and the server's alert engine can never disagree about which
 * parts exist. The catalogue is dependency-free plain JS, safe to bundle.
 */

import {
  CATALOG_PARTS,
  BIKE_CATEGORIES,
  PART_GROUPS,
  PHOTO_SHOTS,
  METERS_PER_MILE,
  getCatalogPart,
  partsForBikeType,
} from '../../../api/utils/gearCatalog.js';

export { METERS_PER_MILE, BIKE_CATEGORIES, PART_GROUPS, PHOTO_SHOTS, getCatalogPart, partsForBikeType };

export const RUNNING_SHOE_THRESHOLDS = {
  warning: 350 * METERS_PER_MILE,
  replace: 400 * METERS_PER_MILE,
};

/** Mantine Select data, grouped by where the part lives on the bike. */
export const COMPONENT_TYPES = PART_GROUPS.map((g) => ({
  group: g.label,
  items: CATALOG_PARTS.filter((p) => p.group === g.value).map((p) => ({ value: p.type, label: p.label })),
})).filter((g) => g.items.length > 0);

export const TIRE_COMPONENT_TYPES = ['tires_road', 'tires_gravel'];
export const WHEEL_COMPONENT_TYPES = ['wheels_road', 'wheels_gravel'];

export function getComponentLabel(componentType) {
  return getCatalogPart(componentType)?.label || componentType;
}
