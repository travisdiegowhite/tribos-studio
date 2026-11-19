/**
 * Picks the renderer for a coach visual spec. Renderers are lazy so the chat
 * page doesn't pull in Mapbox and the chart bundle until a reply has a visual.
 */

import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { CoachFocus } from '../coachApi';
import type { CoachVisualSpec } from './types';
import { VisualLoading, VisualMissing } from './VisualFrame';

const FitnessLoadVisual = lazy(() => import('./FitnessLoadVisual'));
const RideVisual = lazy(() => import('./RideVisual'));
const RouteVisual = lazy(() => import('./RouteVisual'));

/** One broken visual must not take the conversation down with it. */
class VisualBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('coach visual failed to render', err);
  }
  render() {
    return this.state.failed ? (
      <VisualMissing title="Visual" reason="This chart couldn’t be drawn." />
    ) : (
      this.props.children
    );
  }
}

export function VisualCard({ spec, onFocus }: { spec: CoachVisualSpec; onFocus: (f: CoachFocus) => void }) {
  let body: ReactNode = null;
  switch (spec.kind) {
    case 'fitness_load':
      body = <FitnessLoadVisual spec={spec} onFocus={onFocus} />;
      break;
    case 'ride_streams':
    case 'power_curve':
      body = <RideVisual spec={spec} onFocus={onFocus} />;
      break;
    case 'route_preview':
      body = <RouteVisual spec={spec} />;
      break;
    default:
      return null;
  }
  return (
    <VisualBoundary>
      <Suspense fallback={<VisualLoading />}>{body}</Suspense>
    </VisualBoundary>
  );
}
