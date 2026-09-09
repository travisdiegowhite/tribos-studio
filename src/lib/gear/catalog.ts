/**
 * Browser-side entry point for the parts catalogue.
 *
 * The catalogue itself lives in api/utils/gearCatalog.js because the alert
 * engine and the vision schema import it from the serverless side. It is
 * dependency-free plain JS, so bundling it into the browser is safe;
 * gearConstants.js already proved the boundary. This module gives src/lib one
 * import point so a later move of the source file touches nothing else.
 */

export {
  CATALOG_PARTS,
  BIKE_CATEGORIES,
  PART_GROUPS,
  PHOTO_SHOTS,
  COMPONENT_TYPE_IDS,
  METERS_PER_MILE,
  WEAR_MODELS,
  getCatalogPart,
  getCatalogThresholds,
  partsForBikeType,
  effectiveWearMeters,
  classifyRideSurface,
} from '../../../api/utils/gearCatalog.js';

export type WearModel = 'distance' | 'time' | 'hours' | 'none';
export type Surface = 'road' | 'offroad' | 'indoor';

export interface CatalogPart {
  type: string;
  label: string;
  group: string;
  bikeTypes: string[];
  wearModel: WearModel;
  warningMeters: number | null;
  replaceMeters: number | null;
  serviceMonths: number | null;
  serviceHours: number | null;
  wearFactors: { road: number; offroad: number; indoor: number; wet: number } | null;
  metadataSchema: Record<string, unknown>;
  photoReadable: string[];
  riderSupplied: string[];
  photoHint: string | null;
  commonBrands: string[];
  whyItMatters: string;
}
