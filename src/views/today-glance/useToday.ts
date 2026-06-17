/**
 * useToday — binds the Today glance to a single coherent `Today` state.
 *
 * Returns the SHELL synchronously-ish (one fast Supabase round-trip) plus a
 * stable `routePromise` for the deferred matched route. The hero and route
 * summary consume `routePromise` via React 19 `use()` inside <Suspense>, so
 * the shell (context line, rail scaffold, clearance, actions) paints first and
 * the route streams in — the deferred-loader UX without a router rewrite.
 */

import { useEffect, useState } from 'react';
import { getTodayShell, getTodayRoute } from './getToday';
import type { Today, TodayRoute } from './types';

export interface UseTodayResult {
  loading: boolean;
  today: Today | null;
  /** Resolves to the matched route (or null). Stable across renders. */
  routePromise: Promise<TodayRoute | null>;
}

const NULL_ROUTE: Promise<TodayRoute | null> = Promise.resolve(null);

export function useToday(userId: string | null): UseTodayResult {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<Today | null>(null);
  const [routePromise, setRoutePromise] =
    useState<Promise<TodayRoute | null>>(NULL_ROUTE);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setToday(null);
      setRoutePromise(NULL_ROUTE);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getTodayShell(userId)
      .then((shell) => {
        if (cancelled) return;
        setToday(shell);
        setLoading(false);
        // Kick off the deferred solve once; cache the promise in state so
        // use() consumers read a stable reference.
        setRoutePromise(getTodayRoute(shell.prescription));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useToday: shell load failed', err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { loading, today, routePromise };
}
