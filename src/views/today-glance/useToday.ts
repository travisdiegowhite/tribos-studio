/**
 * useToday — binds the Today glance to a single coherent `Today` state.
 *
 * Returns the SHELL synchronously-ish (one fast Supabase round-trip) plus two
 * stable deferred promises: `routePromise` (matched route) and `coachPromise`
 * (persona fitness take). The hero, route summary, and coach block consume
 * these via React 19 `use()` inside <Suspense>, so the shell (context line,
 * rail scaffold, FORM, actions) paints first and the slower bits stream in.
 */

import { useEffect, useState } from 'react';
import { getTodayShell, getTodayRoute, getTodayCoach } from './getToday';
import type { Today, TodayRoute } from './types';

export interface UseTodayResult {
  loading: boolean;
  today: Today | null;
  /** Resolves to the matched route (or null). Stable across renders. */
  routePromise: Promise<TodayRoute | null>;
  /** Resolves to the persona fitness take (or null). Stable across renders. */
  coachPromise: Promise<string | null>;
}

const NULL_ROUTE: Promise<TodayRoute | null> = Promise.resolve(null);
const NULL_COACH: Promise<string | null> = Promise.resolve(null);

export function useToday(userId: string | null): UseTodayResult {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<Today | null>(null);
  const [routePromise, setRoutePromise] =
    useState<Promise<TodayRoute | null>>(NULL_ROUTE);
  const [coachPromise, setCoachPromise] =
    useState<Promise<string | null>>(NULL_COACH);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setToday(null);
      setRoutePromise(NULL_ROUTE);
      setCoachPromise(NULL_COACH);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getTodayShell(userId)
      .then((shell) => {
        if (cancelled) return;
        setToday(shell);
        setLoading(false);
        // Kick off the deferred solves once; cache the promises in state so
        // use() consumers read stable references.
        setRoutePromise(getTodayRoute(shell.prescription));
        setCoachPromise(getTodayCoach(shell.athleteState));
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

  return { loading, today, routePromise, coachPromise };
}
