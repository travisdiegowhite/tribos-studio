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
  routeDescription: '',
  // UNIT CONTRACT (see src/utils/distanceUnits.ts and CLAUDE.md):
  //   distance_km — KM. Always KM in this store. Router responses are
  //   meters; conversion happens at the boundary in useRouteManipulation
  //   and useRouteOperations using M_TO_KM.
  //   elevation_gain_m — METERS, matches DB column elevation_gain_m.
  //   duration_s — seconds.
  routeStats: { distance_km: 0, elevation_gain_m: 0, duration_s: 0 },
  waypoints: [],

  // Turn-by-turn cues from the routing provider (RouteCue[] from
  // src/utils/routeCues.ts). Only the Stadia/Valhalla path produces them;
  // null when the active geometry came from another provider or freehand.
  routeCues: null,

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

  // Race-specific fields (when trainingGoal === 'race')
  raceType: null,             // 'road_race', 'criterium', 'time_trial', etc.
  raceDate: null,             // ISO date string for race day
  targetFinishMinutes: null,  // User's target finish time in minutes

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

      setRouteDescription: (description) => set({
        routeDescription: description,
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

      setRouteCues: (cues) => set({
        routeCues: Array.isArray(cues) && cues.length > 0 ? cues : null,
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

      // === Race Settings Actions ===
      setRaceType: (type) => set({
        raceType: type,
        lastSaved: Date.now()
      }),

      setRaceDate: (date) => set({
        raceDate: date,
        lastSaved: Date.now()
      }),

      setTargetFinishMinutes: (minutes) => set({
        targetFinishMinutes: minutes,
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
        routeDescription: routeData.description || '',
        routeStats: routeData.stats || { distance_km: 0, elevation_gain_m: 0, duration_s: 0 },
        waypoints: routeData.waypoints || [],
        routeCues: Array.isArray(routeData.cues) && routeData.cues.length > 0 ? routeData.cues : null,
        routingSource: routeData.source || null,
        builderMode: 'editing',
        lastSaved: Date.now()
      }),

      // Clear the current route (but keep settings)
      clearRoute: () => set({
        routeGeometry: null,
        routeName: 'Untitled Route',
        routeDescription: '',
        routeStats: { distance_km: 0, elevation_gain_m: 0, duration_s: 0 },
        waypoints: [],
        routeCues: null,
        aiSuggestions: [],
        routingSource: null,
        explicitDistanceKm: null,
        selectedWorkoutId: null,
        raceType: null,
        raceDate: null,
        targetFinishMinutes: null,
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
      // localStorage writes can throw (QuotaExceededError on a very long
      // snapped route, storage disabled in some private modes). An uncaught
      // throw inside zustand's persist breaks the setter that triggered it,
      // so degrade to in-memory-only instead.
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch (e) {
            console.warn('[route-builder] localStorage read failed:', e);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch (e) {
            console.warn(
              '[route-builder] localStorage write failed — route state will not survive a reload. Save the route to keep it.',
              e,
            );
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch (e) {
            console.warn('[route-builder] localStorage remove failed:', e);
          }
        },
      })),

      // Only persist these specific fields (not transient UI state)
      // Note: aiSuggestions are intentionally excluded — they contain large
      // coordinate arrays that would bloat localStorage. Users regenerate on demand.
      partialize: (state) => ({
        routeGeometry: state.routeGeometry,
        routeName: state.routeName,
        routeDescription: state.routeDescription,
        routeStats: state.routeStats,
        waypoints: state.waypoints,
        routeCues: state.routeCues,
        viewport: state.viewport,
        trainingGoal: state.trainingGoal,
        timeAvailable: state.timeAvailable,
        routeType: state.routeType,
        routeProfile: state.routeProfile,
        explicitDistanceKm: state.explicitDistanceKm,
        raceType: state.raceType,
        raceDate: state.raceDate,
        targetFinishMinutes: state.targetFinishMinutes,
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

          // Migrate legacy unsuffixed routeStats fields (T1.1 distance
          // unit contract). Old shape was { distance, elevation, duration }
          // where `distance` was km in the happy path but meters from the
          // canonical bug (3a). Heuristic: >1000 means it was the buggy
          // meters-as-km value; convert. Else it was already km.
          if (state.routeStats) {
            const s = state.routeStats;
            if (s.distance !== undefined && s.distance_km === undefined) {
              s.distance_km = s.distance > 1000 ? s.distance / 1000 : s.distance;
              delete s.distance;
            }
            if (s.elevation !== undefined && s.elevation_gain_m === undefined) {
              s.elevation_gain_m = s.elevation;
              delete s.elevation;
            }
            if (s.duration !== undefined && s.duration_s === undefined) {
              s.duration_s = s.duration;
              delete s.duration;
            }
          }

          // T1.2 coordinate format contract: normalize any waypoint
          // whose .position is missing or stored as a {lng,lat}/{lon,lat}
          // object back to the canonical [lng, lat] tuple. The current
          // writer (`useRouteManipulation`) already produces tuples, so
          // this is purely defensive for users with very old persisted
          // state.
          if (Array.isArray(state.waypoints)) {
            state.waypoints = state.waypoints
              .map((wp) => {
                if (!wp) return null;
                if (Array.isArray(wp.position) && wp.position.length === 2) {
                  return wp; // canonical
                }
                const lng = wp.position?.lng ?? wp.lng ?? wp.lon ?? wp.longitude;
                const lat = wp.position?.lat ?? wp.lat ?? wp.latitude;
                if (typeof lng === 'number' && typeof lat === 'number') {
                  return { ...wp, position: [lng, lat] };
                }
                console.warn('[coord-migrate] dropping malformed waypoint:', wp);
                return null;
              })
              .filter(Boolean);
          }

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
