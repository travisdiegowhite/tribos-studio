import { beforeEach, describe, expect, it } from 'vitest';
import { useRouteBuilderStore } from '../routeBuilderStore';

const LINE = { type: 'LineString', coordinates: [[-105.27, 40.01], [-105.28, 40.02]] };

describe('routeBuilderStore sport (multisport phase 2)', () => {
  beforeEach(() => {
    useRouteBuilderStore.getState().resetAll();
  });

  it('starts as a ride on the road profile', () => {
    const s = useRouteBuilderStore.getState();
    expect(s.sport).toBe('cycling');
    expect(s.routeProfile).toBe('road');
  });

  it('switching to Run moves to the run profile and clears the route', () => {
    useRouteBuilderStore.setState({ routeGeometry: LINE, routeName: 'Lunch loop' });
    useRouteBuilderStore.getState().setSport('running');
    const s = useRouteBuilderStore.getState();
    expect(s.sport).toBe('running');
    expect(s.routeProfile).toBe('run');
    expect(s.routeGeometry).toBeNull();
    expect(s.routeName).toBe('Untitled Route');
  });

  it('re-selecting the current sport keeps the route', () => {
    useRouteBuilderStore.getState().setSport('running');
    useRouteBuilderStore.setState({ routeGeometry: LINE, routeProfile: 'trail_run' });
    useRouteBuilderStore.getState().setSport('running');
    const s = useRouteBuilderStore.getState();
    expect(s.routeGeometry).toEqual(LINE);
    expect(s.routeProfile).toBe('trail_run');
  });

  it('setRouteProfile keeps sport consistent without clearing the route', () => {
    useRouteBuilderStore.setState({ routeGeometry: LINE });
    useRouteBuilderStore.getState().setRouteProfile('trail_run');
    expect(useRouteBuilderStore.getState().sport).toBe('running');
    useRouteBuilderStore.getState().setRouteProfile('gravel');
    expect(useRouteBuilderStore.getState().sport).toBe('cycling');
    expect(useRouteBuilderStore.getState().routeGeometry).toEqual(LINE);
  });

  it('persists the sport', () => {
    useRouteBuilderStore.getState().setSport('running');
    const persisted = JSON.parse(localStorage.getItem('tribos-route-builder') ?? '{}');
    expect(persisted.state.sport).toBe('running');
    expect(persisted.state.routeProfile).toBe('run');
  });
});
