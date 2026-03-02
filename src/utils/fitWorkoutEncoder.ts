/**
 * FIT Workout Encoder
 *
 * Converts CyclingWorkoutStructure → FIT binary Uint8Array using @garmin/fitsdk.
 * Produces workout files that display structured power targets, interval timers,
 * and step-by-step cues on Garmin/Wahoo head units.
 *
 * FIT message sequence:
 *   1. file_id (type=workout)
 *   2. workout (name, step count, sport=cycling)
 *   3. workout_step × N (duration, power targets, intensity)
 *
 * Power encoding:
 *   %FTP values use offset convention: raw = percentFTP + 1000
 *   e.g. 90% FTP → customTargetValueLow=1087, customTargetValueHigh=1093
 *   Absolute watts: raw values, no offset
 */

// @ts-expect-error — @garmin/fitsdk has no type declarations
import { Encoder, Profile } from '@garmin/fitsdk';
import type {
  CyclingWorkoutStructure,
  CyclingIntervalStep,
  CyclingRepeatBlock,
  PowerTarget,
} from '../types/training';

// ============================================================================
// FIT CONSTANTS (from Profile inspection)
// ============================================================================

// Message numbers
const MESG_NUM_FILE_ID = 0;
const MESG_NUM_WORKOUT = 26;
const MESG_NUM_WORKOUT_STEP = 27;

// FIT %FTP offset convention: value + 1000
const FTP_PERCENT_OFFSET = 1000;

// Default power range band (±3% for single-value targets)
const DEFAULT_POWER_BAND = 3;

// ============================================================================
// TYPES
// ============================================================================

export interface FitEncoderOptions {
  workoutName: string;
  description?: string;
}

interface FlatStep {
  name: string;
  type: CyclingIntervalStep['type'];
  duration: number; // seconds
  power: PowerTarget | null;
  cadenceMin?: number;
  cadenceMax?: number;
  instructions?: string;
}

interface FlatRepeat {
  kind: 'repeat';
  backToIndex: number;
  iterations: number;
}

type EmitEntry = { kind: 'step'; step: FlatStep } | FlatRepeat;

// ============================================================================
// STEP FLATTENING
// ============================================================================

/**
 * Flatten CyclingWorkoutStructure steps into a linear sequence
 * with explicit repeat-back entries for CyclingRepeatBlock.
 */
function flattenSteps(
  steps: (CyclingIntervalStep | CyclingRepeatBlock)[]
): EmitEntry[] {
  const entries: EmitEntry[] = [];

  for (const step of steps) {
    if (step.type === 'repeat') {
      const block = step as CyclingRepeatBlock;
      const startIndex = entries.length;

      // Emit inner steps
      for (const inner of block.steps) {
        entries.push({
          kind: 'step',
          step: {
            name: inner.name,
            type: inner.type,
            duration: inner.duration,
            power: inner.power || null,
            cadenceMin: inner.cadence?.min,
            cadenceMax: inner.cadence?.max,
            instructions: inner.instructions,
          },
        });
      }

      // Emit repeat entry pointing back to startIndex
      entries.push({
        kind: 'repeat',
        backToIndex: startIndex,
        iterations: block.iterations,
      });
    } else {
      const interval = step as CyclingIntervalStep;
      entries.push({
        kind: 'step',
        step: {
          name: interval.name,
          type: interval.type,
          duration: interval.duration,
          power: interval.power || null,
          cadenceMin: interval.cadence?.min,
          cadenceMax: interval.cadence?.max,
          instructions: interval.instructions,
        },
      });
    }
  }

  return entries;
}

// ============================================================================
// POWER TARGET ENCODING
// ============================================================================

/**
 * Encode a PowerTarget into FIT custom target values.
 * Returns { low, high } for customTargetValueLow/High.
 */
export function encodePowerTarget(
  power: PowerTarget | null
): { low: number; high: number } | null {
  if (!power) return null;

  switch (power.type) {
    case 'percent_ftp': {
      const pct = power.value;
      return {
        low: pct - DEFAULT_POWER_BAND + FTP_PERCENT_OFFSET,
        high: pct + DEFAULT_POWER_BAND + FTP_PERCENT_OFFSET,
      };
    }
    case 'range': {
      const min = power.min ?? power.value;
      const max = power.max ?? power.value;
      return {
        low: min + FTP_PERCENT_OFFSET,
        high: max + FTP_PERCENT_OFFSET,
      };
    }
    case 'absolute_watts': {
      return {
        low: power.value - 10,
        high: power.value + 10,
      };
    }
    default:
      return null;
  }
}

/**
 * Map step type to FIT intensity enum value.
 */
function mapIntensity(type: CyclingIntervalStep['type']): string {
  switch (type) {
    case 'warmup':
      return 'warmup';
    case 'cooldown':
      return 'cooldown';
    case 'recovery':
    case 'rest':
      return 'rest';
    case 'work':
    default:
      return 'active';
  }
}

// ============================================================================
// MAIN ENCODER
// ============================================================================

/**
 * Encode a CyclingWorkoutStructure into a FIT workout binary file.
 * Returns a Uint8Array ready for download.
 */
export function encodeFitWorkout(
  workout: CyclingWorkoutStructure,
  options: FitEncoderOptions
): Uint8Array {
  const encoder = new Encoder();

  // Flatten all steps
  const entries = flattenSteps(workout.steps);
  const totalSteps = entries.length;

  // 1. file_id message
  encoder.writeMesg({
    mesgNum: MESG_NUM_FILE_ID,
    type: 'workout',
    manufacturer: 1, // Garmin
    product: 0,
    serialNumber: 0,
    timeCreated: new Date(),
  });

  // 2. workout message
  encoder.writeMesg({
    mesgNum: MESG_NUM_WORKOUT,
    wktName: options.workoutName.substring(0, 48), // FIT string limit
    sport: 'cycling',
    subSport: 'generic',
    numValidSteps: totalSteps,
  });

  // 3. workout_step messages
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.kind === 'repeat') {
      // Repeat step: points back to the first step of the block
      encoder.writeMesg({
        mesgNum: MESG_NUM_WORKOUT_STEP,
        messageIndex: i,
        durationType: 'repeatUntilStepsCmplt',
        durationValue: entry.backToIndex,
        targetType: 'open',
        targetValue: entry.iterations,
        intensity: 'active',
      });
    } else {
      const { step } = entry;
      const powerTarget = encodePowerTarget(step.power);

      const mesg: Record<string, unknown> = {
        mesgNum: MESG_NUM_WORKOUT_STEP,
        messageIndex: i,
        wktStepName: step.name?.substring(0, 32) || undefined,
        durationType: 'time',
        durationValue: step.duration * 1000, // FIT uses milliseconds
        intensity: mapIntensity(step.type),
        notes: step.instructions?.substring(0, 64) || undefined,
      };

      if (powerTarget) {
        mesg.targetType = 'power';
        mesg.targetValue = 0; // 0 = use custom range
        mesg.customTargetValueLow = powerTarget.low;
        mesg.customTargetValueHigh = powerTarget.high;
      } else {
        mesg.targetType = 'open';
        mesg.targetValue = 0;
      }

      // Secondary target: cadence (if specified)
      if (step.cadenceMin != null && step.cadenceMax != null) {
        mesg.secondaryTargetType = 'cadence';
        mesg.secondaryTargetValue = 0;
        mesg.secondaryCustomTargetValueLow = step.cadenceMin;
        mesg.secondaryCustomTargetValueHigh = step.cadenceMax;
      }

      encoder.writeMesg(mesg);
    }
  }

  return encoder.close();
}
