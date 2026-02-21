/**
 * RouteBuilder State Store
 *
 * Persists route builder state across tab switches, page navigations,
 * and browser sessions using Zustand with localStorage persistence.
 */

import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const STORAGE_KEY = 'tribos-route-builder';

// Initial state values
const initialState = {
  // Route data
  routeGeometry: null,
  routeName: 'Untitled Route',
  // UNIT CONTRACT: distance is in KM (matches formatDistance, ElevationProfile, DB field distance_km)
  // Note: useRouteManipulation.snapToRoads stores distance in METERS (API convention).
  // The Manual builder uses its own local state, not this store, so no conflict currently.
  // If unifying routing paths, normalize at the boundary.
  routeStats: { distance: 0, elevation: 0, duration: 0 },
  waypoints: [],

  // Map viewport
  viewport: {
    latitude: 37.7749,
    longitude: -122.4194,
    zoom: 12
  },

  // Sport type: 'cycling' | 'running'
  sportType: 'cycling',

  // Route generation settings
  trainingGoal: 'endurance',
  timeAvailable: 60,
  routeType: 'loop',
  routeProfile: 'road',
  explicitDistanceKm: null, // When user specifies distance directly (e.g., "100km loop")

  // AI suggestions (the generated route options)
  aiSuggestions: [],

  // Selected workout ID (we store ID, not the full object)
  selectedWorkoutId: null,

  // Builder mode: 'ready' | 'ai' | 'manual' | 'editing'
  builderMode: 'ready',

  // Snap-to-roads: true = auto-route along roads, false = freehand straight lines
  snapToRoads: true,

  // Routing source info
  routingSource: null,

  // Timestamp of last save (for debugging/expiry)
  lastSaved: null,
};

