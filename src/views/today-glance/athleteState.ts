/**
 * getAthleteState — fills the glance's FORM + fitness story from the
 * `activities` table (canonical-first), the same way the live Today does, so
 * FS/TFI/AFI are never blank for a rider with history. The earlier shell read
 * only the sparse latest `training_load_daily` row, which left the stats empty.
 *
 * Reuses buildAthleteMetrics + slopeLastN from ../today/athleteMetrics and the
 * word/color helpers in todayVocabulary.
 */

import { supabase } from '../../lib/supabase';
import {
  buildAthleteMetrics,
  slopeLastN,
  type AthleteActivityRow,
  type ServerLoadRow,
} from '../today/athleteMetrics';
import {
  freshnessFromFormScore,
  fitnessWordFromSlope,
  fatigueWordFromAFI,
  todayColors,
} from '../../utils/todayVocabulary';
import { classifyFormBandDisplay, classifyFsConfidenceTier } from '../../utils/formBands';
import type { TodayAthleteState } from './types';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Plain-language readiness verdict for the FORM line, by Form Score.
 * Spec §5 bands — keep cuts in lockstep with src/utils/formBands.js. */
export function formVerdict(fs: number | null): string {
  if (fs == null) return 'building baseline';
  if (fs > 20) return 'too fresh — add load';
  if (fs >= 10) return 'fresh — cleared for quality';
  if (fs >= -5) return 'grey zone — cleared for quality';
  if (fs >= -30) return 'productive load — steady aerobic';
  return 'overreached — recover';
}

export const EMPTY_ATHLETE_STATE: TodayAthleteState = {
  fs: null,
  tfi: null,
  afi: null,
  formBand: null,
  formWord: 'Building baseline',
  formColor: todayColors.gray,
  formVerdict: 'building baseline',
  formRampPos: 0.5,
  confidenceTier: null,
  fitnessHistory: [],
  fitnessWord: 'Building history',
  fitnessColor: todayColors.gray,
  fitnessSlope14d: 0,
  fitnessDelta28d: 0,
  fitnessEmpty: true,
  fatigueRelative: 0,
  fatigueWord: 'Building baseline',
  fatigueColor: todayColors.gray,
  ctlDeltaPct: 0,
};

export async function getAthleteState(userId: string): Promise<TodayAthleteState> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyKey = ninetyDaysAgo.toISOString().slice(0, 10);

  const activitiesQuery = supabase
    .from('activities')
    .select(
      'start_date, rss, tss, moving_time, distance, total_elevation_gain, ' +
        'average_watts, effective_power, normalized_power, kilojoules, ' +
        'type, sport_type, average_heartrate, is_hidden, duplicate_of',
    )
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .gte('start_date', ninetyDaysAgo.toISOString())
    .order('start_date', { ascending: true })
    .limit(500);

  const serverLoadQuery = supabase
    .from('training_load_daily')
    .select('date, tfi, afi, form_score, fs_confidence')
    .eq('user_id', userId)
    .gte('date', ninetyKey)
    .order('date', { ascending: true });

  const ftpQuery = supabase
    .from('user_profiles')
    .select('ftp')
    .eq('id', userId)
    .maybeSingle();

  const [activitiesRes, serverLoadRes, ftpRes] = await Promise.all([
    activitiesQuery,
    serverLoadQuery,
    ftpQuery,
  ]);

  const activities = (activitiesRes.data ?? []) as unknown as AthleteActivityRow[];
  const serverHistory = (serverLoadRes.data ?? []) as unknown as Array<
    ServerLoadRow & { fs_confidence?: number | null }
  >;
  const ftp = (ftpRes.data?.ftp as number | null) || 200;

  const metrics = buildAthleteMetrics(activities, ftp, serverHistory);
  const { formScore, tfiCurrent, afiCurrent, tfiHistory, afiLast28 } = metrics;

  // Fatigue relative to the rider's own 28-day AFI range.
  const afiMin = afiLast28.length ? Math.min(...afiLast28) : 0;
  const afiMax = afiLast28.length ? Math.max(...afiLast28) : 0;
  const afiRange = afiMax - afiMin;
  const fatigueRelative =
    afiCurrent != null && afiRange > 0
      ? clamp01((afiCurrent - afiMin) / afiRange)
      : 0;

  const fitnessSlope14d = slopeLastN(tfiHistory, 14);
  const fitnessDelta28d =
    tfiHistory.length >= 2 ? tfiHistory[tfiHistory.length - 1].tfi - tfiHistory[0].tfi : 0;
  const ctlDeltaPct =
    tfiHistory.length >= 2 && tfiHistory[0].tfi > 0
      ? ((tfiHistory[tfiHistory.length - 1].tfi - tfiHistory[0].tfi) / tfiHistory[0].tfi) * 100
      : 0;

  const formEmpty = formScore == null;
  const fitnessEmpty = tfiCurrent == null;
  const fatigueEmpty = afiCurrent == null;

  const formV = freshnessFromFormScore(formScore);
  const fitnessV = fitnessWordFromSlope(fitnessSlope14d);
  const fatigueV = fatigueWordFromAFI(afiRange === 0 ? null : fatigueRelative);

  // Most recent fs_confidence from the server rows (if any).
  let fsConfidence: number | null = null;
  for (let i = serverHistory.length - 1; i >= 0; i--) {
    const c = serverHistory[i].fs_confidence;
    if (c != null) {
      fsConfidence = c;
      break;
    }
  }

  return {
    fs: formScore,
    tfi: tfiCurrent,
    afi: afiCurrent,
    formBand: classifyFormBandDisplay(formScore),
    formWord: formEmpty ? 'Building baseline' : formV.word,
    formColor: formEmpty ? todayColors.gray : formV.color,
    formVerdict: formVerdict(formScore),
    formRampPos: formScore == null ? 0.5 : clamp01((formScore + 30) / 60),
    confidenceTier: classifyFsConfidenceTier(fsConfidence),
    fitnessHistory: tfiHistory,
    fitnessWord: fitnessEmpty ? 'Building history' : fitnessV.word,
    fitnessColor: fitnessEmpty ? todayColors.gray : fitnessV.color,
    fitnessSlope14d,
    fitnessDelta28d,
    fitnessEmpty,
    fatigueRelative,
    fatigueWord: fatigueEmpty ? 'Building baseline' : fatigueV.word,
    fatigueColor: fatigueEmpty ? todayColors.gray : fatigueV.color,
    ctlDeltaPct,
  };
}
