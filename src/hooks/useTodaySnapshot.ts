/**
 * useTodaySnapshot — orchestrator hook
 *
 * Single source of truth for the Today view. Composes the per-slice
 * hooks (workout, form score, terrain, race, weather, location, route
 * suggestions, coach paragraph, readiness) into one structured snapshot
 * that every Today component reads from.
 *
 * Build the smaller hooks first; this hook only wires them together.
 */

import { useMemo } from 'react';
import type { PersonaId } from '../types/checkIn';
import type { PlannedWorkoutWithDetails, TrainingPhase } from '../types/training';
import { useTrainingPlan } from './useTrainingPlan';
import { useFormScore } from './useFormScore';
import { useTodayTerrain, type TerrainClass } from './useTodayTerrain';
import { useNextRace } from './useNextRace';
import { useCurrentWeather, type CurrentWeather } from './useCurrentWeather';
import { useUserLocation } from './useUserLocation';
import { useSuggestedRoutes, type SuggestedRoute } from './useSuggestedRoutes';
import { useCoachParagraph, type ParagraphState } from './useCoachParagraph';
import { useReadinessCheckin, type ReadinessInput, type ReadinessRow } from './useReadinessCheckin';
import { computePhasePosition } from '../utils/todayPhase';
import {
  freshnessFromFormScore,
  conditionsFromWeather,
  type FreshnessWord,
  type ConditionsWord,
} from '../utils/todayVocabulary';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTodayString } from '../utils/dateUtils';

export interface TodaySnapshot {
  loading: boolean;
  date: string;

  // WHERE
  workout: PlannedWorkoutWithDetails | null;
  suggestedRoutes: SuggestedRoute[];
  selectedRouteId: string | null;
  selectedRoute: SuggestedRoute | null;
  selectRoute: (routeId: string) => void;

  // STATE
  formScore: number | null;
  freshnessWord: FreshnessWord | null;
  phase: TrainingPhase | null;
  weekInPhase: number | null;
  weeksInPhase: number | null;
  weeksRemaining: number | null;
  terrain: TerrainClass | null;
  conditionsWord: ConditionsWord | null;
  weather: CurrentWeather | null;

  // RACE
  nextRaceName: string | null;
  daysToRace: number | null;

  // WHY
  persona: PersonaId;
  coachParagraph: string | null;
  paragraphState: ParagraphState;
  refreshParagraph: () => Promise<void>;

  // READINESS
  readinessLoggedToday: boolean;
  readinessCheckin: ReadinessRow | null;
  logReadiness: (input: ReadinessInput) => Promise<void>;
}

/**
 * Read the user's persona id from user_profiles (canonical) with a
 * fallback to user_coach_settings for users predating migration 086's
 * backfill.
 */
function usePersona(userId: string | null | undefined): PersonaId {
  const [persona, setPersona] = useState<PersonaId>('pragmatist');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const [profile, settings] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('coach_persona_id')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('user_coach_settings')
          .select('coaching_persona')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const fromProfile = profile.data?.coach_persona_id as PersonaId | undefined;
      const fromSettings = settings.data?.coaching_persona as PersonaId | undefined;
      const resolved = fromProfile || (fromSettings && fromSettings !== ('pending' as PersonaId) ? fromSettings : 'pragmatist');
      setPersona(resolved);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return persona;
}

