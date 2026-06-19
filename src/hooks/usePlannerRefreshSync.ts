/**
 * usePlannerRefreshSync - Keep the planner store in sync when workouts are
 * added elsewhere (e.g. the AI coach), without clobbering in-progress drag edits.
 *
 * The coach write helpers dispatch a `training-plan-updated` DOM event. The
 * Training Dashboard already listens for it, but the planner store did not, so
 * an open planner went stale. This hook bridges that gap:
 *   - If there are no unsaved local edits, it reloads silently.
 *   - If the user has unsaved drag edits, it surfaces `refreshAvailable` so the
 *     UI can show a non-destructive banner instead of overwriting their work.
 *
 * `hasUnsavedChanges` is read via getState() inside the handler so the listener
 * never needs to re-subscribe on every store change.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTrainingPlannerStore } from '../stores/trainingPlannerStore';

export interface PlannerRefreshSync {
  /** True when an external update arrived while the user had unsaved edits. */
  refreshAvailable: boolean;
  /** Discard unsaved edits and reload from the database. */
  refresh: () => Promise<void>;
  /** Persist unsaved edits, then reload from the database. */
  saveAndRefresh: () => Promise<void>;
  /** Dismiss the banner without reloading. */
  dismiss: () => void;
}

export function usePlannerRefreshSync(): PlannerRefreshSync {
  const [refreshAvailable, setRefreshAvailable] = useState(false);

  useEffect(() => {
    const onUpdate = () => {
      const state = useTrainingPlannerStore.getState();
      if (!state.hasUnsavedChanges) {
        // Safe: no in-progress edits to lose.
        state.syncWithDatabase();
      } else {
        setRefreshAvailable(true);
      }
    };

    window.addEventListener('training-plan-updated', onUpdate);
    window.addEventListener('training-plan-activated', onUpdate);
    return () => {
      window.removeEventListener('training-plan-updated', onUpdate);
      window.removeEventListener('training-plan-activated', onUpdate);
    };
  }, []);

  const refresh = useCallback(async () => {
    await useTrainingPlannerStore.getState().syncWithDatabase();
    setRefreshAvailable(false);
  }, []);

  const saveAndRefresh = useCallback(async () => {
    const store = useTrainingPlannerStore.getState();
    await store.savePendingChanges();
    await store.syncWithDatabase();
    setRefreshAvailable(false);
  }, []);

  const dismiss = useCallback(() => setRefreshAvailable(false), []);

  return { refreshAvailable, refresh, saveAndRefresh, dismiss };
}
