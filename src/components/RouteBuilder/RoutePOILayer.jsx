/**
 * RoutePOILayer — Renders POI markers on the map for points of interest along a route.
 * Uses react-map-gl Marker components with custom styled div markers.
 */

import { Marker } from 'react-map-gl';
import { POI_CATEGORIES } from '../../utils/routePOIService';
import { IconDroplet, IconCoffee, IconTool, IconEye, IconDoor } from '@tabler/icons-react';

const ICON_MAP = {
  water: IconDroplet,
  food: IconCoffee,
  bike_shop: IconTool,
  viewpoint: IconEye,
  restroom: IconDoor,
};

/**
 * @param {Object} props
 * @param {Array}  props.pois             POI objects from queryPOIsAlongRoute
 * @param {Set}    props.activeCategories  Set of category IDs to show
 * @param {Function} props.onSelect       Callback when a POI marker is clicked
 * @param {string|null} props.selectedId  Currently selected POI id
 */
export default function RoutePOILayer({ pois, activeCategories, onSelect, selectedId }) {
  if (!pois || pois.length === 0) return null;

  const visible = pois.filter(p => activeCategories.has(p.category));

  return (
    <>
      {visible.map(poi => {
        const cat = POI_CATEGORIES[poi.category];
        const Icon = ICON_MAP[poi.category] || IconEye;
        const isSelected = selectedId === poi.id;

        return (
          <Marker
            key={`poi-${poi.id}`}
            longitude={poi.lon}
            latitude={poi.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent?.stopPropagation();
              onSelect?.(poi);
            }}
          >
            <div
              style={{
                width: isSelected ? 32 : 26,
                height: isSelected ? 32 : 26,
                borderRadius: '50%',
                backgroundColor: cat.color,
                border: isSelected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isSelected
                  ? `0 0 0 3px ${cat.color}, 0 2px 8px rgba(0,0,0,0.4)`
                  : '0 1px 4px rgba(0,0,0,0.3)',
                transition: 'all 0.15s ease',
              }}
              title={poi.name}
            >
              <Icon size={isSelected ? 16 : 14} color="#fff" />
            </div>
          </Marker>
        );
      })}
    </>
  );
}
