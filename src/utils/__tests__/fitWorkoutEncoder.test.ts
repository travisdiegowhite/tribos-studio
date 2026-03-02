import { describe, it, expect } from 'vitest';
import { encodeFitWorkout, encodePowerTarget } from '../fitWorkoutEncoder';
// @ts-expect-error — @garmin/fitsdk has no type declarations
import { Decoder, Stream } from '@garmin/fitsdk';
import type {
  CyclingWorkoutStructure,
  CyclingIntervalStep,
  CyclingRepeatBlock,
} from '../../types/training';

// ─── Helper: Decode FIT binary to inspect messages ──────────────────────────

function decodeFit(data: Uint8Array) {
  const stream = Stream.fromByteArray(data);
  const decoder = new Decoder(stream);

  if (!decoder.isFIT()) throw new Error('Not a valid FIT file');
  if (!decoder.checkIntegrity()) throw new Error('FIT integrity check failed');

  const { messages, errors } = decoder.read();
  return { messages, errors };
}

// ─── Helper: Create simple workout ─────────────────────────────────────────

function createSimpleWorkout(): CyclingWorkoutStructure {
  return {
    totalDuration: 45,
    steps: [
      {
        name: 'Warmup',
        type: 'warmup',
        duration: 600, // 10 min
        power: { type: 'percent_ftp', value: 60 },
        cadence: { min: 85, max: 95 },
        instructions: 'Easy spinning',
      } as CyclingIntervalStep,
      {
        name: 'Main Set',
        type: 'work',
        duration: 1800, // 30 min
        power: { type: 'percent_ftp', value: 90 },
        cadence: { min: 85, max: 95 },
        instructions: 'Sweet spot effort',
      } as CyclingIntervalStep,
      {
        name: 'Cooldown',
        type: 'cooldown',
        duration: 300, // 5 min
        power: { type: 'percent_ftp', value: 50 },
        instructions: 'Easy spin down',
      } as CyclingIntervalStep,
    ],
  };
}

// ─── encodePowerTarget ──────────────────────────────────────────────────────

describe('encodePowerTarget', () => {
  it('encodes percent_ftp with ±3 band and +1000 offset', () => {
    const result = encodePowerTarget({ type: 'percent_ftp', value: 90 });
    expect(result).not.toBeNull();
    expect(result!.low).toBe(87 + 1000); // 1087
    expect(result!.high).toBe(93 + 1000); // 1093
  });

  it('encodes range targets with +1000 offset', () => {
    const result = encodePowerTarget({ type: 'range', value: 90, min: 85, max: 95 });
    expect(result).not.toBeNull();
    expect(result!.low).toBe(85 + 1000); // 1085
    expect(result!.high).toBe(95 + 1000); // 1095
  });

  it('encodes absolute_watts with ±10W band', () => {
    const result = encodePowerTarget({ type: 'absolute_watts', value: 250 });
    expect(result).not.toBeNull();
    expect(result!.low).toBe(240);
    expect(result!.high).toBe(260);
  });

  it('returns null for null power', () => {
    expect(encodePowerTarget(null)).toBeNull();
  });
});

// ─── encodeFitWorkout ───────────────────────────────────────────────────────

