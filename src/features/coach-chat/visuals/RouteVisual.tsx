/**
 * route_preview — a saved route (or the stretch of it the coach is talking
 * about) on the read-only preview map, coloured by gradient when the
 * geometry carries elevation.
 */

import { useEffect, useMemo, useState } from 'react';
import { Group, Text } from '@mantine/core';
import RoutePreviewMap from '../../../components/RouteBuilder/RoutePreviewMap';
import { supabase } from '../../../lib/supabase';
import type { RoutePreviewVisual as Spec } from './types';
import { useAthleteBasics } from './useAthleteBasics';
import { formatRangeKm, geometryCoords, sliceGeometryByKm } from './visualData';
import { VisualFrame, VisualLoading, VisualMissing } from './VisualFrame';

interface RouteRow {
  id: string;
  name: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  geometry: GeoJSON.Geometry | null;
}

export default function RouteVisual({ spec }: { spec: Spec }) {
  const { isImperial } = useAthleteBasics();
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('routes')
      .select('id, name, distance_km, elevation_gain_m, geometry')
      .eq('id', spec.route_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setFailed(true);
        else setRoute(data as RouteRow);
      });
    return () => {
      cancelled = true;
    };
  }, [spec.route_id]);

  const geometry = useMemo(() => sliceGeometryByKm(route?.geometry, spec.range_km), [route?.geometry, spec.range_km]);
  const hasElevation = useMemo(() => geometryCoords(geometry).some((c) => c.length > 2), [geometry]);

  if (failed) return <VisualMissing title="Route" reason="That route isn’t available any more." />;

  const caption = [spec.caption, spec.range_km ? `showing ${formatRangeKm(spec.range_km, isImperial)}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <VisualFrame
      title={route?.name || 'Route'}
      caption={caption || undefined}
      openHref={`/ride/${spec.route_id}`}
      openLabel="Open in Route Builder"
    >
      {!route ? (
        <VisualLoading height={240} />
      ) : (
        <>
          <RoutePreviewMap geometry={geometry} height={240} mode={hasElevation ? 'terrain' : 'plain'} interactive />
          <Group gap="lg" mt={8}>
            {route.distance_km != null && (
              <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {isImperial
                  ? `${(Number(route.distance_km) / 1.609344).toFixed(1)} mi`
                  : `${Number(route.distance_km).toFixed(1)} km`}
              </Text>
            )}
            {route.elevation_gain_m != null && (
              <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {isImperial
                  ? `${Math.round(Number(route.elevation_gain_m) * 3.28084)} ft`
                  : `${Math.round(Number(route.elevation_gain_m))} m`}{' '}
                climbing
              </Text>
            )}
          </Group>
        </>
      )}
    </VisualFrame>
  );
}
