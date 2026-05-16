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
import AppShell from '../components/AppShell.jsx';
import {
  useAIGeneration,
  useRouteEditing,
  useMapInteraction,
  useRoutePersistence,
  useRouteAnalysis,
} from '../hooks/route-builder';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCoachCheckIn } from '../hooks/useCoachCheckIn';
import type { PersonaId } from '../types/checkIn';
import {
  Map,
  FormPanel,
  StatsOverlay,
  LayerToggles,
  WaypointListPanel,
  PersonaDropdown,
  ChatShell,
  EmptyState,
  LoadingState,
  ErrorState,
  RB2,
  type LayerVisibilityState,
  type FormPanelHandle,
} from '../features/route-builder-v2/components';
import {
  useChatSession,
  submitChatMessage,
  EXAMPLE_PHRASES,
} from '../features/route-builder-v2/chat';
import { SurfaceLayer } from '../features/route-builder-v2/layers/SurfaceLayer';
import { GradientLayer } from '../features/route-builder-v2/layers/GradientLayer';
import { POILayer } from '../features/route-builder-v2/layers/POILayer';
import { BikeInfraLayer } from '../features/route-builder-v2/layers/BikeInfraLayer';
import { FamiliarSegmentsLayer } from '../features/route-builder-v2/layers/FamiliarSegmentsLayer';
import { trackRb2 } from '../features/route-builder-v2/telemetry/trackRb2';
import type { Coordinate } from '../routing/executor';

const DEFAULT_VISIBILITY: LayerVisibilityState = {
  surface: false,
  gradient: false,
  poi: false,
  bikeInfra: false,
  familiar: false,
};

export default function RouteBuilder2() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { user } = useAuth() as { user: { id: string } | null };
  const generation = useAIGeneration();
  const editing = useRouteEditing();
  const map = useMapInteraction();
  const persistence = useRoutePersistence();
  const analysis = useRouteAnalysis();

  // Persona (top-bar dropdown)
  const coach = useCoachCheckIn(user?.id);

  // Route state from the store
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const setWaypointsInStore = useRouteBuilderStore((s) => s.setWaypoints);
  const clearRouteInStore = useRouteBuilderStore((s) => s.clearRoute);

  const [visibility, setVisibility] = useState<LayerVisibilityState>(DEFAULT_VISIBILITY);
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null);

  const chat = useChatSession();
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
      void submitChatMessage({
        input: text,
        hasRoute: hasRouteForChat,
        append: chat.append,
        setProcessing: chat.setProcessing,
        markRefused: chat.markRefused,
        editing,
        formPanelControl: formPanelRef.current ?? { expand: () => {} },
      });
    },
    [hasRouteForChat, chat.append, chat.setProcessing, chat.markRefused, editing],
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
          >
            {visibility.surface && <SurfaceLayer geometry={geometryForLayers} />}
            {visibility.gradient && !visibility.surface && (
              <GradientLayer geometry={geometryForLayers} />
            )}
            {visibility.poi && (
              <POILayer
                poiResults={analysis.poiResults}
                activeLayers={analysis.activeLayers}
              />
            )}
            {visibility.bikeInfra && <BikeInfraLayer data={null} visible />}
            {visibility.familiar && <FamiliarSegmentsLayer segments={null} />}
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
            <FormPanel ref={formPanelRef} generation={generation} defaultStart={null} />
            <LayerToggles
              visibility={visibility}
              onToggle={handleVisibilityToggle}
              onPoiLayerToggle={handlePoiLayerToggle}
              activePoiLayers={analysis.activeLayers}
              hasStravaConnection={false}
            />
            {hasRoute && (
              <WaypointListPanel
                waypoints={waypointsForMap}
                onRemove={(idx) => void map.handleRemoveWaypoint(idx)}
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
            <FormPanel ref={formPanelRef} generation={generation} defaultStart={null} isMobile />
            <LayerToggles
              visibility={visibility}
              onToggle={handleVisibilityToggle}
              onPoiLayerToggle={handlePoiLayerToggle}
              activePoiLayers={analysis.activeLayers}
              isMobile
              hasStravaConnection={false}
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
