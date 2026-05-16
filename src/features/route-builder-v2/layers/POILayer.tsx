/**
 * POILayer — Route Builder 2.0 POI overlay wrapper.
 *
 * Reads `poiResults` from useRouteAnalysis (active layers only) and
 * renders POI markers via the existing `RoutePOILayer` component.
 */

import { useMemo, type ComponentType } from 'react';
import RoutePOILayerImport from '../../../components/RouteBuilder/RoutePOILayer.jsx';

const RoutePOILayer = RoutePOILayerImport as unknown as ComponentType<{
  pois: unknown[];
  activeCategories: Set<string>;
  onSelect: (poi: unknown) => void;
  selectedId: string | null;
}>;
import type {
  POILayer as POILayerId,
  POIResult,
} from '../../../hooks/route-builder';

export interface POILayerProps {
  poiResults: Record<POILayerId, POIResult | null>;
  activeLayers: POILayerId[];
}

interface PoiFeature {
  id?: string;
  category?: string;
  lon?: number;
  lat?: number;
  name?: string;
}

export function POILayer({ poiResults, activeLayers }: POILayerProps) {
  const allPois = useMemo(() => {
    const list: PoiFeature[] = [];
    for (const layer of activeLayers) {
      const result = poiResults[layer];
      if (!result || !Array.isArray(result.features)) continue;
      for (const f of result.features as PoiFeature[]) {
        if (
          f &&
          typeof f.lon === 'number' &&
          typeof f.lat === 'number'
        ) {
          list.push({ ...f, category: f.category ?? layer });
        }
      }
    }
    return list;
  }, [poiResults, activeLayers]);

  const activeSet = useMemo(() => new Set(activeLayers), [activeLayers]);

  if (allPois.length === 0) return null;

  return (
    <RoutePOILayer
      pois={allPois}
      activeCategories={activeSet}
      onSelect={() => {}}
      selectedId={null}
    />
  );
}

export default POILayer;
