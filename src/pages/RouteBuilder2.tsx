/**
 * RouteBuilder2 — Phase 1 page composition (P1.3).
 *
 * Layout B: map-dominant. Form panel collapsible upper-left, layer
 * toggles below, persona dropdown top-right, waypoint list bottom-left,
 * chat floating bottom-right (desktop) or bottom-sheet (mobile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { BASEMAP_STYLES } from '../components/RouteBuilder';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import {
  useAIGeneration,
  useRouteEditing,
  useMapInteraction,
  useRoutePersistence,
  useRouteAnalysis,
  useRouteHistory,
  useRouteWeather,
  useDraftAutosave,
  useUserLocation,
} from '../hooks/route-builder';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUserPreferences } from '../contexts/UserPreferencesContext.jsx';
import { useCoachCheckIn } from '../hooks/useCoachCheckIn';
import type { PersonaId } from '../types/checkIn';
import {
  Map,
  RB2DesktopLayout,
  ControlRail,
  ChatDock,
  GenerateBar,
  EditToolbar,
  ElevationDock,
  FormPanel,
  StatsOverlay,
  ElevationPanel,
  GradientLegend,
  SurfaceSummaryBar,
  LayerToggles,
  WaypointListPanel,
  LocationSearch,
  WeatherPanel,
  WindLegend,
  FuelPanel,
  TirePressurePanel,
  PersonaDropdown,
  ChatBody,
  MobileControlSheet,
  EmptyState,
  LoadingState,
  ErrorState,
  RouteActionsPanel,
  DiscoverPanel,
  RaceDetailsCard,
  WorkoutArrivalCard,
  WorkoutArrivalPill,
  type PastRideOption,
  RB2,
  RB2_FONT,
  type LayerVisibilityState,
  type FormPanelHandle,
  type MobileSheetTab,
  type RailItem,
} from '../features/route-builder-v2/components';
import {
  useChatSession,
  submitChatMessage,
  EXAMPLE_PHRASES,
  type ChatMessage,
  type FormPanelControl,
} from '../features/route-builder-v2/chat';
import { Stack as StackIcon, MapPin, FolderOpen, MagnifyingGlass, CloudSun, ForkKnife, Gauge, Barbell, PencilSimpleLine, ChartLineUp, FloppyDisk, ChatCircleDots, Compass, SlidersHorizontal, Signpost } from '@phosphor-icons/react';
import { CuesPanel } from '../features/route-builder-v2/components/CuesPanel';
import { GuestSaveModal } from '../features/route-builder-v2/components/GuestSaveModal';
import type { RouteCue as RouteCueType } from '../utils/routeCues';
import { supabase } from '../lib/supabase';
import { SurfaceLayer } from '../features/route-builder-v2/layers/SurfaceLayer';
import { GradientLayer } from '../features/route-builder-v2/layers/GradientLayer';
import { POILayer } from '../features/route-builder-v2/layers/POILayer';
import { BikeInfraLayer } from '../features/route-builder-v2/layers/BikeInfraLayer';
import { FamiliarSegmentsLayer } from '../features/route-builder-v2/layers/FamiliarSegmentsLayer';
import { WindArrowsLayer } from '../features/route-builder-v2/layers/WindArrowsLayer';
import { IntervalsLayer } from '../features/route-builder-v2/layers/IntervalsLayer';
import { WorkoutOverlayLegend, WorkoutPickerPanel } from '../features/route-builder-v2/components';
import { useUpcomingPlannedWorkouts } from '../hooks/useUpcomingPlannedWorkouts';
import { targetDistanceKm } from '../features/route-builder-v2/discover/rankRoutes';
import {
  initArrivalSession,
  saveArrivalSession,
  clearArrivalSession,
  type ArrivalStatus,
} from '../features/route-builder-v2/arrival/arrivalSession';
import { rankPastRidesByFit } from '../features/route-builder-v2/arrival/rankPastRides';
import { calculatePersonalizedETA } from '../utils/personalizedETA';
import { stravaService } from '../utils/stravaService';
import RoadPreferencesCard from '../components/settings/RoadPreferencesCard.jsx';
import BikeInfrastructureLegend from '../components/BikeInfrastructureLegend.jsx';
import RaceDayGuide from '../components/fueling/RaceDayGuide';
import { decodePolyline } from '../utils/activityRouteAnalyzer';
import type { WorkoutDefinition } from '../types/training';
import { trackRb2 } from '../features/route-builder-v2/telemetry/trackRb2';
import { ElevationHoverMarker } from '../features/route-builder-v2/components/ElevationHoverMarker';
import { setElevationHoverKm } from '../features/route-builder-v2/state/elevationHoverStore';
import { getAnyWorkoutById } from '../data/workoutLookup';
import {
  generatePlannedRouteCandidates,
  type RouteCandidate,
} from '../utils/naturalLanguageRouteCandidates';
import { fetchRouteSurfaceData, computeSurfaceDistribution } from '../utils/surfaceOverlay.js';
import { removeSegmentAndReroute } from '../utils/routeEditor';
import { polylineLengthKm } from '../utils/gravelRouteBuilder';
import {
  detectClipSelection,
  type ClipSelection,
} from '../features/route-builder-v2/clip/detectClipSelection';
import { ClipConfirmCard } from '../features/route-builder-v2/components';
import type { GenerateOutcome, RouteOptionSummary } from '../features/route-builder-v2/chat';
import { generateCuesFromWorkoutStructure } from '../utils/intervalCues.js';
import {
  categoryToGoal,
  workoutTypeToGoal,
  type WorkoutCue,
} from '../features/route-builder-v2/overlay/intervalOverlay';
import type { GenerateFormSeed } from '../features/route-builder-v2/components/useGenerateForm';
import type { Coordinate } from '../types/geo';

const DEFAULT_VISIBILITY: LayerVisibilityState = {
  surface: false,
  gradient: false,
  wind: false,
  poi: false,
  bikeInfra: false,
  familiar: false,
  intervals: false,
};

// Obvious non-ride activity types to keep out of the "repeat a past ride"
// list (a cycling workout is never ridden as a run).
const NON_RIDE_TYPES = ['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike', 'Swim'];

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

  // Lift the Supabase session token once per session so coach-generated routes
  // can use the rider's familiar-roads history + route familiarity scoring
  // (same source RB1 uses). Stays null when signed out — the builder simply
  // skips those Strava-gated branches.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    if (!user) {
      setAccessToken(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setAccessToken(session?.access_token ?? null);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const { unitsPreference, updateUnitsPreference } = useUserPreferences() as {
    unitsPreference: string;
    updateUnitsPreference: (next: 'imperial' | 'metric') => void;
  };
  const isImperial = unitsPreference === 'imperial';

  // Workout overlay: a workout can be attached either by arriving from the
  // training calendar with ?workoutId=… or by the in-builder picker. The
  // selection is stateful (seeded from the URL); the picker mutates it.
  // Resolved from the library → seeds the generate form and paints the
  // intervals on the route. View-only — nothing is persisted.
  const [searchParams, setSearchParams] = useSearchParams();

  // Calendar arrival: `?from=calendar` captures the workout context (goal /
  // name / duration / distance — the planned workout may not resolve in the
  // library, so the URL params are the fallback), persisted to sessionStorage
  // because picking a saved route remounts this page at /ride/:id. The flow
  // ends when a route is saved or the card is explicitly dismissed; until
  // then a choice only minimizes the card to a reopenable pill.
  const [arrivalInit] = useState(() => initArrivalSession(searchParams));
  const arrivalCtx = arrivalInit.context;
  const [arrivalStatus, setArrivalStatus] = useState<ArrivalStatus>(arrivalInit.status);

  const [pickedWorkoutId, setPickedWorkoutId] = useState<string | null>(
    () => searchParams.get('workoutId') ?? arrivalCtx?.workoutId ?? null,
  );
  const [seedOverride, setSeedOverride] = useState<{
    durationMinutes?: number;
    distanceKm?: number | '';
  }>(() => {
    const d = Number(searchParams.get('duration'));
    const dist = Number(searchParams.get('distance'));
    return {
      durationMinutes:
        Number.isFinite(d) && d > 0 ? d : arrivalCtx?.durationMinutes ?? undefined,
      distanceKm:
        Number.isFinite(dist) && dist > 0 ? dist : arrivalCtx?.distanceKm ?? undefined,
    };
  });
  const attachedWorkout = useMemo(
    () => (pickedWorkoutId ? getAnyWorkoutById(pickedWorkoutId) : null),
    [pickedWorkoutId],
  );
  const hasWorkout = !!attachedWorkout;
  const upcomingPlanned = useUpcomingPlannedWorkouts(user?.id ?? null);

  const workoutName = attachedWorkout?.name ?? arrivalCtx?.workoutName ?? null;
  // Start-location preference typed into the arrival card; seeds the generate
  // form. The nonce remounts GenerateBar/FormPanel so a new seed applies.
  const [arrivalStartLocation, setArrivalStartLocation] = useState(arrivalInit.startLocation);
  const [seedNonce, setSeedNonce] = useState(0);
  // "Build something new" remounts the seeded form (nonce) — this keeps the
  // fresh mobile FormPanel instance expanded instead of resetting collapsed.
  // Also set on mount when the choice was made on /ride/:id and carried
  // across the hop back to /ride/new (arrivalInit.pendingNew).
  const [arrivalChoseNew, setArrivalChoseNew] = useState(arrivalInit.pendingNew);
  const showArrivalCard = arrivalStatus === 'open' && !!arrivalCtx;

  const formSeed = useMemo<GenerateFormSeed | undefined>(() => {
    if (attachedWorkout) {
      return {
        goal: categoryToGoal(attachedWorkout.category),
        durationMinutes: seedOverride.durationMinutes ?? attachedWorkout.duration,
        distanceKm: seedOverride.distanceKm ?? '',
        startLocation: arrivalStartLocation || undefined,
      };
    }
    if (arrivalCtx) {
      return {
        goal: workoutTypeToGoal(arrivalCtx.goal),
        durationMinutes: seedOverride.durationMinutes,
        distanceKm: seedOverride.distanceKm ?? '',
        startLocation: arrivalStartLocation || undefined,
      };
    }
    return undefined;
  }, [attachedWorkout, seedOverride, arrivalCtx, arrivalStartLocation]);

  const generation = useAIGeneration();
  const editing = useRouteEditing();
  const map = useMapInteraction();
  const persistence = useRoutePersistence();
  const analysis = useRouteAnalysis();
  const history = useRouteHistory();
  const weather = useRouteWeather();
  const userLocation = useUserLocation();

  // Persona (top-bar dropdown)
  const coach = useCoachCheckIn(user?.id);

  // Route state from the store
  const routeGeometry = useRouteBuilderStore((s) => s.routeGeometry);
  const routeCues = useRouteBuilderStore((s) => s.routeCues);
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const routeDescription = useRouteBuilderStore((s) => s.routeDescription);
  const routeProfile = useRouteBuilderStore((s) => s.routeProfile);
  const trainingGoal = useRouteBuilderStore((s) => s.trainingGoal);
  const raceType = useRouteBuilderStore((s) => s.raceType);
  const raceDate = useRouteBuilderStore((s) => s.raceDate);
  const targetFinishMinutes = useRouteBuilderStore((s) => s.targetFinishMinutes);
  const setRouteProfile = useRouteBuilderStore((s) => s.setRouteProfile);
  const snapToRoads = useRouteBuilderStore((s) => s.snapToRoads);
  const setSnapToRoads = useRouteBuilderStore((s) => s.setSnapToRoads);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const viewport = useRouteBuilderStore((s) => s.viewport);
  const setWaypointsInStore = useRouteBuilderStore((s) => s.setWaypoints);
  const setRouteGeometryInStore = useRouteBuilderStore((s) => s.setRouteGeometry);
  const setRouteStatsInStore = useRouteBuilderStore((s) => s.setRouteStats);
  const setRouteNameInStore = useRouteBuilderStore((s) => s.setRouteName);
  const setAiSuggestions = useRouteBuilderStore((s) => s.setAiSuggestions);
  const clearRouteInStore = useRouteBuilderStore((s) => s.clearRoute);
  const setRouteInStore = useRouteBuilderStore((s) => s.setRoute);

  // Geometry identity at the last save/load — the store replaces the object
  // on every edit, so reference inequality means unsaved changes.
  const savedGeometryRef = useRef<unknown>(null);
  const hasUnsavedChanges =
    !!(routeGeometry as { coordinates?: unknown[] } | null)?.coordinates?.length &&
    routeGeometry !== savedGeometryRef.current;

  // Server-side crash safety: debounced draft autosave while dirty.
  const draftAutosave = useDraftAutosave(hasUnsavedChanges);

  // Warn before leaving with unsaved changes. The localStorage mirror covers
  // same-browser reloads, but a saved route is the only cross-device copy.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

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

  const [visibility, setVisibility] = useState<LayerVisibilityState>(() => ({
    ...DEFAULT_VISIBILITY,
    intervals: hasWorkout,
  }));
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null);
  // Failures from fire-and-forget overlay work (clip reroute, layer fetches)
  // that would otherwise be console-only; feeds the same ErrorState toast.
  const [overlayError, setOverlayError] = useState<string | null>(null);
  // Per-segment surface categories reported up by SurfaceLayer so the
  // summary bar reuses them without a second Overpass fetch.
  const [surfaceSegments, setSurfaceSegments] = useState<string[] | null>(null);
  // Elevation-chart hover lives in its own store (see elevationHoverStore) so
  // per-mousemove scrubbing re-renders only the map dot, not this page.
  // Clip-tangent mode: toggle on → click a spur → confirm card → reroute.
  const [clipMode, setClipMode] = useState(false);
  const [pendingClip, setPendingClip] = useState<ClipSelection | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  // Desktop region collapse state.
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [elevationCollapsed, setElevationCollapsed] = useState(false);
  // Desktop left-rail open flyout (layers | waypoints | save), null = closed.
  const [railOpenId, setRailOpenId] = useState<string | null>(null);
  // Incremented to tell RouteActionsPanel to open its Save modal (used by the
  // quick-save affordance on the stats card for not-yet-named routes).
  const [openSaveSignal, setOpenSaveSignal] = useState(0);
  // Mobile bottom-sheet active tab (null = collapsed, map fully visible).
  const [mobileTab, setMobileTab] = useState<string | null>(null);
  // Route discovery (lazy-loaded saved routes ranked by today's target).
  const [discoverRoutes, setDiscoverRoutes] = useState<
    Array<{ id: string; name?: string; distance_km?: number | null; elevation_gain_m?: number | null }>
  >([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const discoverLoadedRef = useRef(false);
  // Basemap choice — persisted so the map opens on the user's preferred style.
  const [basemapId, setBasemapId] = useLocalStorage<string>({
    key: 'rb2-basemap',
    defaultValue: 'dark',
  });
  const basemapStyle =
    BASEMAP_STYLES.find((s: { id: string }) => s.id === basemapId)?.style ??
    BASEMAP_STYLES[0].style;
  // Desktop cold-start: the GenerateBar (chips folded into the chat dock).
  // Auto-expand when seeded from a workout so the prefilled goal/duration
  // show, or when "build something new" was chosen just before a remount.
  const [generateExpanded, setGenerateExpanded] = useState(hasWorkout || arrivalInit.pendingNew);

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

  // Candidates from the latest chat-driven generation, parallel to the
  // `aiSuggestions` store array (same order). Session-only, like the store
  // field — carries the per-candidate name/profile/familiarity the snapshot
  // shape doesn't.
  const chatCandidatesRef = useRef<RouteCandidate[]>([]);

  // Monotonic guard so a slow Overpass surface check for a route the rider
  // has already switched away from never posts a stale chat line.
  const surfaceCheckSeqRef = useRef(0);

  // Fail-soft surface follow-up for the applied route (gravel requests only):
  // one Overpass fetch, reused by the SurfaceSummaryBar via the shared
  // segments state, plus a short chat line with the actual unpaved share.
  const appendChatMessage = chat.append;
  const runSurfaceCheck = useCallback(
    (candidate: RouteCandidate) => {
      if (candidate.surface_profile !== 'gravel') return;
      // Planned candidates already measured gravel % during generation (shown
      // on the card + reply) — don't re-query Overpass or double-post here.
      if (candidate.gravel_actual_pct != null) return;
      const geometry = candidate.snapshot.geometry;
      const seq = ++surfaceCheckSeqRef.current;
      void (async () => {
        try {
          const segments = (await fetchRouteSurfaceData(
            geometry as Array<[number, number]>,
          )) as string[] | null;
          if (seq !== surfaceCheckSeqRef.current) return;
          if (!segments || segments.length === 0) return;
          setSurfaceSegments(segments);
          const dist = computeSurfaceDistribution(segments) as Record<string, number>;
          const unpavedPct = Math.round((dist.gravel ?? 0) + (dist.unpaved ?? 0));
          appendChatMessage({
            role: 'assistant',
            text: `Surface check: ~${unpavedPct}% unpaved on this one.`,
          });
        } catch {
          /* fail-soft — the route works without the surface line */
        }
      })();
    },
    [appendChatMessage],
  );

  // Name/profile/familiarity aren't part of the RouteSnapshot that
  // `selectSuggestion` commits — apply them from the candidate alongside.
  const applyCandidateExtras = useCallback(
    (candidate: RouteCandidate) => {
      if (candidate.name) setRouteNameInStore(candidate.name);
      if (candidate.surface_profile === 'gravel') setRouteProfile('gravel');
      setRouteStatsInStore((prev: Record<string, unknown>) => ({
        ...prev,
        familiarityScore:
          candidate.familiarity_percent != null
            ? { familiarityPercent: candidate.familiarity_percent }
            : null,
      }));
      runSurfaceCheck(candidate);
    },
    [setRouteNameInStore, setRouteProfile, setRouteStatsInStore, runSurfaceCheck],
  );

  // ── Clip-tangent tool ──
  const handleToggleClipMode = useCallback(() => {
    setClipMode((on) => {
      const next = !on;
      if (!next) setPendingClip(null); // leaving clip mode clears the selection
      trackRb2('clip_mode_toggled', { enabled: next });
      return next;
    });
  }, []);

  // Map routes clicks here while in clip mode (instead of appending a waypoint).
  const handleClipClick = useCallback(
    (coord: Coordinate) => {
      const coords = routeGeometry?.coordinates;
      if (!coords) return;
      const selection = detectClipSelection(coords, coord);
      setPendingClip(selection);
      if (selection) {
        trackRb2('clip_segment_detected', {
          points_removed: selection.stats.pointsRemoved,
          saved_m: Math.round(selection.stats.distanceSaved),
        });
      }
    },
    [routeGeometry],
  );

  const handleCancelClip = useCallback(() => setPendingClip(null), []);

  const handleConfirmClip = useCallback(async () => {
    if (!pendingClip || !routeGeometry) return;
    const coords = routeGeometry.coordinates as Array<[number, number]>;
    setClipBusy(true);
    try {
      const newCoords = (await removeSegmentAndReroute(
        coords,
        pendingClip.startIndex,
        pendingClip.endIndex,
        { profile: routeProfile, mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN },
      )) as Array<[number, number]> | null;
      if (Array.isArray(newCoords) && newCoords.length >= 2) {
        setRouteGeometryInStore({ type: 'LineString', coordinates: newCoords as Coordinate[] });
        // Distance recomputed exactly; the elevation chart re-derives from the
        // new geometry via useRouteAnalysis's geometry-keyed effect.
        const distance_km = parseFloat(polylineLengthKm(newCoords as Coordinate[]).toFixed(1));
        setRouteStatsInStore((prev: Record<string, unknown>) => ({ ...prev, distance_km }));
        setOverlayError((prev) => (prev === 'clip_failed' ? null : prev));
        trackRb2('clip_applied', { points_removed: pendingClip.stats.pointsRemoved });
      } else {
        setOverlayError('clip_failed');
      }
    } catch (e) {
      // Keep the original route on a reroute error, but tell the user —
      // otherwise "confirm clip" appears to do nothing.
      console.warn('[clip] reroute failed, keeping original route', e);
      setOverlayError('clip_failed');
    } finally {
      setClipBusy(false);
      setPendingClip(null); // stay in clip mode for further clips
    }
  }, [pendingClip, routeGeometry, routeProfile, setRouteGeometryInStore, setRouteStatsInStore]);

  // Auto-apply the first suggestion when generate() returns. The hook
  // separates `generate` (writes to aiSuggestions) from `selectSuggestion`
  // (commits geometry + waypoints to the store) — the harness needs that
  // split, but the form-panel UI doesn't surface alternatives in P1.3,
  // so a freshly generated route should land in the live store
  // immediately. Without this, the route renders only from leftover
  // persisted state and manual edits fail with `constraint_infeasible`
  // because waypoints stay empty. Chat-driven generations land here too —
  // candidates are ordered best-first, so suggestion[0] is the winner.
  const lastAppliedRef = useRef<unknown>(null);
  useEffect(() => {
    const first = generation.suggestions[0];
    if (!first || first === lastAppliedRef.current) return;
    lastAppliedRef.current = first;
    generation.selectSuggestion(0);
    const chatCandidate = chatCandidatesRef.current[0];
    if (chatCandidate && chatCandidate.snapshot === first) {
      applyCandidateExtras(chatCandidate);
    }
    // A route just landed — collapse the desktop GenerateBar so the chat
    // reclaims the dock height.
    setGenerateExpanded(false);
  }, [generation, applyCandidateExtras]);

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
    // Strip any elevation 3rd element — waypoint positions are strictly
    // [lng, lat] (T1.2 contract); 3-element positions break road snapping.
    const start: Coordinate = [coords[0][0], coords[0][1]];
    const end: Coordinate = [coords[coords.length - 1][0], coords[coords.length - 1][1]];
    setWaypointsInStore([
      { id: 'wp-0', position: start, type: 'start', name: '' },
      { id: 'wp-1', position: end, type: 'end', name: '' },
    ]);
  }, [routeGeometry, waypoints, setWaypointsInStore]);

  // Build a route FROM a past activity — decode the activity's polyline into
  // the editable route, then frame it (v1 parity). Shared by the
  // `?from_activity=<id>` deep link and the arrival card's past-ride picker.
  const loadRouteFromActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      if (!user?.id) return false;
      try {
        const { data: activity, error } = await supabase
          .from('activities')
          .select('id, name, map_summary_polyline, distance, total_elevation_gain')
          .eq('id', activityId)
          .eq('user_id', user.id)
          .single();
        if (error || !activity?.map_summary_polyline) return false;
        const points = decodePolyline(activity.map_summary_polyline);
        if (points.length < 2) return false;
        const coords = points.map((p) => [p.lng, p.lat] as Coordinate);
        setRouteInStore({
          geometry: { type: 'LineString', coordinates: coords },
          name: activity.name ? `Route from ${activity.name}` : 'Route from activity',
          stats: {
            distance_km: activity.distance ? activity.distance / 1000 : 0,
            elevation_gain_m: activity.total_elevation_gain ?? 0,
            duration_s: 0,
          },
          waypoints: [],
          source: 'imported',
        });
        map.fitBounds(coords);
        trackRb2('route_from_activity', {});
        return true;
      } catch (e) {
        console.error('[rb2] from_activity load failed', e);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, setRouteInStore],
  );

  const fromActivityHandledRef = useRef(false);
  useEffect(() => {
    const fromActivityId = searchParams.get('from_activity');
    if (!fromActivityId || !user?.id || fromActivityHandledRef.current) return;
    fromActivityHandledRef.current = true;
    void loadRouteFromActivity(fromActivityId).finally(() => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('from_activity');
          return p;
        },
        { replace: true },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  const handleClearRoute = () => {
    clearRouteInStore();
    generation.clearSuggestions();
    lastAppliedRef.current = null;
    chatCandidatesRef.current = [];
    savedGeometryRef.current = null;
    // Clearing is deliberate — drop the autosaved draft too so it doesn't
    // resurrect the route on the next visit.
    draftAutosave.discardDraft();
    trackRb2('route_cleared', {});
  };

  // Anything on the map worth clearing? Drives the always-visible Clear button.
  const canClearMap =
    (Array.isArray(waypoints) && waypoints.length > 0) ||
    !!(routeGeometry as { coordinates?: unknown[] } | null)?.coordinates?.length;

  const handleToggleSnap = () => {
    setSnapToRoads(!snapToRoads);
    trackRb2('snap_toggled', { snap_enabled: !snapToRoads });
  };
  const handleChangeProfile = (profile: string) => {
    setRouteProfile(profile);
    trackRb2('route_profile_changed', { profile });
  };

  // Recompute geometry for existing waypoints when the snap mode or routing
  // profile changes (skip the initial mount). Runs post-render so the manual
  // hook reads the fresh store values.
  const settingsRebuildRef = useRef(true);
  useEffect(() => {
    if (settingsRebuildRef.current) {
      settingsRebuildRef.current = false;
      return;
    }
    if (Array.isArray(waypoints) && waypoints.length >= 2) {
      void map.rebuildRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapToRoads, routeProfile]);

  const hasRouteForChat =
    !!routeGeometry?.coordinates && routeGeometry.coordinates.length > 0;

  // Cold-start control fed to the chat dispatcher. On desktop the structured
  // form is folded into the chat dock (GenerateBar), so "expand the form"
  // means open that; on mobile it expands the FormPanel card via its ref.
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const formControl = useRef<FormPanelControl>({
    expand: () => {
      if (isMobileRef.current) {
        // Surface the Build tab (which hosts the form) before expanding it.
        setMobileTab('build');
        formPanelRef.current?.expand();
      } else {
        setGenerateExpanded(true);
      }
    },
  });

  // Plan fresh route candidates from a chat prompt: Claude proposes ~3 real
  // routes (towns/gravel roads to ride through), we geocode + route + measure
  // each, scored best-first. Snapshots land in the suggestions store; the
  // auto-apply effect commits the winner (geometry + stats + resampled
  // editable waypoints) and the chat renders the rest as named option cards.
  const handleGenerateFromPrompt = useCallback(
    async (prompt: string): Promise<GenerateOutcome> => {
      try {
        const candidates = await generatePlannedRouteCandidates(prompt, {
          biasCoord: viewportCenter,
          userLocation: userLocation.coord ?? null,
          placedStart: waypoints?.[0]?.position ?? null,
          weather: weather.weather ?? undefined,
          profile: routeProfile,
          useIterativeBuilder: true,
          accessToken,
        });
        chatCandidatesRef.current = candidates;
        setAiSuggestions(candidates.map((c) => c.snapshot));

        const best = candidates[0];
        const options: RouteOptionSummary[] | undefined =
          candidates.length > 1
            ? candidates.map((c, index) => ({
                index,
                name: c.name,
                distance_km: c.snapshot.stats.distance_km,
                elevation_gain_m: c.snapshot.stats.elevation_gain_m,
                direction_label: c.direction_label,
                familiarity_percent: c.familiarity_percent,
                surface_label: c.surface_profile === 'gravel' ? 'gravel-biased' : undefined,
                gravel_actual_pct: c.gravel_actual_pct,
                gravel_target_pct: c.gravel_target_pct,
                rationale: c.rationale,
              }))
            : undefined;
        return {
          ok: true,
          distance_km: best.snapshot.stats.distance_km,
          elevation_gain_m: best.snapshot.stats.elevation_gain_m,
          name: best.name,
          familiarity_percent: best.familiarity_percent,
          gravel_actual_pct: best.gravel_actual_pct,
          options,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, reason: message === 'NO_START' ? 'no_start' : message };
      }
    },
    [
      accessToken,
      viewportCenter,
      userLocation.coord,
      waypoints,
      weather.weather,
      routeProfile,
      setAiSuggestions,
    ],
  );

  // Switch the map/store to a different chat-generated option. The
  // suggestions array is untouched (no auto-apply refire — that effect only
  // reacts to a *new* array), so switching back and forth is free.
  const handleSelectRouteOption = useCallback(
    (messageId: string, index: number) => {
      const chosen = generation.selectSuggestion(index);
      if (!chosen) return;
      const candidate = chatCandidatesRef.current[index];
      if (candidate && candidate.snapshot === chosen) {
        applyCandidateExtras(candidate);
      }
      chat.updateMessage(messageId, { selectedOptionIndex: index });
      trackRb2('chat_route_option_selected', { option_index: index });
    },
    [generation, applyCandidateExtras, chat],
  );

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
        isImperial,
        append: chat.append,
        setProcessing: chat.setProcessing,
        markRefused: chat.markRefused,
        formPanelControl: formControl.current,
        persistTurn: chat.persistTurn,
        onGenerateFromPrompt: handleGenerateFromPrompt,
      });
    },
    [
      hasRouteForChat,
      routeIdFromUrl,
      isImperial,
      chat.messages,
      chat.append,
      chat.setProcessing,
      chat.markRefused,
      chat.persistTurn,
      handleGenerateFromPrompt,
    ],
  );

  // Load a saved route when a routeId is in the URL. Runs once per id.
  const loadedRouteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeIdFromUrl) return;
    if (loadedRouteIdRef.current === routeIdFromUrl) return;
    loadedRouteIdRef.current = routeIdFromUrl;
    void persistence.loadRoute(routeIdFromUrl).then((ok) => {
      if (ok) savedGeometryRef.current = useRouteBuilderStore.getState().routeGeometry;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIdFromUrl]);

  // Cross-device crash safety: when the builder opens empty (no /ride/:id and
  // nothing restored from localStorage), pull the autosaved server draft.
  useEffect(() => {
    if (routeIdFromUrl) return;
    void draftAutosave.restoreIfEmpty().then((restored) => {
      if (!restored) return;
      const coords = (useRouteBuilderStore.getState().routeGeometry as {
        coordinates?: Coordinate[];
      } | null)?.coordinates;
      if (coords?.length) map.fitBounds(coords);
      notifications.show({
        title: 'Draft restored',
        message: 'Picked up your unsaved route where you left off.',
        color: 'teal',
        autoClose: 5000,
      });
    });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaved = useCallback(
    (id: string) => {
      savedGeometryRef.current = useRouteBuilderStore.getState().routeGeometry;
      // The manual save supersedes any autosaved draft.
      draftAutosave.discardDraft();
      // A new/updated route should appear in Discover next time it opens.
      discoverLoadedRef.current = false;
      // A saved route completes the calendar-arrival flow — retire the pill.
      setArrivalStatus('done');
      clearArrivalSession();
      if (routeIdFromUrl !== id) {
        navigate(`/ride/${id}`, { replace: true });
      }
    },
    [navigate, routeIdFromUrl, draftAutosave],
  );

  const handleLoaded = useCallback(
    (id: string) => {
      savedGeometryRef.current = useRouteBuilderStore.getState().routeGeometry;
      if (routeIdFromUrl !== id) {
        navigate(`/ride/${id}`, { replace: true });
      }
    },
    [navigate, routeIdFromUrl],
  );

  // --- Route discovery: the rider's saved routes ranked by today's target ---
  const nextPlanned = upcomingPlanned.workouts[0] ?? null;
  // The workout the rider arrived with wins over the generic "next planned"
  // lookup (which drops planned rows that don't resolve in the library).
  const arrivalTargetKm = arrivalCtx
    ? arrivalCtx.distanceKm ??
      targetDistanceKm({ targetDurationMinutes: arrivalCtx.durationMinutes })
    : null;
  const discoverTargetKm = arrivalTargetKm ?? targetDistanceKm(nextPlanned);
  const discoverTargetLabel = arrivalCtx
    ? `${arrivalCtx.workoutName ?? 'Planned ride'}${arrivalTargetKm ? ` · ~${arrivalTargetKm} km` : ''}`
    : nextPlanned
      ? `${nextPlanned.name}${discoverTargetKm ? ` · ~${discoverTargetKm} km` : ''}`
      : null;

  const loadDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    const rows = await persistence.listSavedRoutes();
    setDiscoverRoutes(rows);
    setDiscoverLoading(false);
    discoverLoadedRef.current = true;
  }, [persistence]);

  // Lazily fetch the discover list the first time its surface opens, and
  // refresh after a save so a newly-saved route appears.
  useEffect(() => {
    const open = railOpenId === 'discover' || mobileTab === 'discover';
    if (open && !discoverLoadedRef.current) void loadDiscover();
  }, [railOpenId, mobileTab, loadDiscover]);

  const handlePickDiscover = useCallback(
    async (id: string) => {
      const ok = await persistence.loadRoute(id);
      if (ok) {
        handleLoaded(id);
        setRailOpenId(null);
        setMobileTab(null);
      }
    },
    [persistence, handleLoaded],
  );

  const discoverPanel = (
    <DiscoverPanel
      routes={discoverRoutes}
      loading={discoverLoading}
      targetKm={discoverTargetKm}
      targetLabel={discoverTargetLabel}
      onPick={handlePickDiscover}
      isImperial={isImperial}
    />
  );

  // --- Calendar-arrival card: how do you want to ride today's workout? ---
  // A choice minimizes the card to a pill (the rider may change their mind);
  // only saving a route or the explicit X ends the flow and clears storage.
  const minimizeArrival = useCallback(() => {
    setArrivalStatus('minimized');
    if (arrivalCtx) saveArrivalSession(arrivalCtx, 'minimized', { startLocation: arrivalStartLocation });
  }, [arrivalCtx, arrivalStartLocation]);

  const reopenArrival = useCallback(() => {
    setArrivalStatus('open');
    if (arrivalCtx) saveArrivalSession(arrivalCtx, 'open', { startLocation: arrivalStartLocation });
    trackRb2('workout_arrival_reopened', {});
  }, [arrivalCtx, arrivalStartLocation]);

  const endArrival = useCallback(() => {
    setArrivalStatus('done');
    clearArrivalSession();
  }, []);

  const [pastRides, setPastRides] = useState<PastRideOption[]>([]);
  const [pastRidesLoading, setPastRidesLoading] = useState(false);
  const pastRidesLoadedRef = useRef(false);

  const loadPastRides = useCallback(async () => {
    if (!user?.id || pastRidesLoadedRef.current) return;
    pastRidesLoadedRef.current = true;
    setPastRidesLoading(true);
    const { data, error } = await supabase
      .from('activities')
      .select('id, name, start_date, distance, moving_time, type')
      .eq('user_id', user.id)
      .not('map_summary_polyline', 'is', null)
      .order('start_date', { ascending: false })
      .limit(50);
    if (error) console.error('[rb2] past rides load failed', error);
    const rides = (data ?? [])
      .filter((a) => !NON_RIDE_TYPES.includes((a.type as string | null) ?? ''))
      .map((a) => ({
        id: a.id as string,
        name: (a.name as string | null) ?? null,
        startDate: (a.start_date as string | null) ?? null,
        // activities.distance is meters, moving_time is seconds (legacy
        // unsuffixed Strava-shaped columns).
        distanceKm: a.distance ? (a.distance as number) / 1000 : null,
        movingTimeMinutes: a.moving_time ? (a.moving_time as number) / 60 : null,
      }));
    // Narrow to rides similar in time/distance to the workout target.
    setPastRides(
      rankPastRidesByFit(rides, {
        durationMinutes: seedOverride.durationMinutes ?? attachedWorkout?.duration ?? null,
        distanceKm: typeof seedOverride.distanceKm === 'number' ? seedOverride.distanceKm : null,
      }),
    );
    setPastRidesLoading(false);
  }, [user?.id, seedOverride, attachedWorkout]);

  const handleArrivalNew = useCallback(
    (startLocation: string) => {
      trackRb2('workout_arrival_choice', {
        choice: 'new',
        has_start_preference: !!startLocation,
      });
      if (routeIdFromUrl && arrivalCtx) {
        // Editing a saved route — generating here and quick-saving would
        // overwrite it. Hop back to /ride/new; the session carries the
        // choice across the remount (pendingNew expands the seeded form).
        saveArrivalSession(arrivalCtx, 'minimized', { startLocation, pendingNew: true });
        navigate('/ride/new');
        return;
      }
      setArrivalStartLocation(startLocation);
      setSeedNonce((n) => n + 1);
      setArrivalChoseNew(true);
      setArrivalStatus('minimized');
      if (arrivalCtx) saveArrivalSession(arrivalCtx, 'minimized', { startLocation });
      formControl.current.expand();
    },
    [routeIdFromUrl, arrivalCtx, navigate],
  );

  const handleArrivalSaved = useCallback(() => {
    minimizeArrival();
    if (isMobileRef.current) setMobileTab('discover');
    else setRailOpenId('discover');
    trackRb2('workout_arrival_choice', { choice: 'saved' });
  }, [minimizeArrival]);

  const handleArrivalPastPick = useCallback(
    (activityId: string) => {
      void loadRouteFromActivity(activityId).then((ok) => {
        if (ok) minimizeArrival();
      });
      trackRb2('workout_arrival_choice', { choice: 'past_ride' });
    },
    [loadRouteFromActivity, minimizeArrival],
  );

  const handleArrivalDismiss = useCallback(() => {
    endArrival();
    trackRb2('workout_arrival_choice', { choice: 'dismissed' });
  }, [endArrival]);

  // Target line under the card title, e.g. "75 min · ~25 mi".
  const arrivalDetailLabel = useMemo(() => {
    const parts: string[] = [];
    const minutes = seedOverride.durationMinutes ?? attachedWorkout?.duration;
    if (minutes) parts.push(`${minutes} min`);
    const km = typeof seedOverride.distanceKm === 'number' ? seedOverride.distanceKm : null;
    if (km) {
      parts.push(isImperial ? `~${Math.round(km * 0.621371)} mi` : `~${Math.round(km)} km`);
    }
    return parts.length ? parts.join(' · ') : null;
  }, [seedOverride, attachedWorkout, isImperial]);

  const arrivalCardNode = showArrivalCard ? (
    <WorkoutArrivalCard
      workoutLabel={workoutName}
      detailLabel={arrivalDetailLabel}
      onChooseNew={handleArrivalNew}
      onChooseSaved={handleArrivalSaved}
      onLoadPastRides={() => void loadPastRides()}
      pastRides={pastRides}
      pastRidesLoading={pastRidesLoading}
      onPickPastRide={handleArrivalPastPick}
      onDismiss={handleArrivalDismiss}
      isImperial={isImperial}
    />
  ) : null;

  // Minimized arrival: a reopenable pill so a choice isn't a one-way door.
  const arrivalPillNode =
    !showArrivalCard && arrivalStatus === 'minimized' && arrivalCtx ? (
      <WorkoutArrivalPill
        workoutLabel={workoutName}
        onOpen={reopenArrival}
        isMobile={!!isMobile}
      />
    ) : null;

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

  // Undo/redo keyboard shortcuts (⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z or Ctrl+Y).
  // Ignored while typing in an input/textarea so chat and form fields keep
  // their native undo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (key === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history]);

  // Cue backfill: providers other than Stadia (BRouter gravel, GraphHopper,
  // GPX imports, loaded routes) return no turn data, so when a settled route
  // has no cues, map-match its geometry through Valhalla's trace endpoint.
  // One attempt per geometry — failures stay silent (cues are an extra).
  const cueBackfillAttemptedRef = useRef<unknown>(null);
  useEffect(() => {
    const coords = (routeGeometry as { coordinates?: [number, number][] } | null)?.coordinates;
    if (routeCues || !coords || coords.length < 10) return;
    // Freehand lines are deliberately off-road; matching them to roads would
    // invent turns the rider isn't taking. Keyed on how THIS route was built
    // (stats.routingSource), not the edit-mode snap toggle — the toggle is
    // persisted and says nothing about a generated/loaded route.
    if ((routeStats as { routingSource?: string } | null)?.routingSource === 'freehand') return;
    if (cueBackfillAttemptedRef.current === routeGeometry) return;
    const timer = setTimeout(() => {
      cueBackfillAttemptedRef.current = routeGeometry;
      console.log('🧭 Cue backfill: map-matching route for turn cues…');
      void import('../utils/stadiaMapsRouter').then(({ getStadiaCuesForGeometry }) =>
        (getStadiaCuesForGeometry(coords) as Promise<unknown[] | null>).then((cues) => {
          if (!cues) {
            trackRb2('cues_backfill_failed', { point_count: coords.length });
            return;
          }
          // Only apply if the geometry hasn't moved on while we fetched.
          if (useRouteBuilderStore.getState().routeGeometry === routeGeometry) {
            useRouteBuilderStore.getState().setRouteCues(cues);
            trackRb2('cues_backfilled', { cue_count: cues.length });
          }
        }),
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [routeGeometry, routeCues, routeStats]);

  const handleVisibilityToggle = (key: keyof LayerVisibilityState, next: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: next }));
    // The wind overlay needs weather data — fetch it lazily on first enable,
    // the same data the Weather panel uses (shared hook, so it's cached).
    if (key === 'wind' && next && weather.status === 'idle') {
      void weather.refresh();
    }
  };

  const handlePoiLayerToggle = (layer: Parameters<typeof analysis.togglePOILayer>[0]) => {
    void analysis.togglePOILayer(layer);
  };

  // Attach a workout from the in-builder picker: light up the overlay, seed the
  // generate form (via remount key + formSeed), expand it, and close the flyout.
  const handleSelectWorkout = (
    workout: WorkoutDefinition,
    planned?: { targetDurationMinutes: number | null; targetDistanceKm: number | null },
  ) => {
    setPickedWorkoutId(workout.id);
    setSeedOverride({
      durationMinutes: planned?.targetDurationMinutes ?? undefined,
      distanceKm: planned?.targetDistanceKm ?? undefined,
    });
    setVisibility((prev) => ({ ...prev, intervals: true }));
    setGenerateExpanded(true);
    setRailOpenId(null);
    trackRb2('workout_attached', { workout_id: workout.id, source: planned ? 'planned' : 'library' });
  };

  const handleClearWorkout = () => {
    setPickedWorkoutId(null);
    setSeedOverride({});
  };

  const hasRoute = !!routeGeometry?.coordinates && routeGeometry.coordinates.length > 0;
  const isLoading = generation.isGenerating || editing.isApplying || map.isApplying;
  const errorRaw =
    generation.lastError ||
    editing.lastError ||
    map.lastError ||
    persistence.lastError ||
    overlayError ||
    analysis.lastError ||
    weather.error ||
    null;
  const error =
    errorRaw && errorRaw !== errorDismissed ? friendlyRouteError(errorRaw) : null;
  const dismissError = () => setErrorDismissed(errorRaw);
  // Reset dismissal once the error clears so the next failure — even an
  // identical one — shows again instead of being silently swallowed.
  useEffect(() => {
    if (!errorRaw) setErrorDismissed(null);
  }, [errorRaw]);

  // Reasonable narrowed geometry typing for layer props
  const geometryForLayers = useMemo(() => {
    if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return null;
    return {
      type: 'LineString' as const,
      coordinates: routeGeometry.coordinates as Coordinate[],
    };
  }, [routeGeometry]);

  // Scale the attached workout's structure onto the current route (km-keyed
  // cues), reused by the elevation bands and the map intervals line.
  const workoutCues = useMemo<WorkoutCue[] | null>(() => {
    if (!attachedWorkout || !geometryForLayers || geometryForLayers.coordinates.length < 2) {
      return null;
    }
    const cues = generateCuesFromWorkoutStructure(
      {
        coordinates: geometryForLayers.coordinates,
        distance: routeStats?.distance_km,
      },
      attachedWorkout,
    );
    return (cues as WorkoutCue[] | null) ?? null;
  }, [attachedWorkout, geometryForLayers, routeStats?.distance_km]);

  // Cues actually painted (respects the layer toggle).
  const visibleCues = visibility.intervals ? workoutCues : null;

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

  // "Back to start" — append the start coordinate as a new end so the router
  // closes the loop. Disabled when the route already returns to its start.
  const firstWpPos = waypointsForMap[0]?.position;
  const lastWpPos = waypointsForMap[waypointsForMap.length - 1]?.position;
  const isClosedLoop =
    !!firstWpPos &&
    !!lastWpPos &&
    Math.abs(firstWpPos[0] - lastWpPos[0]) < 1e-6 &&
    Math.abs(firstWpPos[1] - lastWpPos[1]) < 1e-6;
  const canCloseLoop = waypointsForMap.length >= 2 && !isClosedLoop;
  const handleCloseLoop = () => {
    if (!firstWpPos || waypointsForMap.length < 2) return;
    void map.handleAddWaypointAtClick(firstWpPos);
    trackRb2('close_loop', {});
  };

  // The map + its layers — shared by both layouts. Fills its container.
  const mapElement = (
    <Map
      map={map}
      routeGeometry={geometryForLayers}
      showRouteLine={
        !visibility.surface && !visibility.gradient && !(visibility.intervals && workoutCues)
      }
      waypoints={waypointsForMap}
      cursor="crosshair"
      mapStyle={basemapStyle}
      basemapId={basemapId}
      onBasemapChange={setBasemapId}
      userLocation={userLocation.coord}
      onGeolocate={userLocation.requestLocation}
      isLocating={userLocation.status === 'locating'}
      isImperial={isImperial}
      isMobile={isMobile}
      clipMode={clipMode}
      onClipClick={handleClipClick}
      clipHighlight={pendingClip?.highlightGeoJSON ?? null}
    >
      <ElevationHoverMarker geometry={geometryForLayers} />
      {visibility.surface && (
        <SurfaceLayer geometry={geometryForLayers} onSegments={setSurfaceSegments} />
      )}
      {visibility.gradient && !visibility.surface && (
        <GradientLayer geometry={geometryForLayers} />
      )}
      {visibility.intervals && !visibility.surface && !visibility.gradient && (
        <IntervalsLayer geometry={geometryForLayers} cues={workoutCues} />
      )}
      {visibility.poi && (
        <POILayer
          poiResults={analysis.poiResults}
          activeLayers={analysis.activeLayers}
          onAddWaypoint={(coord) => void map.handleAddWaypointAtClick(coord)}
        />
      )}
      {visibility.bikeInfra && (
        <BikeInfraLayer
          bbox={viewportBbox}
          visible
          onLoadFailure={(failed) =>
            setOverlayError((prev) =>
              failed ? 'bike_infra_failed' : prev === 'bike_infra_failed' ? null : prev,
            )
          }
        />
      )}
      {visibility.familiar && (
        <FamiliarSegmentsLayer
          bbox={viewportBbox}
          visible
          onLoadFailure={(failed) =>
            setOverlayError((prev) =>
              failed ? 'familiar_segments_failed' : prev === 'familiar_segments_failed' ? null : prev,
            )
          }
        />
      )}
      {visibility.wind && weather.weather && geometryForLayers && (
        <WindArrowsLayer
          coordinates={geometryForLayers.coordinates}
          windDegrees={weather.weather.windDegrees}
          windSpeed={weather.weather.windSpeed}
        />
      )}
    </Map>
  );

  // The rider's Strava speed profile personalizes the ETA (v1 parity). Fetched
  // once; null until loaded (ETA then falls back to a profile-based pace).
  const [speedProfile, setSpeedProfile] = useState<unknown>(null);
  useEffect(() => {
    let cancelled = false;
    (stravaService as { getSpeedProfile?: () => Promise<unknown> })
      .getSpeedProfile?.()
      .then((p) => {
        if (!cancelled) setSpeedProfile(p ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Terrain-, surface- and (when available) rider-speed-adjusted ride time
  // (v1 parity) — better than the router's raw duration. Falls back to the raw
  // duration when no elevation profile is available yet.
  const personalizedEta = useMemo(() => {
    const dist = routeStats?.distance_km;
    const profile = analysis.elevationProfile;
    if (!dist || dist <= 0 || !profile || profile.length < 2) return null;
    try {
      return calculatePersonalizedETA({
        distanceKm: dist,
        elevationProfile: profile.map((p) => ({ distance: p.distance_km, elevation: p.elevation_m })),
        surfaceDistribution: surfaceSegments ? computeSurfaceDistribution(surfaceSegments) : undefined,
        speedProfile: (speedProfile ?? undefined) as object | undefined,
        routeProfile,
        trainingGoal,
      }) as { totalSeconds?: number };
    } catch {
      return null;
    }
  }, [routeStats?.distance_km, analysis.elevationProfile, surfaceSegments, speedProfile, routeProfile, trainingGoal]);

  // Reusable v1 widgets surfaced in RB2 (after personalizedEta is computed).
  const roadPrefsNode = <RoadPreferencesCard />;
  const raceDayGuideNode = raceType ? (
    <RaceDayGuide
      routeStats={routeStats}
      personalizedETA={personalizedEta}
      raceType={raceType}
      raceDate={raceDate}
      targetFinishMinutes={targetFinishMinutes}
      weatherData={weather.weather}
      useImperial={isImperial}
    />
  ) : null;

  // Save from the stats card: an already-saved route updates in place; an
  // unnamed one opens the Save modal (via the Routes flyout/tab) to get a name.
  const handleQuickSave = useCallback(async () => {
    if (persistence.savedRouteId) {
      const saved = await persistence.save();
      if (saved) handleSaved(saved.id);
      return;
    }
    if (isMobile) setMobileTab('routes');
    else setRailOpenId('routes');
    setOpenSaveSignal((s) => s + 1);
  }, [persistence, isMobile, handleSaved]);

  const statsNode =
    hasRoute && routeStats ? (
      <StatsOverlay
        stats={{
          distance_km: routeStats.distance_km,
          elevation_gain_m: routeStats.elevation_gain_m,
          duration_s: personalizedEta?.totalSeconds ?? routeStats.duration_s,
        }}
        routeName={routeName}
        onClear={handleClearRoute}
        isImperial={isImperial}
        surfaceSegments={surfaceSegments}
        onSave={() => void handleQuickSave()}
        saveState={
          persistence.isSaving ? 'saving' : hasUnsavedChanges ? 'unsaved' : 'saved'
        }
      />
    ) : null;

  const loadingMessage = generation.isGenerating
    ? 'Generating route…'
    : editing.isApplying
      ? 'Applying edit…'
      : 'Updating route…';

  const mapStates = (
    <>
      {isLoading && <LoadingState message={loadingMessage} />}
      {error && <ErrorState message={error} onDismiss={dismissError} />}
      {arrivalCardNode}
      {arrivalPillNode}
      {!hasRoute && !isLoading && !arrivalCardNode && <EmptyState isGuest={!user} />}
    </>
  );

  // Guest daily generation cap — the signup prompt is the surface, not the
  // error banner. clearSuggestions resets the flag on dismiss.
  const guestCapModal = (
    <GuestSaveModal
      opened={generation.guestCapHit}
      onClose={generation.clearSuggestions}
      trigger="gen_cap"
    />
  );

  // ---- Desktop: rail + map(+elevation) + chat regions ----
  if (!isMobile) {
    const railItems: RailItem[] = [
      {
        id: 'layers',
        label: 'Layers',
        icon: <StackIcon size={20} weight="duotone" />,
        badge:
          (visibility.surface ? 1 : 0) +
          (visibility.gradient ? 1 : 0) +
          (visibility.wind ? 1 : 0) +
          (visibility.bikeInfra ? 1 : 0) +
          (visibility.familiar ? 1 : 0) +
          (visibility.poi ? 1 : 0),
        panel: (
          <>
            <LayerToggles
              visibility={visibility}
              onToggle={handleVisibilityToggle}
              onPoiLayerToggle={handlePoiLayerToggle}
              activePoiLayers={analysis.activeLayers}
              isMobile
              hasStravaConnection={false}
              hasWorkout={hasWorkout}
            />
            {visibility.gradient && hasRoute && (
              <Box style={{ marginTop: 10 }}>
                <GradientLegend isMobile />
              </Box>
            )}
            {visibility.surface && hasRoute && (
              <Box style={{ marginTop: 10 }}>
                <SurfaceSummaryBar segments={surfaceSegments} isMobile />
              </Box>
            )}
            {visibility.wind && hasRoute && (
              <Box style={{ marginTop: 10 }}>
                <WindLegend weather={weather} isMobile />
              </Box>
            )}
            {visibility.bikeInfra && (
              <Box style={{ marginTop: 10 }}>
                <BikeInfrastructureLegend visible />
              </Box>
            )}
          </>
        ),
      },
      {
        id: 'workout',
        label: 'Workout',
        icon: <Barbell size={20} weight="duotone" />,
        badge: hasWorkout ? 1 : 0,
        panel: (
          <WorkoutPickerPanel
            plannedWorkouts={upcomingPlanned.workouts}
            selectedWorkoutId={pickedWorkoutId}
            onSelect={handleSelectWorkout}
            onClear={handleClearWorkout}
          />
        ),
      },
      {
        id: 'search',
        label: 'Search',
        icon: <MagnifyingGlass size={20} weight="duotone" />,
        panel: <LocationSearch onFlyTo={map.flyTo} proximity={viewportCenter} />,
      },
      {
        id: 'discover',
        label: 'Discover',
        icon: <Compass size={20} weight="duotone" />,
        panel: discoverPanel,
      },
      {
        id: 'waypoints',
        label: 'Waypoints',
        icon: <MapPin size={20} weight="duotone" />,
        disabled: !hasRoute,
        badge: waypointsForMap.length,
        panel: (
          <WaypointListPanel
            waypoints={waypointsForMap}
            onRemove={(idx) => void map.handleRemoveWaypoint(idx)}
            onReorder={(from, to) => void map.handleReorderWaypoints(from, to)}
            isMobile
          />
        ),
      },
      {
        id: 'weather',
        label: 'Weather',
        icon: <CloudSun size={20} weight="duotone" />,
        disabled: !hasRoute,
        panel: <WeatherPanel weather={weather} isImperial={isImperial} />,
      },
      {
        id: 'cues',
        label: 'Cues',
        icon: <Signpost size={20} weight="duotone" />,
        disabled: !hasRoute,
        panel: <CuesPanel cues={routeCues as RouteCueType[] | null} isImperial={isImperial} />,
      },
      {
        id: 'fuel',
        label: 'Fuel',
        icon: <ForkKnife size={20} weight="duotone" />,
        disabled: !hasRoute,
        panel: (
          <>
            <FuelPanel
              durationMinutes={(routeStats?.duration_s ?? 0) / 60}
              elevationGainMeters={routeStats?.elevation_gain_m ?? 0}
              weather={weather.weather}
              isImperial={isImperial}
            />
            <Box style={{ marginTop: 12 }}>
              <RaceDetailsCard />
            </Box>
            {raceDayGuideNode && <Box style={{ marginTop: 12 }}>{raceDayGuideNode}</Box>}
          </>
        ),
      },
      {
        // Not gated on a route — the calculator is useful standalone, and
        // seeds surface/width from the route profile when one exists.
        id: 'tire',
        label: 'Tire PSI',
        icon: <Gauge size={20} weight="duotone" />,
        panel: <TirePressurePanel routeProfile={routeProfile} isImperial={isImperial} />,
      },
      {
        id: 'roadprefs',
        label: 'Road prefs',
        icon: <SlidersHorizontal size={20} weight="duotone" />,
        panel: roadPrefsNode,
      },
      {
        // Always enabled: Load and Import GPX are entry points that work with
        // no current route (Save/Export disable themselves inside the panel).
        id: 'routes',
        label: 'Routes',
        icon: <FolderOpen size={20} weight="duotone" />,
        panel: (
          <RouteActionsPanel
            persistence={persistence}
            defaultName={routeName}
            defaultDescription={routeDescription}
            hasRoute={hasRoute}
            onSaved={handleSaved}
            onLoaded={handleLoaded}
            onImported={(coords) => map.fitBounds(coords)}
            openSaveSignal={openSaveSignal}
            isMobile
          />
        ),
      },
    ];

    return (
      <AppShell fullWidth>
        {guestCapModal}
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
          <RB2DesktopLayout
            left={
              <ControlRail
                items={railItems}
                openId={railOpenId}
                onOpenChange={setRailOpenId}
              />
            }
            statsStrip={statsNode}
            mapArea={
              <>
                {mapElement}
                <Box style={{ position: 'absolute', top: 12, right: 12, zIndex: 25 }}>
                  <PersonaDropdown persona={coach.persona} onChange={onPersonaChange} />
                </Box>
                <Box
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 25,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <EditToolbar
                    canUndo={history.canUndo}
                    canRedo={history.canRedo}
                    onUndo={history.undo}
                    onRedo={history.redo}
                    onReverse={() => void map.handleReverseRoute()}
                    canReverse={waypointsForMap.length >= 2}
                    onCloseLoop={handleCloseLoop}
                    canCloseLoop={canCloseLoop}
                    onToggleSnap={handleToggleSnap}
                    snapEnabled={snapToRoads}
                    routeProfile={routeProfile}
                    onChangeProfile={handleChangeProfile}
                    unitsImperial={isImperial}
                    onToggleUnits={() =>
                      void updateUnitsPreference(isImperial ? 'metric' : 'imperial')
                    }
                    onToggleClipMode={hasRoute ? handleToggleClipMode : undefined}
                    clipMode={clipMode}
                    onClear={handleClearRoute}
                    canClear={canClearMap}
                  />
                  {clipMode && pendingClip && (
                    <ClipConfirmCard
                      stats={pendingClip.stats}
                      isImperial={isImperial}
                      busy={clipBusy}
                      onConfirm={handleConfirmClip}
                      onCancel={handleCancelClip}
                    />
                  )}
                  {clipMode && !pendingClip && (
                    <ClipHint />
                  )}
                  {!clipMode && !isLoading && (
                    <ClickToPlaceHint snapEnabled={snapToRoads} hasRoute={hasRoute} />
                  )}
                </Box>
                {mapStates}
              </>
            }
            elevation={
              hasRoute || hasWorkout ? (
                <>
                  {hasWorkout && (
                    <Box style={{ padding: '8px 12px 0' }}>
                      <WorkoutOverlayLegend workoutName={workoutName} cues={visibleCues} />
                    </Box>
                  )}
                  {hasRoute && (
                    <ElevationDock
                      profile={analysis.elevationProfile}
                      collapsed={elevationCollapsed}
                      onCollapsedChange={setElevationCollapsed}
                      onHoverKm={setElevationHoverKm}
                      isImperial={isImperial}
                      cues={visibleCues}
                    />
                  )}
                </>
              ) : undefined
            }
            chat={
              <ChatDock
                collapsed={chatCollapsed}
                onCollapsedChange={setChatCollapsed}
                messages={chat.messages}
                isProcessing={chat.isProcessing}
                exampleHint={EXAMPLE_PHRASES}
                showAfterRefuseHint={chat.showAfterRefuseHint}
                onSubmit={handleChatSubmit}
                onSelectOption={handleSelectRouteOption}
                isImperial={isImperial}
                header={
                  <GenerateBar
                    key={`gen-${pickedWorkoutId ?? 'none'}-${seedNonce}`}
                    generation={generation}
                    defaultStart={userLocation.coord}
                    locationStatus={userLocation.status}
                    viewportCenter={viewportCenter}
                    expanded={generateExpanded}
                    onExpandedChange={setGenerateExpanded}
                    isImperial={isImperial}
                    formSeed={formSeed}
                    activeRouteProfile={hasRouteForChat ? routeProfile : null}
                  />
                }
              />
            }
          />
        </Box>
      </AppShell>
    );
  }

  // ---- Mobile: map-first — compact top bar + bottom-sheet tools ----
  const activeLayerCount =
    (visibility.surface ? 1 : 0) +
    (visibility.gradient ? 1 : 0) +
    (visibility.wind ? 1 : 0) +
    (visibility.bikeInfra ? 1 : 0) +
    (visibility.familiar ? 1 : 0) +
    (visibility.poi ? 1 : 0);

  const cardStyle = {
    backgroundColor: RB2.cardBg,
    border: `1px solid ${RB2.border}`,
    padding: '10px 12px',
    boxShadow: RB2.shadowCard,
  };

  const mobileTabs: MobileSheetTab[] = [
    {
      id: 'build',
      label: 'Build',
      icon: <PencilSimpleLine size={18} />,
      content: (
        <>
          <Box style={cardStyle}>
            <LocationSearch onFlyTo={map.flyTo} proximity={viewportCenter} />
          </Box>
          <FormPanel
            key={`form-${pickedWorkoutId ?? 'none'}-${seedNonce}`}
            ref={formPanelRef}
            generation={generation}
            defaultStart={userLocation.coord}
            locationStatus={userLocation.status}
            viewportCenter={viewportCenter}
            isMobile
            isImperial={isImperial}
            formSeed={formSeed}
            defaultExpanded={hasWorkout || arrivalChoseNew}
            activeRouteProfile={hasRouteForChat ? routeProfile : null}
          />
          <Box style={cardStyle}>
            <WorkoutPickerPanel
              plannedWorkouts={upcomingPlanned.workouts}
              selectedWorkoutId={pickedWorkoutId}
              onSelect={handleSelectWorkout}
              onClear={handleClearWorkout}
              isMobile
            />
          </Box>
          <Box style={cardStyle}>{roadPrefsNode}</Box>
        </>
      ),
    },
    {
      id: 'layers',
      label: 'Layers',
      icon: <StackIcon size={18} weight="duotone" />,
      badge: activeLayerCount,
      content: (
        <>
          <LayerToggles
            visibility={visibility}
            onToggle={handleVisibilityToggle}
            onPoiLayerToggle={handlePoiLayerToggle}
            activePoiLayers={analysis.activeLayers}
            isMobile
            hasStravaConnection={false}
            hasWorkout={hasWorkout}
          />
          {hasWorkout && (
            <WorkoutOverlayLegend workoutName={workoutName} cues={visibleCues} isMobile />
          )}
          {visibility.gradient && hasRoute && <GradientLegend isMobile />}
          {visibility.surface && hasRoute && (
            <SurfaceSummaryBar segments={surfaceSegments} isMobile />
          )}
          {visibility.wind && hasRoute && <WindLegend weather={weather} isMobile />}
          {visibility.bikeInfra && <BikeInfrastructureLegend visible />}
        </>
      ),
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: <ChartLineUp size={18} />,
      content: hasRoute ? (
        <>
          <Box style={cardStyle}>
            <WeatherPanel weather={weather} isImperial={isImperial} />
          </Box>
          <Box style={cardStyle}>
            <FuelPanel
              durationMinutes={(routeStats?.duration_s ?? 0) / 60}
              elevationGainMeters={routeStats?.elevation_gain_m ?? 0}
              weather={weather.weather}
              isImperial={isImperial}
            />
          </Box>
          <Box style={cardStyle}>
            <TirePressurePanel routeProfile={routeProfile} isImperial={isImperial} />
          </Box>
          <Box style={cardStyle}>
            <RaceDetailsCard />
          </Box>
          {raceDayGuideNode && <Box style={cardStyle}>{raceDayGuideNode}</Box>}
        </>
      ) : (
        <Text
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: 13,
            color: RB2.textTertiary,
            textAlign: 'center',
            padding: '24px 8px',
          }}
        >
          Build a route to see weather, fueling, and tire pressure.
        </Text>
      ),
    },
    {
      id: 'route',
      label: 'Route',
      icon: <FloppyDisk size={18} />,
      content: (
        <>
          {hasRoute && (
            <ElevationPanel
              profile={analysis.elevationProfile}
              isMobile
              onHoverKm={setElevationHoverKm}
              isImperial={isImperial}
              cues={visibleCues}
            />
          )}
          {hasRoute && !!routeCues?.length && (
            <Box style={cardStyle}>
              <CuesPanel cues={routeCues as RouteCueType[] | null} isImperial={isImperial} />
            </Box>
          )}
          <RouteActionsPanel
            persistence={persistence}
            defaultName={routeName}
            defaultDescription={routeDescription}
            hasRoute={hasRoute}
            onSaved={handleSaved}
            onLoaded={handleLoaded}
            onImported={(coords) => map.fitBounds(coords)}
            openSaveSignal={openSaveSignal}
            isMobile
          />
        </>
      ),
    },
    {
      id: 'discover',
      label: 'Discover',
      icon: <Compass size={18} />,
      content: discoverPanel,
    },
    {
      id: 'chat',
      label: 'Coach',
      icon: <ChatCircleDots size={18} />,
      content: (
        <ChatBody
          messages={chat.messages}
          isProcessing={chat.isProcessing}
          exampleHint={EXAMPLE_PHRASES}
          showAfterRefuseHint={chat.showAfterRefuseHint}
          onSubmit={handleChatSubmit}
          onSelectOption={handleSelectRouteOption}
          isImperial={isImperial}
        />
      ),
    },
  ];

  return (
    <AppShell fullWidth>
      {guestCapModal}
      <Box
        data-testid="rb2-page"
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100dvh - 63px)',
          backgroundColor: RB2.bgBase,
          overflow: 'hidden',
        }}
      >
        <Box style={{ position: 'absolute', inset: 0 }}>{mapElement}</Box>

        {/* Compact top bar — stays out of the map's way (clicks pass through gaps). */}
        <Box
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          <Box
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
              pointerEvents: 'auto',
            }}
          >
            <Box style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}>
              <EditToolbar
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                onReverse={() => void map.handleReverseRoute()}
                canReverse={waypointsForMap.length >= 2}
                onCloseLoop={handleCloseLoop}
                canCloseLoop={canCloseLoop}
                onToggleSnap={handleToggleSnap}
                snapEnabled={snapToRoads}
                routeProfile={routeProfile}
                onChangeProfile={handleChangeProfile}
                unitsImperial={isImperial}
                onToggleUnits={() =>
                  void updateUnitsPreference(isImperial ? 'metric' : 'imperial')
                }
                onToggleClipMode={hasRoute ? handleToggleClipMode : undefined}
                clipMode={clipMode}
                onClear={handleClearRoute}
                canClear={canClearMap}
              />
            </Box>
            <Box style={{ flexShrink: 0 }}>
              <PersonaDropdown persona={coach.persona} onChange={onPersonaChange} compact />
            </Box>
          </Box>
          {statsNode && <Box style={{ pointerEvents: 'auto' }}>{statsNode}</Box>}
          {clipMode && pendingClip && (
            <Box style={{ pointerEvents: 'auto', alignSelf: 'flex-start' }}>
              <ClipConfirmCard
                stats={pendingClip.stats}
                isImperial={isImperial}
                busy={clipBusy}
                onConfirm={handleConfirmClip}
                onCancel={handleCancelClip}
              />
            </Box>
          )}
          {clipMode && !pendingClip && (
            <Box style={{ pointerEvents: 'auto', alignSelf: 'flex-start' }}>
              <ClipHint />
            </Box>
          )}
          {!clipMode && !isLoading && (
            <Box style={{ pointerEvents: 'auto', alignSelf: 'flex-start' }}>
              <ClickToPlaceHint snapEnabled={snapToRoads} hasRoute={hasRoute} isMobile />
            </Box>
          )}
        </Box>

        <MobileControlSheet
          tabs={mobileTabs}
          activeId={mobileTab}
          onActiveChange={setMobileTab}
        />

        {arrivalCardNode}
        {arrivalPillNode}
        {isLoading && <LoadingState message={loadingMessage} />}
        {error && <ErrorState message={error} onDismiss={dismissError} />}
      </Box>
    </AppShell>
  );
}