export const useRouteBuilderStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      // === Route Data Actions ===
      setRouteGeometry: (geometry) => set({
        routeGeometry: geometry,
        lastSaved: Date.now()
      }),

      setRouteName: (name) => set({
        routeName: name,
        lastSaved: Date.now()
      }),

      // Supports both direct object and functional updates: setRouteStats({...}) or setRouteStats(prev => ({...prev, ...}))
      setRouteStats: (statsOrUpdater) => set((state) => ({
        routeStats: typeof statsOrUpdater === 'function'
          ? statsOrUpdater(state.routeStats)
          : statsOrUpdater,
        lastSaved: Date.now()
      })),

      setWaypoints: (waypoints) => set({
        waypoints,
        lastSaved: Date.now()
      }),

      // === Viewport Actions ===
      // Supports both direct object and functional updates: setViewport({...}) or setViewport(prev => ({...prev, ...}))
      setViewport: (viewportOrUpdater) => set((state) => ({
        viewport: typeof viewportOrUpdater === 'function'
          ? viewportOrUpdater(state.viewport)
          : viewportOrUpdater,
        // Don't update lastSaved for viewport changes (too frequent)
      })),

      // === Route Settings Actions ===
      setTrainingGoal: (goal) => set({
        trainingGoal: goal,
        lastSaved: Date.now()
      }),

      setTimeAvailable: (time) => set({
        timeAvailable: time,
        lastSaved: Date.now()
      }),

      setRouteType: (type) => set({
        routeType: type,
        lastSaved: Date.now()
      }),

      setRouteProfile: (profile) => set({
        routeProfile: profile,
        lastSaved: Date.now()
      }),

      // Switch sport type — resets route-specific state and adjusts defaults
      setSportType: (sport) => set({
        sportType: sport,
        routeProfile: 'road',
        trainingGoal: sport === 'running' ? 'easy_run' : 'endurance',
        routeGeometry: null,
        routeStats: { distance: 0, elevation: 0, duration: 0 },
        waypoints: [],
        aiSuggestions: [],
        routingSource: null,
        explicitDistanceKm: null,
        selectedWorkoutId: null,
        builderMode: 'ready',
        lastSaved: Date.now(),
      }),

      setExplicitDistanceKm: (distance) => set({
        explicitDistanceKm: distance,
        lastSaved: Date.now()
      }),

      // === AI Suggestions Actions ===
      setAiSuggestions: (suggestions) => set({
        aiSuggestions: suggestions,
        lastSaved: Date.now()
      }),

      // === Workout Actions ===
      setSelectedWorkoutId: (id) => set({
        selectedWorkoutId: id,
        lastSaved: Date.now()
      }),

      // === Builder Mode ===
      setBuilderMode: (mode) => set({ builderMode: mode }),

      // === Snap to Roads ===
      setSnapToRoads: (snap) => set({ snapToRoads: snap }),

      // === Routing Source ===
      setRoutingSource: (source) => set({
        routingSource: source,
        lastSaved: Date.now()
      }),

      // === Bulk Actions ===

      // Set multiple route properties at once (for loading a route)
      setRoute: (routeData) => set({
        routeGeometry: routeData.geometry || null,
        routeName: routeData.name || 'Untitled Route',
        routeStats: routeData.stats || { distance: 0, elevation: 0, duration: 0 },
        waypoints: routeData.waypoints || [],
        routingSource: routeData.source || null,
        builderMode: 'editing',
        lastSaved: Date.now()
      }),

      // Clear the current route (but keep settings)
      clearRoute: () => set({
        routeGeometry: null,
        routeName: 'Untitled Route',
        routeStats: { distance: 0, elevation: 0, duration: 0 },
        waypoints: [],
        aiSuggestions: [],
        routingSource: null,
        explicitDistanceKm: null,
        selectedWorkoutId: null,
        builderMode: 'ready',
        lastSaved: Date.now()
      }),

      // Reset everything to initial state
      resetAll: () => set({
        ...initialState,
        lastSaved: Date.now()
      }),

      // Check if there's a saved route
      hasRoute: () => {
        const state = get();
        return state.routeGeometry !== null &&
               state.routeGeometry?.coordinates?.length > 0;
      },

      // Get time since last save (for potential expiry logic)
      getTimeSinceLastSave: () => {
        const { lastSaved } = get();
        if (!lastSaved) return Infinity;
        return Date.now() - lastSaved;
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Only persist these specific fields (not transient UI state)
      // Note: aiSuggestions are intentionally excluded — they contain large
      // coordinate arrays that would bloat localStorage. Users regenerate on demand.
      partialize: (state) => ({
        routeGeometry: state.routeGeometry,
        routeName: state.routeName,
        routeStats: state.routeStats,
        waypoints: state.waypoints,
        viewport: state.viewport,
        sportType: state.sportType,
        trainingGoal: state.trainingGoal,
        timeAvailable: state.timeAvailable,
        routeType: state.routeType,
        routeProfile: state.routeProfile,
        explicitDistanceKm: state.explicitDistanceKm,
        selectedWorkoutId: state.selectedWorkoutId,
        snapToRoads: state.snapToRoads,
        routingSource: state.routingSource,
        builderMode: state.builderMode,
        lastSaved: state.lastSaved,
      }),

      // Handle hydration (when loading from storage)
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log('🔄 Route builder state restored from storage');

          // Optional: Check if state is too old (e.g., > 24 hours)
          const ONE_DAY = 24 * 60 * 60 * 1000;
          if (state.lastSaved && Date.now() - state.lastSaved > ONE_DAY) {
            console.log('⚠️ Saved route is over 24 hours old');
            // Could auto-clear here if desired
          }
        }
      },
    }
  )
);

// Export a hook to check if store has been hydrated from localStorage
export const useRouteBuilderHydrated = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Zustand persist sets this after hydration
    const unsubFinishHydration = useRouteBuilderStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    // Check if already hydrated
    if (useRouteBuilderStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return () => {
      unsubFinishHydration();
    };
  }, []);

  return hydrated;
};
