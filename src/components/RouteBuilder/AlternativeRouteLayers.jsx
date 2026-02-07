/**
 * AlternativeRouteLayers — Renders alternative route segments on the map
 * as dashed lines with distinct colors. Highlights on hover.
 */

import { Source, Layer } from 'react-map-gl';

/**
 * @param {Object}   props
 * @param {Array}    props.alternatives   Array of alternative objects with .coordinates and .color
 * @param {number}   props.hoveredIndex   Index of currently hovered alternative (null = none)
 */
export default function AlternativeRouteLayers({ alternatives, hoveredIndex }) {
  if (!alternatives || alternatives.length === 0) return null;

  return (
    <>
      {alternatives.map((alt, i) => {
        const isHovered = hoveredIndex === i;
        const geojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: alt.coordinates,
          },
          properties: {},
        };

        return (
          <Source key={`alt-route-${alt.id}`} id={`alt-route-${alt.id}`} type="geojson" data={geojson}>
            {/* White outline for contrast */}
            <Layer
              id={`alt-route-outline-${alt.id}`}
              type="line"
              paint={{
                'line-color': '#ffffff',
                'line-width': isHovered ? 7 : 5,
                'line-opacity': isHovered ? 0.6 : 0.3,
                'line-blur': 1,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
            {/* Colored dashed line */}
            <Layer
              id={`alt-route-line-${alt.id}`}
              type="line"
              paint={{
                'line-color': alt.color,
                'line-width': isHovered ? 5 : 3,
                'line-opacity': isHovered ? 1.0 : 0.7,
                'line-dasharray': isHovered ? [1, 0] : [3, 2],
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </Source>
        );
      })}
    </>
  );
}
