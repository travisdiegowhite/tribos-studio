/**
 * useRouteBuilderV2Access — per-user gate for Route Builder 2.0 BETA.
 *
 * Access requires BOTH:
 *   1. VITE_ROUTE_BUILDER_V2_ENABLED === 'true' (env-level kill switch)
 *   2. user_profiles.route_builder_v2_enabled === true (per-user beta cohort)
 *
 * Fails closed: any error reading the column returns no access.
 *
 * Used to gate the BUILDER 2.0 nav link in AppShell and to guard the
 * /route-builder-2 routes in App.jsx. When access is denied, the route
 * guard redirects to /ride/new (the v1 builder).
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const ENV_FLAG = import.meta.env.VITE_ROUTE_BUILDER_V2_ENABLED === 'true';

export interface RouteBuilderV2Access {
  hasAccess: boolean;
  isLoading: boolean;
}

export function useRouteBuilderV2Access(): RouteBuilderV2Access {
  const { user, loading: authLoading } = useAuth();
  const [columnValue, setColumnValue] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Env-level kill switch off — skip the DB read entirely.
    if (!ENV_FLAG) {
      setColumnValue(false);
      setIsLoading(false);
      return;
    }

    // Wait until auth state has settled before deciding.
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!user?.id) {
      setColumnValue(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('route_builder_v2_enabled')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('useRouteBuilderV2Access: failed to read flag', error);
        setColumnValue(false);
      } else {
        setColumnValue(data?.route_builder_v2_enabled === true);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  return {
    hasAccess: ENV_FLAG && columnValue === true,
    isLoading,
  };
}
