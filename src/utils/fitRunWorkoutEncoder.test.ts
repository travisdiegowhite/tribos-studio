import { describe, it, expect } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { encodeFitRunWorkout, speedBandFor } from './fitRunWorkoutEncoder';
import { resolveSession } from '../lib/training/session';

const run = resolveSession(
  {
    name: 'Threshold Run',
    workout_type: 'threshold',
    sport: 'running',
    target_duration: 50,
    details: {
      prescription: {
        version: 1,
        source: 'coach',
        basis: 'pace',
        intervals: [{ repeats: 4, duration_min: 5, recovery_min: 2, target_pct_threshold_pace_min: 98, target_pct_threshold_pace_max: 102 }],
      },
    },
  },
  { today: '2026-11-21' },
);

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return messages as any;
}

describe('encodeFitRunWorkout', () => {
  it('writes a running workout with speed targets from threshold pace', () => {
    const messages = decode(encodeFitRunWorkout(run.steps, { workoutName: 'Threshold Run', thresholdPaceSec: 300 }));
    expect(messages.workoutMesgs[0].sport).toBe('running');
    const steps = messages.workoutStepMesgs;
    // warmup, rep, easy jog, repeat ×4, cooldown
    expect(steps.map((s: { durationType: string }) => s.durationType)).toEqual(['time', 'time', 'time', 'repeatUntilStepsCmplt', 'time']);
    const rep = steps[1];
    expect(rep.targetType).toBe('speed');
    // 98–102% of a 5:00/km threshold: 4:54–5:06/km → 3.27–3.40 m/s
    expect(rep.customTargetSpeedLow).toBeCloseTo(1000 / 306, 2);
    expect(rep.customTargetSpeedHigh).toBeCloseTo(1000 / 294, 2);
    expect(rep.durationTime).toBe(300);
    expect(steps[3].repeatSteps ?? steps[3].targetValue).toBe(4);
  });

  it('writes open targets when the threshold pace is unknown', () => {
    const messages = decode(encodeFitRunWorkout(run.steps, { workoutName: 'Run' }));
    expect(messages.workoutStepMesgs.filter((s: { targetType: string }) => s.targetType === 'speed')).toHaveLength(0);
  });

  it('gives a single pace a small band, slower edge low', () => {
    const band = speedBandFor({ phase: 'work', durationMin: 5, zone: 4, intensity: 1, target: { kind: 'pace', value: 100 }, label: 'Rep' }, 300);
    expect(band![0]).toBeLessThan(band![1]);
  });
});
