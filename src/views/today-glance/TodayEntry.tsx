/**
 * TodayEntry — chooses between the live Today (src/views/today/TodayView) and
 * the new routing-first glance (TodayGlance).
 *
 * Gating reuses the Route Builder 2.0 BETA cohort
 * (useRouteBuilderV2Access): the RB2 beta audience is the routing-first
 * early-adopter group, and the redesign's whole premise is collapsing the
 * Today↔RIDE seam — so the same users who get Builder 2.0 get the
 * routing-first Today. No separate flag to manage. Fails closed to the live
 * Today (the hook requires the env kill switch AND the per-user
 * route_builder_v2_enabled column).
 *
 * The live Today is NOT mutated; this is a parallel-route swap so the redesign
 * can be rolled out per-user and rolled back instantly.
 */

import { Suspense, lazy } from 'react';
import { Center, Loader } from '@mantine/core';
import { useRouteBuilderV2Access } from '../../hooks/useRouteBuilderV2Access';

const TodayView = lazy(() => import('../today/TodayView'));
const TodayGlance = lazy(() => import('./TodayGlance'));

export default function TodayEntry() {
  const { hasAccess, isLoading } = useRouteBuilderV2Access();

  if (isLoading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" color="var(--color-teal)" />
      </Center>
    );
  }

  return (
    <Suspense
      fallback={
        <Center style={{ height: '100vh' }}>
          <Loader size="lg" color="var(--color-teal)" />
        </Center>
      }
    >
      {hasAccess ? <TodayGlance /> : <TodayView />}
    </Suspense>
  );
}
