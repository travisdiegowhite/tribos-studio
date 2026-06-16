/**
 * POILayer — Route Builder 2.0 POI overlay wrapper.
 *
 * Reads `poiResults` from useRouteAnalysis (active layers only) and renders POI
 * markers via the existing `RoutePOILayer` component. Clicking a POI opens a
 * popup with its name/category and an "Add to route" action (v1 parity).
 */

import { useMemo, useState, type ComponentType } from 'react';
import { Popup } from 'react-map-gl';
import { Box, Button, Text } from '@mantine/core';
import RoutePOILayerImport from '../../../components/RouteBuilder/RoutePOILayer.jsx';
import { RB2, RB2_FONT } from '../components/brand';
import type { Coordinate } from '../../../types/geo';

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
  /** When set, clicking a POI offers "Add to route" which routes through it. */
  onAddWaypoint?: (coord: Coordinate) => void;
}

interface PoiFeature {
  id?: string;
  category?: string;
  lon?: number;
  lat?: number;
  name?: string;
}

export function POILayer({ poiResults, activeLayers, onAddWaypoint }: POILayerProps) {
  const [selected, setSelected] = useState<PoiFeature | null>(null);

  const allPois = useMemo(() => {
    const list: PoiFeature[] = [];
    for (const layer of activeLayers) {
      const result = poiResults[layer];
      if (!result || !Array.isArray(result.features)) continue;
      for (const f of result.features as PoiFeature[]) {
        if (f && typeof f.lon === 'number' && typeof f.lat === 'number') {
          list.push({ ...f, category: f.category ?? layer });
        }
      }
    }
    return list;
  }, [poiResults, activeLayers]);

  const activeSet = useMemo(() => new Set(activeLayers), [activeLayers]);

  if (allPois.length === 0) return null;

  return (
    <>
      <RoutePOILayer
        pois={allPois}
        activeCategories={activeSet}
        onSelect={(poi) => setSelected(poi as PoiFeature)}
        selectedId={selected?.id ?? null}
      />

      {selected && typeof selected.lon === 'number' && typeof selected.lat === 'number' && (
        <Popup
          longitude={selected.lon}
          latitude={selected.lat}
          anchor="bottom"
          offset={14}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <Box data-testid="rb2-poi-popup" style={{ minWidth: 140, padding: 2 }}>
            <Text style={{ fontFamily: RB2_FONT.body, fontWeight: 600, color: RB2.textPrimary }}>
              {selected.name || 'Point of interest'}
            </Text>
            {selected.category && (
              <Text
                style={{
                  fontFamily: RB2_FONT.mono,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: RB2.textTertiary,
                  marginBottom: 8,
                }}
              >
                {selected.category}
              </Text>
            )}
            {onAddWaypoint && (
              <Button
                size="xs"
                fullWidth
                data-testid="rb2-poi-add-waypoint"
                onClick={() => {
                  onAddWaypoint([selected.lon as number, selected.lat as number]);
                  setSelected(null);
                }}
                styles={{
                  root: {
                    borderRadius: 0,
                    backgroundColor: RB2.teal,
                    fontFamily: RB2_FONT.heading,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontSize: 11,
                  },
                }}
              >
                Add to route
              </Button>
            )}
          </Box>
        </Popup>
      )}
    </>
  );
}

export default POILayer;