/**
 * Map a raw `lastError` reason (from the hooks) to human-readable copy for the
 * on-map ErrorState. Unknown values pass through when they read like copy the
 * hooks wrote for the user; messages that look like technical noise (network
 * stack text, HTTP codes, exception names) get generic copy instead — the raw
 * message still lands in the console for debugging.
 */
const TECHNICAL_ERROR_RE =
  /(TypeError|ReferenceError|SyntaxError|NetworkError|Failed to fetch|Load failed|status(?: code)? \d{3}|HTTP \d{3}|\b[45]\d{2}\b|api[_ ]?key|access[_ ]?token|\bundefined\b|\bnull\b|timed? ?out|abort(?:ed|Error)|ECONN|JSON)/i;

function friendlyRouteError(raw: string): string {
  const KNOWN: Record<string, string> = {
    routing_failed:
      "Couldn't route through there — try moving a point, or switch the routing profile.",
    no_current_route: 'No route yet — generate or draw one first.',
    'no current route': 'No route yet — generate or draw one first.',
    no_route: 'No route yet — generate or draw one first.',
    chat_translation_unavailable: "I couldn't act on that one — try rephrasing it.",
    'No route to save': 'Draw or generate a route before saving.',
    'No route to send': 'Draw or generate a route before sending it to your device.',
    'No route to export': 'Draw or generate a route before exporting.',
    context_missing: 'Sign in to use the coach.',
    not_authenticated: 'Sign in to use the coach.',
    clip_failed: "Couldn't reroute around that section — the route is unchanged. Try a smaller clip.",
    bike_infra_failed: "Couldn't load bike infrastructure right now — try toggling the layer again.",
    familiar_segments_failed:
      "Couldn't load your familiar roads right now — try toggling the layer again.",
  };
  const known = KNOWN[raw];
  if (known) return known;
  if (raw.length > 160 || TECHNICAL_ERROR_RE.test(raw)) {
    console.warn('[rb2] unmapped error shown generically:', raw);
    return 'Something went wrong — please try again.';
  }
  return raw;
}

