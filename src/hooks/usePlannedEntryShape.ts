/**
 * usePlannedEntryShape — one calendar entry, resolved to a paintable workout.
 *
 * Used by the Route Builder when the rider arrives from the calendar with
 * `?entryId=`: the entry's own stored prescription (when it has one) is what
 * gets painted on the route, rather than a stand-in inferred from its type.
 * One-shot fetch, no Realtime.
 */

import { useEffect, useState } from 'react';
import { fetchEntryById } from '../lib/calendar/readPlannedSessions';
import {
  resolvePlannedWorkoutShape,
  type PlannedWorkoutShape,
} from '../lib/training/plannedWorkoutShape';

export function usePlannedEntryShape(
  userId: string | null | undefined,
  entryId: string | null | undefined,
): PlannedWorkoutShape | null {
  const [shape, setShape] = useState<PlannedWorkoutShape | null>(null);

  useEffect(() => {
    if (!userId || !entryId) {
      setShape(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const row = await fetchEntryById(userId, entryId);
      if (cancelled) return;
      setShape(row ? resolvePlannedWorkoutShape(row) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, entryId]);

  return shape;
}
