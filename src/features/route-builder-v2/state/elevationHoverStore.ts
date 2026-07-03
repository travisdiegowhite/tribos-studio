/**
 * Elevation-chart hover scrub position, isolated from page state.
 *
 * The hovered km updates on every pointermove over the elevation chart.
 * Keeping it in RouteBuilder2's useState re-rendered the entire page
 * (map + all layers) per frame while scrubbing; as a store it re-renders
 * only the subscribers — the ElevationHoverMarker dot on the map.
 */
import { create } from 'zustand';

interface ElevationHoverState {
  hoverKm: number | null;
  setHoverKm: (km: number | null) => void;
}

export const useElevationHoverStore = create<ElevationHoverState>((set) => ({
  hoverKm: null,
  setHoverKm: (km) => set({ hoverKm: km }),
}));

/** Stable setter for passing as `onHoverKm` without subscribing the caller. */
export const setElevationHoverKm = (km: number | null): void => {
  useElevationHoverStore.getState().setHoverKm(km);
};