/**
 * Small on-map hint nudging the manual-editing model. Before a route exists it
 * teaches the first click; once a route exists it keeps the reshape / remove
 * affordances discoverable (the cursor stays a crosshair throughout).
 */
function ClipHint() {
  return (
    <Box
      data-testid="rb2-clip-hint"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        boxShadow: RB2.shadowCard,
        padding: '6px 10px',
        maxWidth: 360,
        pointerEvents: 'none',
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 11,
          color: RB2.textSecondary,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        Click a spur to clip it off
      </Text>
    </Box>
  );
}

function ClickToPlaceHint({
  snapEnabled,
  hasRoute,
  isMobile,
}: {
  snapEnabled: boolean;
  hasRoute?: boolean;
  isMobile?: boolean;
}) {
  const copy = hasRoute
    ? 'Drag the line to reshape · drag a point to move · right-click a point to remove'
    : `Click the map to drop waypoints${snapEnabled ? ' — snapped to roads' : ' — freehand lines'}`;
  return (
    <Box
      data-testid="rb2-click-to-place-hint"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        boxShadow: RB2.shadowCard,
        padding: '6px 10px',
        maxWidth: isMobile ? '100%' : 360,
        pointerEvents: 'none',
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 11,
          color: hasRoute ? RB2.textTertiary : RB2.textSecondary,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        {copy}
      </Text>
    </Box>
  );
}
