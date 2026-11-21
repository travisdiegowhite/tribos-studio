/**
 * FIT run workout encoder.
 *
 * A run session used to export through the cycling encoder: sport=cycling,
 * steps targeting ~50% FTP, because a run's structure carries no power. This
 * encodes a run as what it is — a FIT workout with sport=running whose steps
 * target a SPEED band derived from the athlete's threshold pace, so a Garmin
 * or COROS watch shows "4:10–4:20/km" on each rep.
 *
 * Input is the session's sport-native steps (src/lib/training/session), so
 * the file is the same session the detail view draws. Repeats are emitted as
 * FIT repeat steps, not unrolled.
 *
 * Speed encoding: custom_target_value_low/high carry speed in mm/s (the
 * custom_target_speed subfield, scale 1000, units m/s), low = the slower
 * edge. With no threshold pace the steps are written with open targets.
 */

import { Encoder } from '@garmin/fitsdk';
import type { Encodable, FileIdMesg, WorkoutMesg, WorkoutStepMesg } from '@garmin/fitsdk';
import { summarizeSteps, type SessionStep } from '../lib/training/session';

const MESG_NUM_FILE_ID = 0;
const MESG_NUM_WORKOUT = 26;
const MESG_NUM_WORKOUT_STEP = 27;

/** Band around a single-value pace target, ± this share of the pace. */
const DEFAULT_PACE_BAND = 0.02;

export interface FitRunOptions {
  workoutName: string;
  /** Threshold pace, sec/km. Without it the steps carry no pace target. */
  thresholdPaceSec?: number | null;
}

/** Speed in mm/s (FIT raw) for a pace in sec/km. */
function mmPerSec(secPerKm: number): number {
  return Math.round((1000 / secPerKm) * 1000);
}

/** The [low, high] speed band (mm/s) for a step's pace target, or null for an open step. */
export function speedBandFor(step: SessionStep, thresholdPaceSec: number | null | undefined): [number, number] | null {
  if (!step.target || step.target.kind !== 'pace' || !thresholdPaceSec || thresholdPaceSec <= 0) return null;
  const lo = step.target.min ?? step.target.value;
  const hi = step.target.max ?? step.target.value;
  // % of threshold pace: a bigger number is a slower pace.
  let slowSec = thresholdPaceSec * (Math.max(lo, hi) / 100);
  let fastSec = thresholdPaceSec * (Math.min(lo, hi) / 100);
  if (slowSec === fastSec) {
    slowSec *= 1 + DEFAULT_PACE_BAND;
    fastSec *= 1 - DEFAULT_PACE_BAND;
  }
  return [mmPerSec(slowSec), mmPerSec(fastSec)];
}

function intensityOf(step: SessionStep): 'warmup' | 'cooldown' | 'rest' | 'active' {
  if (step.phase === 'warmup') return 'warmup';
  if (step.phase === 'cooldown') return 'cooldown';
  if (step.phase === 'rest') return 'rest';
  return 'active';
}

export function encodeFitRunWorkout(steps: SessionStep[], options: FitRunOptions): Uint8Array {
  const encoder = new Encoder();
  const tp = options.thresholdPaceSec;

  type Entry = { kind: 'step'; step: SessionStep } | { kind: 'repeat'; back: number; times: number };
  const entries: Entry[] = [];
  for (const block of summarizeSteps(steps)) {
    if (block.kind === 'repeat') {
      const start = entries.length;
      entries.push({ kind: 'step', step: block.work });
      if (block.rest) entries.push({ kind: 'step', step: block.rest });
      entries.push({ kind: 'repeat', back: start, times: block.count });
    } else {
      entries.push({ kind: 'step', step: block.step });
    }
  }

  const fileId: Encodable<FileIdMesg> = {
    mesgNum: MESG_NUM_FILE_ID,
    type: 'workout',
    manufacturer: 1,
    product: 0,
    serialNumber: 0,
    timeCreated: new Date(),
  };
  encoder.writeMesg(fileId);

  const workout: Encodable<WorkoutMesg> = {
    mesgNum: MESG_NUM_WORKOUT,
    wktName: options.workoutName.substring(0, 48),
    sport: 'running',
    subSport: 'generic',
    numValidSteps: entries.length,
  };
  encoder.writeMesg(workout);

  entries.forEach((entry, i) => {
    if (entry.kind === 'repeat') {
      encoder.writeMesg({
        mesgNum: MESG_NUM_WORKOUT_STEP,
        messageIndex: i,
        durationType: 'repeatUntilStepsCmplt',
        durationValue: entry.back,
        targetType: 'open',
        targetValue: entry.times,
        intensity: 'active',
      } as Encodable<WorkoutStepMesg>);
      return;
    }
    const { step } = entry;
    const band = speedBandFor(step, tp);
    const mesg: Encodable<WorkoutStepMesg> = {
      mesgNum: MESG_NUM_WORKOUT_STEP,
      messageIndex: i,
      wktStepName: step.label?.split(' · ')[0]?.substring(0, 32) || undefined,
      durationType: 'time',
      durationValue: Math.round(step.durationMin * 60 * 1000),
      intensity: intensityOf(step),
      targetType: band ? 'speed' : 'open',
      targetValue: 0,
    };
    if (band) {
      mesg.customTargetValueLow = band[0];
      mesg.customTargetValueHigh = band[1];
    }
    encoder.writeMesg(mesg);
  });

  return encoder.close();
}