export function useTodaySnapshot(userId: string | null): TodaySnapshot {
  const date = getTodayString();
  const persona = usePersona(userId);

  // Plan + workout
  const trainingPlan = useTrainingPlan({ userId });
  const workouts = trainingPlan.getWorkoutsForDate(new Date());
  const workout = workouts[0] ?? null;

  // State signals
  const fitness = useFormScore(userId);
  const terrain = useTodayTerrain(userId);
  const phasePos = useMemo(
    () => computePhasePosition(trainingPlan.activePlan?.template, trainingPlan.currentWeek),
    [trainingPlan.activePlan, trainingPlan.currentWeek],
  );

  const { race, daysToRace } = useNextRace(userId);

  // Location → weather
  const { location } = useUserLocation(userId);
  const { weather } = useCurrentWeather(location?.lat ?? null, location?.lon ?? null);

  // Routes
  const suggested = useSuggestedRoutes(userId, date);
  const selectedRoute = suggested.suggestions.find((s) => s.route.id === suggested.selectedRouteId)?.route ?? null;

  // Vocab mappings
  const freshnessWord = freshnessFromFormScore(fitness.formScore);
  const conditionsWord = conditionsFromWeather(weather);

  // Coach paragraph (depends on metrics + workout + freshness, all of which can be null in flight)
  // Cast: PlannedWorkoutDB type lags the schema — `name` and
  // `duration_minutes` are real columns (added in migration 012) but
  // not yet present in the TS type. See useTrainingPlan for the actual
  // shape returned at runtime.
  const w = workout as (typeof workout & { name?: string; duration_minutes?: number | null }) | null;
  const todayContext = useMemo(() => ({
    workoutId: w?.workout_id ?? null,
    workoutName: w?.name ?? null,
    workoutType: w?.workout_type ?? null,
    durationMinutes: w?.duration_minutes ?? w?.target_duration ?? null,
    phase: phasePos?.phase ?? null,
    weekInPhase: phasePos?.weekInPhase ?? null,
    weeksInPhase: phasePos?.weeksInPhase ?? null,
    weeksRemaining: phasePos?.weeksRemaining ?? null,
    freshnessWord,
    raceName: daysToRace != null && daysToRace <= 60 ? race?.name ?? null : null,
    raceType: daysToRace != null && daysToRace <= 60 ? race?.race_type ?? null : null,
    daysToRace: daysToRace != null && daysToRace <= 60 ? daysToRace : null,
  }), [
    w?.workout_id,
    w?.name,
    w?.workout_type,
    w?.duration_minutes,
    w?.target_duration,
    phasePos,
    freshnessWord,
    race,
    daysToRace,
  ]);

  const coachMetrics = useMemo(() => {
    if (fitness.tfi == null) return null;
    return {
      tfi: fitness.tfi,
      afi: fitness.afi,
      formScore: fitness.formScore,
      lastRideRss: fitness.rss,
      ctlDeltaPct: fitness.ctlDeltaPct,
    };
  }, [fitness.tfi, fitness.afi, fitness.formScore, fitness.rss, fitness.ctlDeltaPct]);

  const { paragraph, state: paragraphState, refresh: refreshParagraph } = useCoachParagraph(
    userId,
    coachMetrics,
    todayContext,
  );

  // Readiness
  const readiness = useReadinessCheckin(userId, date);

  const loading =
    trainingPlan.loading ||
    fitness.loading ||
    suggested.loading;

  return {
    loading,
    date,

    workout,
    suggestedRoutes: suggested.suggestions.map((s) => s.route),
    selectedRouteId: suggested.selectedRouteId,
    selectedRoute,
    selectRoute: suggested.selectRoute,

    formScore: fitness.formScore,
    freshnessWord,
    phase: phasePos?.phase ?? trainingPlan.currentPhase ?? null,
    weekInPhase: phasePos?.weekInPhase ?? null,
    weeksInPhase: phasePos?.weeksInPhase ?? null,
    weeksRemaining: phasePos?.weeksRemaining ?? null,
    terrain,
    conditionsWord,
    weather,

    nextRaceName: daysToRace != null && daysToRace <= 60 ? race?.name ?? null : null,
    daysToRace: daysToRace != null && daysToRace <= 60 ? daysToRace : null,

    persona,
    coachParagraph: paragraph,
    paragraphState,
    refreshParagraph,

    readinessLoggedToday: readiness.loggedToday,
    readinessCheckin: readiness.checkin,
    logReadiness: readiness.log,
  };
}
