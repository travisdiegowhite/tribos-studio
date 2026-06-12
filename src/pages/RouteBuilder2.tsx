/**
 * RouteBuilder2 — Phase 1 page composition (P1.3).
 *
 * Layout B: map-dominant. Form panel collapsible upper-left, layer
 * toggles below, persona dropdown top-right, waypoint list bottom-left,
 * chat floating bottom-right (desktop) or bottom-sheet (mobile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@mantine/core';
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
import { Stack as StackIcon, MapPin, FolderOpen, MagnifyingGlass, CloudSun, ForkKnife, Gauge, Barbell, PencilSimpleLine, ChartLineUp, FloppyDisk, ChatCircleDots } from '@phosphor-icons/react';
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
import type { WorkoutDefinition } from '../types/training';
import { trackRb2 } from '../features/route-builder-v2/telemetry/trackRb2';
import { coordinateAtDistanceKm } from '../utils/elevation';
import { getAnyWorkoutById } from '../data/workoutLookup';
import {
  generateRouteCandidatesFromNaturalLanguage,
  type RouteCandidate,
} from '../utils/naturalLanguageRouteCandidates';
import { fetchRouteSurfaceData, computeSurfaceDistribution } from '../utils/surfaceOverlay.js';
import type { GenerateOutcome, RouteOptionSummary } from '../features/route-builder-v2/chat';
import { generateCuesFromWorkoutStructure } from '../utils/intervalCues.js';
import {
  categoryToGoal,
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
  const [searchParams] = useSearchParams();
  const [pickedWorkoutId, setPickedWorkoutId] = useState<string | null>(
    searchParams.get('workoutId'),
  );
  const [seedOverride, setSeedOverride] = useState<{
    durationMinutes?: number;
    distanceKm?: number | '';
  }>(() => {
    const d = Number(searchParams.get('duration'));
    const dist = Number(searchParams.get('distance'));
    return {
      durationMinutes: Number.isFinite(d) && d > 0 ? d : undefined,
      distanceKm: Number.isFinite(dist) && dist > 0 ? dist : undefined,
    };
  });
  const attachedWorkout = useMemo(
    () => (pickedWorkoutId ? getAnyWorkoutById(pickedWorkoutId) : null),
    [pickedWorkoutId],
  );
  const hasWorkout = !!attachedWorkout;
  const workoutName = attachedWorkout?.name ?? null;
  const upcomingPlanned = useUpcomingPlannedWorkouts(user?.id ?? null);
  const formSeed = useMemo<GenerateFormSeed | undefined>(() => {
    if (!attachedWorkout) return undefined;
    return {
      goal: categoryToGoal(attachedWorkout.category),
      durationMinutes: seedOverride.durationMinutes ?? attachedWorkout.duration,
      distanceKm: seedOverride.distanceKm ?? '',
    };
  }, [attachedWorkout, seedOverride]);

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
  const routeStats = useRouteBuilderStore((s) => s.routeStats);
  const routeName = useRouteBuilderStore((s) => s.routeName);
  const routeProfile = useRouteBuilderStore((s) => s.routeProfile);
  const setRouteProfile = useRouteBuilderStore((s) => s.setRouteProfile);
  const snapToRoads = useRouteBuilderStore((s) => s.snapToRoads);
  const setSnapToRoads = useRouteBuilderStore((s) => s.setSnapToRoads);
  const waypoints = useRouteBuilderStore((s) => s.waypoints);
  const viewport = useRouteBuilderStore((s) => s.viewport);
  const setWaypointsInStore = useRouteBuilderStore((s) => s.setWaypoints);
  const setRouteStatsInStore = useRouteBuilderStore((s) => s.setRouteStats);
  const setRouteNameInStore = useRouteBuilderStore((s) => s.setRouteName);
  const setAiSuggestions = useRouteBuilderStore((s) => s.setAiSuggestions);
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

  const [visibility, setVisibility] = useState<LayerVisibilityState>(() => ({
    ...DEFAULT_VISIBILITY,
    intervals: hasWorkout,
  }));
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null);
  // Per-segment surface categories reported up by SurfaceLayer so the
  // summary bar reuses them without a second Overpass fetch.
  const [surfaceSegments, setSurfaceSegments] = useState<string[] | null>(null);
  // Distance (km) hovered on the elevation chart → resolved to a map coord.
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  // Desktop region collapse state.
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [elevationCollapsed, setElevationCollapsed] = useState(false);
  // Desktop left-rail open flyout (layers | waypoints | save), null = closed.
  const [railOpenId, setRailOpenId] = useState<string | null>(null);
  // Mobile bottom-sheet active tab (null = collapsed, map fully visible).
  const [mobileTab, setMobileTab] = useState<string | null>(null);
  // Basemap choice — persisted so the map opens on the user's preferred style.
  const [basemapId, setBasemapId] = useLocalStorage<string>({
    key: 'rb2-basemap',
    defaultValue: 'dark',
  });
  const basemapStyle =
    BASEMAP_STYLES.find((s: { id: string }) => s.id === basemapId)?.style ??
    BASEMAP_STYLES[0].style;
  // Desktop cold-start: the GenerateBar (chips folded into the chat dock).
  // Auto-expand when seeded from a workout so the prefilled goal/duration show.
  const [generateExpanded, setGenerateExpanded] = useState(hasWorkout);

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

  const handleClearRoute = () => {
    clearRouteInStore();
    generation.clearSuggestions();
    lastAppliedRef.current = null;
    chatCandidatesRef.current = [];
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

  // Create fresh route candidates straight from a chat prompt, reusing RB1's
  // natural-language pipeline (one Claude parse → up to three iterative
  // routing variants, scored best-first). Snapshots land in the suggestions
  // store; the auto-apply effect commits the winner (geometry + stats +
  // resampled editable waypoints) and the chat renders the rest as option
  // cards the rider can switch between.
  const handleGenerateFromPrompt = useCallback(
    async (prompt: string): Promise<GenerateOutcome> => {
      try {
        const candidates = await generateRouteCandidatesFromNaturalLanguage(prompt, {
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
              }))
            : undefined;
        return {
          ok: true,
          distance_km: best.snapshot.stats.distance_km,
          elevation_gain_m: best.snapshot.stats.elevation_gain_m,
          name: best.name,
          familiarity_percent: best.familiarity_percent,
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
      highlightCoord={highlightCoord}
      cursor="crosshair"
      mapStyle={basemapStyle}
      basemapId={basemapId}
      onBasemapChange={setBasemapId}
      userLocation={userLocation.coord}
      onGeolocate={userLocation.requestLocation}
      isLocating={userLocation.status === 'locating'}
      isImperial={isImperial}
      isMobile={isMobile}
    >
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
        <POILayer poiResults={analysis.poiResults} activeLayers={analysis.activeLayers} />
      )}
      {visibility.bikeInfra && <BikeInfraLayer bbox={viewportBbox} visible />}
      {visibility.familiar && <FamiliarSegmentsLayer bbox={viewportBbox} visible />}
      {visibility.wind && weather.weather && geometryForLayers && (
        <WindArrowsLayer
          coordinates={geometryForLayers.coordinates}
          windDegrees={weather.weather.windDegrees}
          windSpeed={weather.weather.windSpeed}
        />
      )}
    </Map>
  );

  const statsNode =
    hasRoute && routeStats ? (
      <StatsOverlay
        stats={{
          distance_km: routeStats.distance_km,
          elevation_gain_m: routeStats.elevation_gain_m,
          duration_s: routeStats.duration_s,
        }}
        routeName={routeName}
        onClear={handleClearRoute}
        isImperial={isImperial}
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
      {!hasRoute && !isLoading && <EmptyState />}
    </>
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
        id: 'fuel',
        label: 'Fuel',
        icon: <ForkKnife size={20} weight="duotone" />,
        disabled: !hasRoute,
        panel: (
          <FuelPanel
            durationMinutes={(routeStats?.duration_s ?? 0) / 60}
            elevationGainMeters={routeStats?.elevation_gain_m ?? 0}
            weather={weather.weather}
            isImperial={isImperial}
          />
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
        // Always enabled: Load and Import GPX are entry points that work with
        // no current route (Save/Export disable themselves inside the panel).
        id: 'routes',
        label: 'Routes',
        icon: <FolderOpen size={20} weight="duotone" />,
        panel: (
          <RouteActionsPanel
            persistence={persistence}
            defaultName={routeName}
            hasRoute={hasRoute}
            onSaved={handleSaved}
            onLoaded={handleLoaded}
            onImported={(coords) => map.fitBounds(coords)}
            isMobile
          />
        ),
      },
    ];

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
                    onClear={handleClearRoute}
                    canClear={canClearMap}
                  />
                  {!isLoading && (
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
                      onHoverKm={setHoverKm}
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
                    key={`gen-${pickedWorkoutId ?? 'none'}`}
                    generation={generation}
                    defaultStart={userLocation.coord}
                    locationStatus={userLocation.status}
                    viewportCenter={viewportCenter}
                    expanded={generateExpanded}
                    onExpandedChange={setGenerateExpanded}
                    isImperial={isImperial}
                    formSeed={formSeed}
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
            key={`form-${pickedWorkoutId ?? 'none'}`}
            ref={formPanelRef}
            generation={generation}
            defaultStart={userLocation.coord}
            locationStatus={userLocation.status}
            viewportCenter={viewportCenter}
            isMobile
            isImperial={isImperial}
            formSeed={formSeed}
            defaultExpanded={hasWorkout}
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
              onHoverKm={setHoverKm}
              isImperial={isImperial}
              cues={visibleCues}
            />
          )}
          <RouteActionsPanel
            persistence={persistence}
            defaultName={routeName}
            hasRoute={hasRoute}
            onSaved={handleSaved}
            onLoaded={handleLoaded}
            onImported={(coords) => map.fitBounds(coords)}
            isMobile
          />
        </>
      ),
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
                onClear={handleClearRoute}
                canClear={canClearMap}
              />
            </Box>
            <Box style={{ flexShrink: 0 }}>
              <PersonaDropdown persona={coach.persona} onChange={onPersonaChange} compact />
            </Box>
          </Box>
          {statsNode && <Box style={{ pointerEvents: 'auto' }}>{statsNode}</Box>}
          {!isLoading && (
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

        {isLoading && <LoadingState message={loadingMessage} />}
        {error && <ErrorState message={error} onDismiss={dismissError} />}
      </Box>
    </AppShell>
  );
}

/**
 * Small on-map hint nudging the manual-editing model. Before a route exists it
 * teaches the first click; once a route exists it keeps the reshape / remove
 * affordances discoverable (the cursor stays a crosshair throughout).
 */
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
