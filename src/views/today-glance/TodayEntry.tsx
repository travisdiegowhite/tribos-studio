/**
 * TodayEntry — chooses between the live Today (src/views/today/TodayView) and
 * the new routing-first glance (TodayGlance) based on the
 * `today_routing_glance` feature flag. The live Today is NOT mutated; this is a
 * parallel-route swap so the redesign can be rolled out per-user and rolled
 * back instantly via the flag kill-switch.
 *
 * Reads the flag with its own loading state so a flagged user never flashes the
 * heavy old Today (which would fire its full data load) before the glance.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { hasFlag } from '../../utils/featureFlags';

const TodayView = lazy(() => import('../today/TodayView'));
const TodayGlance = lazy(() => import('./TodayGlance'));

export default function TodayEntry() {
  const { user } = useAuth() as { user: { id: string } | null };
  const [state, setState] = useState<'loading' | 'glance' | 'legacy'>('loading');

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setState('legacy');
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('feature_flags')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setState('legacy');
        return;
      }
      setState(hasFlag(data, 'today_routing_glance') ? 'glance' : 'legacy');
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (state === 'loading') {
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
      {state === 'glance' ? <TodayGlance /> : <TodayView />}
    </Suspense>
  );
}
