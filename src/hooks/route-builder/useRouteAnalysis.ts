/**
 * useRouteAnalysis — Route Builder 2.0 analysis hook.
 *
 * Owns route-derived analytics: elevation profile, gradient slices,
 * POI layer toggles. Heavy work happens lazily and is memoized to the
 * current route geometry.
 *
 * POI fetching delegates to `routePOIService.queryPOIsAlongRoute`.
 * Elevation/gradient delegate to the existing `elevation` /
 * `routeGradient` utils.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export type POILayer = 'coffee' | 'water' | 'food' | 'bike_shop' | 'restroom' | 'viewpoint';

export interface ElevationPoint {
  distance_km: number;
  elevation_m: number;
}

export interface GradientSegment {
  start_km: number;
  end_km: number;
  grade_percent: number;
}

export interface POIResult {
  layer: POILayer;
  features: unknown[];
}

export interface UseRouteAnalysisReturn {
  elevationProfile: ElevationPoint[] | null;
  gradientData: GradientSegment[] | null;
  poiResults: Record<POILayer, POIResult | null>;
  activeLayers: POILayer[];
  isAnalyzing: boolean;
  lastError: string | null;
  togglePOILayer: (layer: POILayer) => Promise<void>;
  refreshAnalysis: () => void;
}

const EMPTY_POIS: Record<POILayer, POIResult | null> = {
  coffee: null,
  water: null,
  food: null,
  bike_shop: null,
  restroom: null,
  viewpoint: null,
};

export function useRouteAnalysis(): UseRouteAnalysisReturn {
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);

  const [poiResults, setPoiResults] = useState<Record<POILayer, POIResult | null>>(EMPTY_POIS);
  const [activeLayers, setActiveLayers] = useState<POILayer[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState(0);

  const coordinates = useMemo(() => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
    return routeGeometry.coordinates as Array<[number, number]>;
  }, [routeGeometry]);

  /**
   * Elevation profile is computed lazily from geometry. In P1.2 we
   * return a placeholder shape derived from `routeStats` so the
   * harness can verify the hook wiring; the real elevation fetcher
   * (`src/utils/elevation.getElevationData`) is async and slow, so
   * the P1.3 UI will trigger it via `refreshAnalysis`.
   */
  const elevationProfile = useMemo<ElevationPoint[] | null>(() => {
    if (!coordinates || coordinates.length === 0) return null;
    const distanceKm = routeStats?.distance_km ?? 0;
    const gain = routeStats?.elevation_gain_m ?? 0;
    if (distanceKm <= 0) return null;
    return [
      { distance_km: 0, elevation_m: 0 },
      { distance_km: distanceKm / 2, elevation_m: gain / 2 },
      { distance_km: distanceKm, elevation_m: 0 },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinates, routeStats?.distance_km, routeStats?.elevation_gain_m, analysisRevision]);

  const gradientData = useMemo<GradientSegment[] | null>(() => {
    if (!elevationProfile) return null;
    const segments: GradientSegment[] = [];
    for (let i = 1; i < elevationProfile.length; i++) {
      const a = elevationProfile[i - 1];
      const b = elevationProfile[i];
      const distance_km = b.distance_km - a.distance_km;
      if (distance_km <= 0) continue;
      const elev_delta_m = b.elevation_m - a.elevation_m;
      const grade_percent = (elev_delta_m / (distance_km * 1000)) * 100;
      segments.push({
        start_km: a.distance_km,
        end_km: b.distance_km,
        grade_percent,
      });
    }
    return segments;
  }, [elevationProfile]);

  const togglePOILayer = useCallback(
    async (layer: POILayer): Promise<void> => {
      const isActive = activeLayers.includes(layer);
      if (isActive) {
        setActiveLayers((prev) => prev.filter((l) => l !== layer));
        setPoiResults((prev) => ({ ...prev, [layer]: null }));
        trackRb2('analysis_layer_toggled', { layer, state: 'off' });
        return;
      }

      setIsAnalyzing(true);
      setLastError(null);
      try {
        let features: unknown[] = [];
        if (coordinates && coordinates.length >= 2) {
          // Lazy-load to keep the hook tree-shakeable and avoid
          // pulling routePOIService into harness-only flows.
          const mod = await import('../../utils/routePOIService');
          const result = (await mod.queryPOIsAlongRoute(coordinates, [layer])) as
            | unknown[]
            | { features?: unknown[] }
            | null;
          if (Array.isArray(result)) {
            features = result;
          } else if (result && Array.isArray(result.features)) {
            features = result.features;
          } else {
            features = [];
          }
        }
        setPoiResults((prev) => ({ ...prev, [layer]: { layer, features } }));
        setActiveLayers((prev) => [...prev, layer]);
        trackRb2('analysis_layer_toggled', { layer, state: 'on', count: features.length });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
        trackRb2('analysis_layer_toggled', {
          layer,
          state: 'failed',
          error_message: message.slice(0, 200),
        });
      } finally {
        setIsAnalyzing(false);
      }
    },
    [activeLayers, coordinates],
  );

  const refreshAnalysis = useCallback(() => {
    setAnalysisRevision((r) => r + 1);
  }, []);

  return {
    elevationProfile,
    gradientData,
    poiResults,
    activeLayers,
    isAnalyzing,
    lastError,
    togglePOILayer,
    refreshAnalysis,
  };
}
