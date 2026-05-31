/**
 * RouteBuilder2 — Phase 1 page composition (P1.3).
 *
 * Layout B: map-dominant. Form panel collapsible upper-left, layer
 * toggles below, persona dropdown top-right, waypoint list bottom-left,
 * chat floating bottom-right (desktop) or bottom-sheet (mobile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import {
  useAIGeneration,
  useRouteEditing,
  useMapInteraction,
  useRoutePersistence,
  useRouteAnalysis,
  useUserLocation,
} from '../hooks/route-builder';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCoachCheckIn } from '../hooks/useCoachCheckIn';
import type { PersonaId } from '../types/checkIn';
import {
  Map,
  FormPanel,
  StatsOverlay,
  ElevationPanel,
  GradientLegend,
  SurfaceSummaryBar,
  LayerToggles,
  WaypointListPanel,
  PersonaDropdown,
  ChatShell,
  EmptyState,
  LoadingState,
  ErrorState,
  RouteActionsPanel,
  RB2,
  type LayerVisibilityState,
  type FormPanelHandle,
} from '../features/route-builder-v2/components';
import {
  useChatSession,
  submitChatMessage,
  EXAMPLE_PHRASES,
  type ChatMessage,
} from '../features/route-builder-v2/chat';
import { supabase } from '../lib/supabase';
import { SurfaceLayer } from '../features/route-builder-v2/layers/SurfaceLayer';
import { GradientLayer } from '../features/route-builder-v2/layers/GradientLayer';
import { POILayer } from '../features/route-builder-v2/layers/POILayer';
import { BikeInfraLayer } from '../features/route-builder-v2/layers/BikeInfraLayer';
import { FamiliarSegmentsLayer } from '../features/route-builder-v2/layers/FamiliarSegmentsLayer';
import { trackRb2 } from '../features/route-builder-v2/telemetry/trackRb2';
import { coordinateAtDistanceKm } from '../utils/elevation';
import type { Coordinate } from '../types/geo';

const DEFAULT_VISIBILITY: LayerVisibilityState = {
  surface: false,
  gradient: false,
  poi: false,
  bikeInfra: false,
  familiar: false,
};

const STATIC_OPENING: ChatMessage = {
  id: 'opening',
  role: 'assistant',
  text: "Tell me what kind of ride you're looking for, or ask me to change the route.",
  timestamp: 0,
};

export default function RouteBuilder2() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();
  const { routeId: routeIdFromUrl } = useParams<{ routeId?: string }>();
  const { user } = useAuth() as { user: { id: string } | null };
  const generation = useAIGeneration();
  const editing = useRouteEditing();
  const map = useMapInteraction();
  const persistence = useRoutePersistence();
  const analysis = useRouteAnalysis();
  const userLocation = useUserLocation();

  // Persona (top-bar dropdown)
  const coach = useCoachCheckIn(user?.id);

  // Route state from the store
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const viewport = useRouteBuilderStore((s) => s.viewport);
  const setWaypointsInStore = useRouteBuilderStore((s) => s.setWaypoints);
  const clearRouteInStore = useRouteBuilderStore((s) => s.clearRoute);

  // Map viewport center as a last-resort start_coord fallback for the form.
  const viewportCenter = useMemo<Coordinate | null>(() => {
    if (!viewport) return null;
    const lng = (viewport as { longitude?: number }).longitude;
    const lat = (viewport as { latitude?: number }).latitude;
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    return [lng, lat] as Coordinate;
  }, [viewport]);

  // Approximate bbox derived from viewport for layer overlays
  // (bike infra, familiar segments). Doesn't need to be exact — the
  // services accept a bbox and we want to fetch enough area to cover
  // what's visible. Half-spans scale with zoom: ~360/2^z degrees wide.
  const viewportBbox = useMemo(() => {
    if (!viewport || !viewportCenter) return null;
    const zoom = Math.max(2, (viewport as { zoom?: number }).zoom ?? 12);
    const halfWidthDeg = 360 / Math.pow(2, zoom);
    const halfHeightDeg = halfWidthDeg * 0.6; // rough aspect ratio
    const [lng, lat] = viewportCenter;
    return {
      west: lng - halfWidthDeg,
      east: lng + halfWidthDeg,
      south: lat - halfHeightDeg,
      north: lat + halfHeightDeg,
    };
  }, [viewport, viewportCenter]);

  const [visibility, setVisibility] = useState<LayerVisibilityState>(DEFAULT_VISIBILITY);
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null);
  // Per-segment surface categories reported up by SurfaceLayer so the
  // summary bar reuses them without a second Overpass fetch.
  const [surfaceSegments, setSurfaceSegments] = useState<string[] | null>(null);
  // Distance (km) hovered on the elevation chart → resolved to a map coord.
  const [hoverKm, setHoverKm] = useState<number | null>(null);

  // Persona-voiced chat opener — fetched once per session. Falls back to
  // the static line on any error.
  const [opener, setOpener] = useState<ChatMessage>(STATIC_OPENING);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/route-coach/opener', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (!res.ok || cancelled) return;
        const { message } = await res.json();
        if (message && !cancelled) {
          setOpener({ id: 'opening', role: 'assistant', text: message, timestamp: 0 });
        }
      } catch {
        /* keep the static opener */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const chat = useChatSession({
    routeId: routeIdFromUrl ?? null,
    userId: user?.id ?? null,
    openingMessage: opener,
  });
  const formPanelRef = useRef<FormPanelHandle | null>(null);

  // Auto-apply the first suggestion when generate() returns. The hook
  // separates `generate` (writes to aiSuggestions) from `selectSuggestion`
  // (commits geometry + waypoints to the store) — the harness needs that
  // split, but the form-panel UI doesn't surface alternatives in P1.3,
  // so a freshly generated route should land in the live store
  // immediately. Without this, the route renders only from leftover
  // persisted state and manual edits fail with `constraint_infeasible`
  // because waypoints stay empty.
  const lastAppliedRef = useRef<unknown>(null);
  useEffect(() => {
    const first = generation.suggestions[0];
    if (!first || first === lastAppliedRef.current) return;
    lastAppliedRef.current = first;
    generation.selectSuggestion(0);
  }, [generation]);

  // Backfill waypoints from geometry endpoints. v1 sometimes persists a
  // route without a populated waypoints array (loaded routes, legacy
  // snapshots). Manual edits need ≥ 2 waypoints to route between, so
  // when we have geometry but no waypoints, seed start + end from the
  // first/last coordinates. Idempotent — only runs when the gap exists.
  useEffect(() => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return;
    if (routeGeometry.coordinates.length < 2) return;
    if (Array.isArray(waypoints) && waypoints.length >= 2) return;
    const coords = routeGeometry.coordinates as Coordinate[];
    const start = coords[0];
    const end = coords[coords.length - 1];
    setWaypointsInStore([
      { id: 'wp-0', position: start, type: 'start', name: '' },
      { id: 'wp-1', position: end, type: 'end', name: '' },
    ]);
  }, [routeGeometry, waypoints, setWaypointsInStore]);

  const handleClearRoute = () => {
    clearRouteInStore();
    generation.clearSuggestions();
    lastAppliedRef.current = null;
    trackRb2('route_cleared', {});
  };

  const hasRouteForChat =
    !!routeGeometry?.coordinates && routeGeometry.coordinates.length > 0;
  const handleChatSubmit = useCallback(
    (text: string) => {
      // Derive the endpoint's conversation-history shape from the live
      // message list, dropping the synthetic opener.
      const conversationHistory = chat.messages
        .filter((m) => m.id !== 'opening')
        .map((m) => ({ role: m.role, content: m.text }));
      void submitChatMessage({
        input: text,
        hasRoute: hasRouteForChat,
        routeId: routeIdFromUrl ?? null,
        conversationHistory,
        append: chat.append,
        setProcessing: chat.setProcessing,
        markRefused: chat.markRefused,
        formPanelControl: formPanelRef.current ?? { expand: () => {} },
        persistTurn: chat.persistTurn,
      });
    },
    [
      hasRouteForChat,
      routeIdFromUrl,
      chat.messages,
      chat.append,
      chat.setProcessing,
      chat.markRefused,
      chat.persistTurn,
    ],
  );

  // Load a saved route when a routeId is in the URL. Runs once per id.
  const loadedRouteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeIdFromUrl) return;
    if (loadedRouteIdRef.current === routeIdFromUrl) return;
    loadedRouteIdRef.current = routeIdFromUrl;
    void persistence.loadRoute(routeIdFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIdFromUrl]);

  const handleSaved = useCallback(
    (id: string) => {
      if (routeIdFromUrl !== id) {
        navigate(`/route-builder-2/${id}`, { replace: true });
      }
    },
    [navigate, routeIdFromUrl],
  );

  const handleLoaded = useCallback(
    (id: string) => {
      if (routeIdFromUrl !== id) {
        navigate(`/route-builder-2/${id}`, { replace: true });
      }
    },
    [navigate, routeIdFromUrl],
  );

  // Page mount telemetry
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Route Builder 2.0 BETA — Tribos';
    trackRb2('page_viewed', {
      is_mobile: !!isMobile,
      has_existing_route:
        !!routeGeometry?.coordinates && routeGeometry.coordinates.length > 0,
    });
    return () => {
      document.title = previousTitle;
    };
    // Fire once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVisibilityToggle = (key: keyof LayerVisibilityState, next: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: next }));
  };

  const handlePoiLayerToggle = (layer: Parameters<typeof analysis.togglePOILayer>[0]) => {
    void analysis.togglePOILayer(layer);
  };

  const hasRoute = !!routeGeometry?.coordinates && routeGeometry.coordinates.length > 0;
  const isLoading = generation.isGenerating || editing.isApplying || map.isApplying;
  const errorRaw =
    generation.lastError || editing.lastError || map.lastError || persistence.lastError || null;
  const error = errorRaw && errorRaw !== errorDismissed ? errorRaw : null;
  const dismissError = () => setErrorDismissed(errorRaw);

  // Reasonable narrowed geometry typing for layer props
  const geometryForLayers = useMemo(() => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
    return {
      type: 'LineString' as const,
      coordinates: routeGeometry.coordinates as Coordinate[],
    };
  }, [routeGeometry]);

  // Resolve the hovered elevation-chart distance to a map coordinate. Mapped
  // by distance (via cumulative-distance walk) rather than index, so it holds
  // even when the elevation profile and geometry have different point counts.
  const highlightCoord = useMemo<Coordinate | null>(() => {
    if (hoverKm == null || !geometryForLayers || geometryForLayers.coordinates.length < 2) {
      return null;
    }
    const c = coordinateAtDistanceKm(
      geometryForLayers.coordinates as [number, number][],
      hoverKm,
    );
    return c ? (c as Coordinate) : null;
  }, [hoverKm, geometryForLayers]);

  const waypointsForMap = useMemo(() => {
    if (!Array.isArray(waypoints)) return [];
    return waypoints
      .filter((wp): wp is { id: string; position: Coordinate; type?: string } => {
        const p = (wp as { position?: unknown }).position;
        return Array.isArray(p) && p.length === 2;
      })
      .map((wp, i) => ({ id: wp.id ?? `wp-${i}`, position: wp.position, type: wp.type }));
  }, [waypoints]);

  const onPersonaChange = async (next: PersonaId) => {
    await coach.savePersona(next, 'manual');
  };

  return (
    <AppShell fullWidth>
      <Box
        data-testid="rb2-page"
        style={{
          position: 'relative',
          width: '100%',
          // Account for the 60px AppShell header + 3px retro stripe.
          height: 'calc(100dvh - 63px)',
          backgroundColor: RB2.bgBase,
          overflow: 'hidden',
        }}
      >
        {/* Map fills the canvas */}
        <Box style={{ position: 'absolute', inset: 0 }}>
          <Map
            map={map}
            routeGeometry={
              !visibility.surface && !visibility.gradient ? geometryForLayers : null
            }
            waypoints={waypointsForMap}
            highlightCoord={highlightCoord}
          >
            {visibility.surface && (
              <SurfaceLayer geometry={geometryForLayers} onSegments={setSurfaceSegments} />
            )}
            {visibility.gradient && !visibility.surface && (
              <GradientLayer geometry={geometryForLayers} />
            )}
            {visibility.poi && (
              <POILayer
                poiResults={analysis.poiResults}
                activeLayers={analysis.activeLayers}
              />
            )}
            {visibility.bikeInfra && <BikeInfraLayer bbox={viewportBbox} visible />}
            {visibility.familiar && (
              <FamiliarSegmentsLayer bbox={viewportBbox} visible />
            )}
          </Map>
        </Box>

        {/* Persona dropdown — top-right of page */}
        {!isMobile && (
          <Box
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 25,
            }}
          >
            <PersonaDropdown persona={coach.persona} onChange={onPersonaChange} />
          </Box>
        )}

        {/* Top-left overlay column */}
        {!isMobile && (
          <Box
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 'calc(100% - 32px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {hasRoute && (
              <StatsOverlay
                stats={
                  routeStats
                    ? {
                        distance_km: routeStats.distance_km,
                        elevation_gain_m: routeStats.elevation_gain_m,
                        duration_s: routeStats.duration_s,
                      }
                    : null
                }
                routeName={routeName}
                onClear={handleClearRoute}
              />
            )}
            <FormPanel
              ref={formPanelRef}
              generation={generation}
              defaultStart={userLocation.coord}
              locationStatus={userLocation.status}
              viewportCenter={viewportCenter}
            />
            <LayerToggles
              visibility={visibility}
              onToggle={handleVisibilityToggle}
              onPoiLayerToggle={handlePoiLayerToggle}
              activePoiLayers={analysis.activeLayers}
              hasStravaConnection={false}
            />
            {visibility.gradient && hasRoute && <GradientLegend />}
            {visibility.surface && hasRoute && (
              <SurfaceSummaryBar segments={surfaceSegments} />
            )}
            {hasRoute && (
              <WaypointListPanel
                waypoints={waypointsForMap}
                onRemove={(idx) => void map.handleRemoveWaypoint(idx)}
              />
            )}
            {hasRoute && (
              <RouteActionsPanel
                persistence={persistence}
                defaultName={routeName}
                onSaved={handleSaved}
                onLoaded={handleLoaded}
              />
            )}
          </Box>
        )}

        {/* Mobile layout — stacked top column, persona inline */}
        {isMobile && (
          <Box
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              right: 8,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 'calc(100% - 80px)',
              overflowY: 'auto',
            }}
          >
            <Box style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PersonaDropdown
                persona={coach.persona}
                onChange={onPersonaChange}
                compact
              />
            </Box>
            {hasRoute && (
              <StatsOverlay
                stats={
                  routeStats
                    ? {
                        distance_km: routeStats.distance_km,
                        elevation_gain_m: routeStats.elevation_gain_m,
                        duration_s: routeStats.duration_s,
                      }
                    : null
                }
                routeName={routeName}
                onClear={handleClearRoute}
              />
            )}
            {hasRoute && (
              <ElevationPanel
                profile={analysis.elevationProfile}
                isMobile
                onHoverKm={setHoverKm}
              />
            )}
            <FormPanel
              ref={formPanelRef}
              generation={generation}
              defaultStart={userLocation.coord}
              locationStatus={userLocation.status}
              viewportCenter={viewportCenter}
              isMobile
            />
            <LayerToggles
              visibility={visibility}
              onToggle={handleVisibilityToggle}
              onPoiLayerToggle={handlePoiLayerToggle}
              activePoiLayers={analysis.activeLayers}
              isMobile
              hasStravaConnection={false}
            />
            {visibility.gradient && hasRoute && <GradientLegend isMobile />}
            {visibility.surface && hasRoute && (
              <SurfaceSummaryBar segments={surfaceSegments} isMobile />
            )}
            {hasRoute && (
              <RouteActionsPanel
                persistence={persistence}
                defaultName={routeName}
                onSaved={handleSaved}
                onLoaded={handleLoaded}
                isMobile
              />
            )}
          </Box>
        )}

        {/* Elevation chart — desktop bottom strip. left:12/right:388 clears the
            360-wide chat panel; z30 sits under chat (z50) and the toasts (z40). */}
        {!isMobile && hasRoute && (
          <Box
            style={{
              position: 'absolute',
              left: 12,
              right: 388,
              bottom: 12,
              zIndex: 30,
            }}
          >
            <ElevationPanel
              profile={analysis.elevationProfile}
              fillWidth
              onHoverKm={setHoverKm}
            />
          </Box>
        )}

        {/* Chat surface */}
        <ChatShell
          isMobile={!!isMobile}
          messages={chat.messages}
          isProcessing={chat.isProcessing}
          exampleHint={EXAMPLE_PHRASES}
          showAfterRefuseHint={chat.showAfterRefuseHint}
          onSubmit={handleChatSubmit}
        />

        {/* Empty / loading / error */}
        {isLoading && (
          <LoadingState
            message={
              generation.isGenerating
                ? 'Generating route…'
                : editing.isApplying
                  ? 'Applying edit…'
                  : 'Updating route…'
            }
          />
        )}
        {error && <ErrorState message={error} onDismiss={dismissError} />}
        {!hasRoute && !isLoading && <EmptyState />}
      </Box>
    </AppShell>
  );
}
