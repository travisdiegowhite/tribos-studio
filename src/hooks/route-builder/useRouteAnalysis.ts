/**
 * useRouteAnalysis — Route Builder 2.0 analysis hook.
 *
 * Thin wrapper around v1's elevation + POI services. Owns route-derived
 * analytics: elevation profile (real, from `getElevationData`),
 * gradient segments, POI layer toggles. S2 rewire: replaces the
 * placeholder elevation profile from P1.2 with a real fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouteBuilderStore } from '../../stores/routeBuilderStore';
import { getElevationData } from '../../utils/elevation';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export type POILayer =
  | 'coffee'
  | 'water'
  | 'food'
  | 'bike_shop'
  | 'restroom'
  | 'viewpoint';

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

  const [poiResults, setPoiResults] = useState<Record<POILayer, POIResult | null>>(EMPTY_POIS);
  const [activeLayers, setActiveLayers] = useState<POILayer[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [elevationProfile, setElevationProfile] = useState<ElevationPoint[] | null>(null);

  const coordinates = useMemo(() => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
    return routeGeometry.coordinates as Array<[number, number]>;
  }, [routeGeometry]);

  /**
   * Fetch real elevation profile when geometry changes. v1 stores
   * the elevation profile as `[{ distance, elevation }]` where
   * `distance` is in km (legacy alias). We normalize to
   * `{ distance_km, elevation_m }` here.
   */
  useEffect(() => {
    let cancelled = false;
    if (!coordinates || coordinates.length < 2) {
      setElevationProfile(null);
      return;
    }
    (async () => {
      try {
        const data = await getElevationData(coordinates);
        if (cancelled) return;
        if (!data || !Array.isArray(data)) {
          setElevationProfile(null);
          return;
        }
        const profile: ElevationPoint[] = data.map(
          (p: { distance?: number; distance_km?: number; elevation: number }) => ({
            distance_km: p.distance_km ?? p.distance ?? 0,
            elevation_m: p.elevation,
          }),
        );
        setElevationProfile(profile);
      } catch (e) {
        if (cancelled) return;
        setElevationProfile(null);
        const message = e instanceof Error ? e.message : String(e);
        setLastError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coordinates, analysisRevision]);

  const gradientData = useMemo<GradientSegment[] | null>(() => {
    if (!elevationProfile || elevationProfile.length < 2) return null;
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