describe('encodeFitWorkout', () => {
  it('produces a valid Uint8Array', () => {
    const workout = createSimpleWorkout();
    const result = encodeFitWorkout(workout, { workoutName: 'Test Workout' });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces a valid FIT file that decodes without errors', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test Workout' });

    const { messages, errors } = decodeFit(data);
    expect(errors).toHaveLength(0);
    expect(messages).toBeDefined();
  });

  it('encodes correct file_id with workout type', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test' });
    const { messages } = decodeFit(data);

    const fileId = messages.fileIdMesgs?.[0];
    expect(fileId).toBeDefined();
    expect(fileId.type).toBe('workout');
  });

  it('encodes workout message with correct name and step count', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Sweet Spot Base' });
    const { messages } = decodeFit(data);

    const workoutMsg = messages.workoutMesgs?.[0];
    expect(workoutMsg).toBeDefined();
    expect(workoutMsg.wktName).toBe('Sweet Spot Base');
    expect(workoutMsg.numValidSteps).toBe(3);
    expect(workoutMsg.sport).toBe('cycling');
  });

  it('encodes 3 workout steps for simple workout', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test' });
    const { messages } = decodeFit(data);

    const steps = messages.workoutStepMesgs;
    expect(steps).toHaveLength(3);
  });

  it('encodes step duration in milliseconds', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test' });
    const { messages } = decodeFit(data);

    const steps = messages.workoutStepMesgs;
    expect(steps[0].durationValue).toBe(600000); // 600s × 1000
    expect(steps[1].durationValue).toBe(1800000); // 1800s × 1000
    expect(steps[2].durationValue).toBe(300000); // 300s × 1000
  });

  it('encodes power targets with %FTP offset', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test' });
    const { messages } = decodeFit(data);

    const mainStep = messages.workoutStepMesgs[1]; // Main Set at 90% FTP
    expect(mainStep.targetType).toBe('power');
    expect(mainStep.targetValue).toBe(0); // Use custom range
    expect(mainStep.customTargetValueLow).toBe(1087); // 90-3+1000
    expect(mainStep.customTargetValueHigh).toBe(1093); // 90+3+1000
  });

  it('encodes intensity correctly per step type', () => {
    const workout = createSimpleWorkout();
    const data = encodeFitWorkout(workout, { workoutName: 'Test' });
    const { messages } = decodeFit(data);

    const steps = messages.workoutStepMesgs;
    expect(steps[0].intensity).toBe('warmup');
    expect(steps[1].intensity).toBe('active');
    expect(steps[2].intensity).toBe('cooldown');
  });

  it('encodes repeat blocks correctly', () => {
    const workout: CyclingWorkoutStructure = {
      totalDuration: 60,
      steps: [
        {
          name: 'Warmup',
          type: 'warmup',
          duration: 600,
          power: { type: 'percent_ftp', value: 55 },
        } as CyclingIntervalStep,
        {
          type: 'repeat',
          name: '3x10 Intervals',
          iterations: 3,
          steps: [
            {
              name: 'Work',
              type: 'work',
              duration: 600,
              power: { type: 'percent_ftp', value: 100 },
            } as CyclingIntervalStep,
            {
              name: 'Recovery',
              type: 'recovery',
              duration: 300,
              power: { type: 'percent_ftp', value: 50 },
            } as CyclingIntervalStep,
          ],
        } as CyclingRepeatBlock,
        {
          name: 'Cooldown',
          type: 'cooldown',
          duration: 300,
          power: { type: 'percent_ftp', value: 50 },
        } as CyclingIntervalStep,
      ],
    };

    const data = encodeFitWorkout(workout, { workoutName: 'Interval Test' });
    const { messages, errors } = decodeFit(data);
    expect(errors).toHaveLength(0);

    const steps = messages.workoutStepMesgs;
    // 1 warmup + 2 inner steps + 1 repeat + 1 cooldown = 5 total
    expect(steps).toHaveLength(5);

    // Repeat step is index 3 (after warmup=0, work=1, recovery=2)
    const repeatStep = steps[3];
    expect(repeatStep.durationType).toBe('repeatUntilStepsCmplt');
    expect(repeatStep.durationValue).toBe(1); // Back to index 1 (the work step)
    expect(repeatStep.targetValue).toBe(3); // 3 iterations
  });

  it('handles empty workout without crashing', () => {
    const workout: CyclingWorkoutStructure = {
      totalDuration: 0,
      steps: [],
    };

    const data = encodeFitWorkout(workout, { workoutName: 'Empty' });
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(0);

    const { errors } = decodeFit(data);
    expect(errors).toHaveLength(0);
  });

  it('encodes cadence as secondary target', () => {
    const workout: CyclingWorkoutStructure = {
      totalDuration: 10,
      steps: [
        {
          name: 'High Cadence',
          type: 'work',
          duration: 600,
          power: { type: 'percent_ftp', value: 80 },
          cadence: { min: 100, max: 110 },
        } as CyclingIntervalStep,
      ],
    };

    const data = encodeFitWorkout(workout, { workoutName: 'Cadence Test' });
    const { messages } = decodeFit(data);

    const step = messages.workoutStepMesgs[0];
    expect(step.secondaryTargetType).toBe('cadence');
    expect(step.secondaryCustomTargetValueLow).toBe(100);
    expect(step.secondaryCustomTargetValueHigh).toBe(110);
  });

  it('encodes steps with no power target as open', () => {
    const workout: CyclingWorkoutStructure = {
      totalDuration: 5,
      steps: [
        {
          name: 'Free Ride',
          type: 'work',
          duration: 300,
          power: { type: 'percent_ftp', value: 0 },
        } as CyclingIntervalStep,
      ],
    };

    const data = encodeFitWorkout(workout, { workoutName: 'Open Test' });
    const { messages } = decodeFit(data);

    // Power target of 0% FTP still encodes as power target
    const step = messages.workoutStepMesgs[0];
    expect(step.targetType).toBe('power');
  });

  it('truncates long workout names', () => {
    const workout = createSimpleWorkout();
    const longName = 'A'.repeat(100);
    const data = encodeFitWorkout(workout, { workoutName: longName });
    const { messages } = decodeFit(data);

    const workoutMsg = messages.workoutMesgs[0];
    expect(workoutMsg.wktName.length).toBeLessThanOrEqual(48);
  });
});
