/**
 * RouteBuilder State Store
 *
 * Persists route builder state across tab switches, page navigations,
 * and browser sessions using Zustand with localStorage persistence.
 */

import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const STORAGE_KEY = 'tribos-route-builder';

// Maximum number of history states to keep (memory management)
const MAX_HISTORY_SIZE = 50;

// Initial state values
const initialState = {
  // Route data
  routeGeometry: null,
  routeName: 'Untitled Route',
  routeStats: { distance: 0, elevation: 0, duration: 0 },
  waypoints: [],

  // Map viewport
  viewport: {
    latitude: 37.7749,
    longitude: -122.4194,
    zoom: 12
  },

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

  // Routing source info
  routingSource: null,

  // Timestamp of last save (for debugging/expiry)
  lastSaved: null,

  // Undo/redo history (not persisted to localStorage)
  _history: [],  // Past states for undo
  _future: [],   // Future states for redo
};

/**
 * Create a snapshot of the current route state for undo/redo
 */
const createRouteSnapshot = (state) => ({
  routeGeometry: state.routeGeometry,
  routeStats: state.routeStats,
  waypoints: state.waypoints,
  routeName: state.routeName,
  routingSource: state.routingSource,
});

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

      setRouteStats: (stats) => set({
        routeStats: stats,
        lastSaved: Date.now()
      }),

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
        explicitDistanceKm: null, // Clear explicit distance when clearing route
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

      // === Undo/Redo Actions ===

      /**
       * Push current route state to history before making changes.
       * Call this before any route-modifying action to enable undo.
       */
      pushHistory: () => {
        const state = get();
        const snapshot = createRouteSnapshot(state);

        // Only push if there's meaningful state to save
        const hasContent = snapshot.routeGeometry || snapshot.waypoints.length > 0;
        if (!hasContent && state._history.length === 0) return;

        // Avoid duplicate consecutive states
        const lastHistory = state._history[state._history.length - 1];
        if (lastHistory &&
            JSON.stringify(lastHistory) === JSON.stringify(snapshot)) {
          return;
        }

        const newHistory = [...state._history, snapshot].slice(-MAX_HISTORY_SIZE);
        set({
          _history: newHistory,
          _future: [] // Clear redo stack when new action is taken
        });
      },

      /**
       * Undo the last route change
       */
      undo: () => {
        const state = get();
        if (state._history.length === 0) return false;

        // Save current state to future (for redo)
        const currentSnapshot = createRouteSnapshot(state);
        const newFuture = [...state._future, currentSnapshot];

        // Pop the last history state
        const newHistory = [...state._history];
        const previousState = newHistory.pop();

        set({
          ...previousState,
          _history: newHistory,
          _future: newFuture,
          lastSaved: Date.now()
        });

        return true;
      },

      /**
       * Redo a previously undone route change
       */
      redo: () => {
        const state = get();
        if (state._future.length === 0) return false;

        // Save current state to history
        const currentSnapshot = createRouteSnapshot(state);
        const newHistory = [...state._history, currentSnapshot];

        // Pop the last future state
        const newFuture = [...state._future];
        const nextState = newFuture.pop();

        set({
          ...nextState,
          _history: newHistory,
          _future: newFuture,
          lastSaved: Date.now()
        });

        return true;
      },

      /**
       * Check if undo is available
       */
      canUndo: () => get()._history.length > 0,

      /**
       * Check if redo is available
       */
      canRedo: () => get()._future.length > 0,

      /**
       * Clear undo/redo history (e.g., when starting fresh)
       */
      clearHistory: () => set({ _history: [], _future: [] }),

      /**
       * Get current history stack sizes (for UI display)
       */
      getHistoryInfo: () => {
        const state = get();
        return {
          undoCount: state._history.length,
          redoCount: state._future.length,
        };
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Only persist these specific fields (not transient UI state)
      partialize: (state) => ({
        routeGeometry: state.routeGeometry,
        routeName: state.routeName,
        routeStats: state.routeStats,
        waypoints: state.waypoints,
        viewport: state.viewport,
        trainingGoal: state.trainingGoal,
        timeAvailable: state.timeAvailable,
        routeType: state.routeType,
        routeProfile: state.routeProfile,
        explicitDistanceKm: state.explicitDistanceKm,
        aiSuggestions: state.aiSuggestions,
        selectedWorkoutId: state.selectedWorkoutId,
        routingSource: state.routingSource,
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
