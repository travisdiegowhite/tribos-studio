/**
 * TodayEntry — renders the routing-first Today (TodayGlance).
 *
 * This was previously a flag-gated swap between the live Today (TodayView) and
 * the routing-first glance. The RB2/Today gate has been removed, so everyone
 * now gets TodayGlance. TodayView is retained on disk as the historical
 * fallback but is no longer mounted here.
 */

import { Suspense, lazy } from 'react';
import { Center, Loader } from '@mantine/core';

const TodayGlance = lazy(() => import('./TodayGlance'));

export default function TodayEntry() {
  return (
    <Suspense
      fallback={
        <Center style={{ height: '100vh' }}>
          <Loader size="lg" color="var(--color-teal)" />
        </Center>
      }
    >
      <TodayGlance />
    </Suspense>
  );
}
