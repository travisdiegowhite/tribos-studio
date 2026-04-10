/**
 * useTour — Shepherd.js guided tour hook.
 *
 * Responsibilities:
 *  1. Build a Shepherd tour from the supplied step definitions
 *  2. On mount, read tour state from `user_activation.tours[tourKey]`
 *  3. Auto-start the tour if the user has neither completed nor dismissed it
 *  4. Expose `startTour()` for manual re-triggers via the ? button
 *  5. Persist completion / dismissal back to Supabase on tour events
 *
 * Storage shape (JSONB column `user_activation.tours`):
 *   {
 *     [tourKey]: {
 *       completed_at: string | null,  // ISO timestamp
 *       dismissed_at: string | null,  // ISO timestamp
 *     }
 *   }
 *
 * Failures writing to Supabase are logged but never thrown — the tour must
 * run even if the DB is unreachable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Shepherd from 'shepherd.js';
import type { StepOptions, Tour } from 'shepherd.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

export type TourKey =
  | 'route_builder'
  | 'route_editing'
  | 'training_plan_setup'
  | 'plan_to_route';

interface TourState {
  completed_at: string | null;
  dismissed_at: string | null;
}

type ToursColumn = Partial<Record<TourKey, TourState>>;

export interface UseTourResult {
  startTour: () => void;
  isLoading: boolean;
}

/**
 * Prepend a "Step N of M" counter to a Shepherd step's footer when it is shown.
 * Idempotent — removes any existing counter first so re-entering a step doesn't
 * duplicate it.
 */
function attachStepCounter(stepEl: HTMLElement | null | undefined, index: number, total: number) {
  if (!stepEl) return;
  const footer = stepEl.querySelector('.shepherd-footer');
  if (!footer) return;
  const existing = footer.querySelector('.tribos-step-counter');
  if (existing) existing.remove();
  const counter = document.createElement('span');
  counter.className = 'tribos-step-counter';
  counter.textContent = `Step ${index + 1} of ${total}`;
  footer.prepend(counter);
}

/**
 * Decorate steps with default when.show handlers so every step renders the
 * step counter. User-supplied `when` handlers are preserved.
 */
function decorateSteps(steps: StepOptions[]): StepOptions[] {
  const total = steps.length;
  return steps.map((step, index) => {
    const userShow = step.when?.show;
    return {
      ...step,
      when: {
        ...step.when,
        show(this: unknown) {
          // `this` inside a Shepherd when-handler is the Step instance.
          // Use the shepherd instance's currentStep to find the element.
          const current = Shepherd.activeTour?.getCurrentStep();
          const el = current?.getElement?.() as HTMLElement | null | undefined;
          attachStepCounter(el, index, total);
          if (typeof userShow === 'function') {
            (userShow as () => void).call(this);
          }
        },
      },
    };
  });
}

async function fetchTourState(userId: string, tourKey: TourKey): Promise<TourState | null> {
  try {
    const { data, error } = await supabase
      .from('user_activation')
      .select('tours')
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = no row yet; the create_user_activation trigger should have
      // created it, but if it hasn't we just treat the tour as not-yet-seen.
      if (error.code !== 'PGRST116') {
        console.warn('[useTour] failed to fetch tour state:', error);
      }
      return null;
    }
    const tours = (data?.tours ?? {}) as ToursColumn;
    return tours[tourKey] ?? null;
  } catch (err) {
    console.warn('[useTour] unexpected error fetching tour state:', err);
    return null;
  }
}

async function writeTourState(
  userId: string,
  tourKey: TourKey,
  patch: Partial<TourState>
): Promise<void> {
  try {
    const { data, error: readErr } = await supabase
      .from('user_activation')
      .select('tours')
      .eq('user_id', userId)
      .single();

    if (readErr && readErr.code !== 'PGRST116') {
      console.warn('[useTour] failed to read tours before write:', readErr);
      return;
    }

    const existing = (data?.tours ?? {}) as ToursColumn;
    const next: ToursColumn = {
      ...existing,
      [tourKey]: {
        completed_at: null,
        dismissed_at: null,
        ...existing[tourKey],
        ...patch,
      },
    };

    const { error: writeErr } = await supabase
      .from('user_activation')
      .update({ tours: next, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (writeErr) {
      console.warn('[useTour] failed to write tour state:', writeErr);
    }
  } catch (err) {
    console.warn('[useTour] unexpected error writing tour state:', err);
  }
}

interface UseTourOptions {
  /**
   * When true (the default), the tour auto-triggers on first visit if the
   * user hasn't completed or dismissed it yet. Set to false for tours that
   * should only be started manually via the returned `startTour` function
   * (e.g. the editing tools tour, which only makes sense after a route exists).
   */
  autoStart?: boolean;
}

export function useTour(
  tourKey: TourKey,
  getSteps: () => StepOptions[],
  options: UseTourOptions = {},
): UseTourResult {
  const { autoStart = true } = options;
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id;

  const tourRef = useRef<Tour | null>(null);
  const autoStartedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Build (or rebuild) the Shepherd tour instance from the latest step
   * definitions. Destroys any previous tour first.
   */
  const buildTour = useCallback((): Tour => {
    // Tear down previous instance so selectors get re-resolved each start.
    if (tourRef.current) {
      try {
        if (tourRef.current.isActive()) tourRef.current.cancel();
      } catch {
        // ignore
      }
      tourRef.current = null;
    }

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      exitOnEsc: true,
      keyboardNavigation: true,
      defaultStepOptions: {
        scrollTo: { behavior: 'smooth', block: 'center' },
        cancelIcon: { enabled: true },
        modalOverlayOpeningPadding: 4,
        arrow: true,
      },
    });

    tour.addSteps(decorateSteps(getSteps()));

    tour.on('complete', () => {
      if (userId) {
        void writeTourState(userId, tourKey, {
          completed_at: new Date().toISOString(),
        });
      }
    });

    tour.on('cancel', () => {
      if (userId) {
        void writeTourState(userId, tourKey, {
          dismissed_at: new Date().toISOString(),
        });
      }
    });

    tourRef.current = tour;
    return tour;
  }, [getSteps, tourKey, userId]);

  /**
   * Manual re-trigger. Always starts the tour regardless of prior state.
   */
  const startTour = useCallback(() => {
    const tour = buildTour();
    void tour.start();
  }, [buildTour]);

  /**
   * Auto-start on first visit. Runs once per mount per user.
   * Skipped entirely when `autoStart` is false.
   */
  useEffect(() => {
    let cancelled = false;
    if (!autoStart || !userId) {
      setIsLoading(false);
      return;
    }
    if (autoStartedRef.current) {
      setIsLoading(false);
      return;
    }

    (async () => {
      const state = await fetchTourState(userId, tourKey);
      if (cancelled) return;
      setIsLoading(false);

      const alreadySeen = !!(state?.completed_at || state?.dismissed_at);
      if (alreadySeen) return;

      autoStartedRef.current = true;
      // Small delay so lazy-loaded page content has time to mount.
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        const tour = buildTour();
        void tour.start();
      }, 500);

      // Clean up timer if the effect tears down before it fires.
      return () => window.clearTimeout(timer);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, tourKey, buildTour]);

  /**
   * Tear down the Shepherd instance on unmount so the tour doesn't outlive
   * the page that owns it.
   */
  useEffect(() => {
    return () => {
      if (tourRef.current) {
        try {
          if (tourRef.current.isActive()) tourRef.current.cancel();
        } catch {
          // ignore
        }
        tourRef.current = null;
      }
    };
  }, []);

  return { startTour, isLoading };
}
