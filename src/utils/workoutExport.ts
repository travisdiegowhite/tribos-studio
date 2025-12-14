/**
 * Workout Export Utility
 * Generates workout files for bike computers in various formats:
 * - ZWO (Zwift Workout) - XML format for Zwift
 * - MRC/ERG - Text format for TrainerRoad and other apps
 * - JSON - For custom integrations
 *
 * FIT file export requires a binary encoder and is handled separately
 */

import type {
  CyclingWorkoutStructure,
  CyclingIntervalStep,
  CyclingRepeatBlock,
  WorkoutExportFormat,
  PowerTarget,
} from '../types/training';

// ============================================================
// TYPE GUARDS
// ============================================================

function isRepeatBlock(
  step: CyclingIntervalStep | CyclingRepeatBlock
): step is CyclingRepeatBlock {
  return 'type' in step && step.type === 'repeat';
}

// ============================================================
// POWER HELPERS
// ============================================================

/**
 * Convert power target to FTP percentage (0-1 scale for ZWO)
 */
function getPowerPercentage(power: PowerTarget): number {
  if (power.type === 'percent_ftp') {
    return power.value / 100;
  }
  // For absolute watts, we'd need FTP - default to 75%
  return 0.75;
}

/**
 * Get power percentage as integer (for MRC format)
 */
function getPowerPercentageInt(power: PowerTarget): number {
  if (power.type === 'percent_ftp') {
    return power.value;
  }
  return 75;
}

// ============================================================
// ZWO (ZWIFT WORKOUT) EXPORT
// ============================================================

/**
 * Generate Zwift Workout XML (.zwo)
 * Reference: https://github.com/h4l/zwift-workout-file-reference
 */
export function generateZWO(
  workout: CyclingWorkoutStructure,
  workoutName: string,
  description: string,
  author: string = 'Tribos Studio'
): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<workout_file>');
  lines.push(`  <author>${escapeXml(author)}</author>`);
  lines.push(`  <name>${escapeXml(workoutName)}</name>`);
  lines.push(`  <description>${escapeXml(description)}</description>`);
  lines.push('  <sportType>bike</sportType>');
  lines.push('  <tags/>');
  lines.push('  <workout>');

  // Track cumulative time in seconds
  let currentTime = 0;

  for (const step of workout.steps) {
    if (isRepeatBlock(step)) {
      // Repeat block
      lines.push(`    <IntervalsT Repeat="${step.iterations}" OnDuration="${step.steps[0]?.duration || 60}" OffDuration="${step.steps[1]?.duration || 60}" OnPower="${getPowerPercentage(step.steps[0]?.power || { type: 'percent_ftp', value: 100 })}" OffPower="${getPowerPercentage(step.steps[1]?.power || { type: 'percent_ftp', value: 50 })}">`);
      if (step.name) {
        lines.push(`      <textevent timeoffset="0" message="${escapeXml(step.name)}"/>`);
      }
      lines.push('    </IntervalsT>');

      // Update time
      const blockDuration = step.steps.reduce((sum, s) => sum + s.duration, 0) * step.iterations;
      currentTime += blockDuration;
    } else {
      // Single step
      const power = getPowerPercentage(step.power);
      const duration = step.duration;

      switch (step.type) {
        case 'warmup':
          // Warmup ramps from low to target power
          lines.push(`    <Warmup Duration="${duration}" PowerLow="0.25" PowerHigh="${power}">`);
          if (step.instructions) {
            lines.push(`      <textevent timeoffset="0" message="${escapeXml(step.instructions)}"/>`);
          }
          lines.push('    </Warmup>');
          break;

        case 'cooldown':
          // Cooldown ramps from target power to low
          lines.push(`    <Cooldown Duration="${duration}" PowerLow="${power}" PowerHigh="0.25">`);
          if (step.instructions) {
            lines.push(`      <textevent timeoffset="0" message="${escapeXml(step.instructions)}"/>`);
          }
          lines.push('    </Cooldown>');
          break;

        case 'rest':
        case 'recovery':
          lines.push(`    <SteadyState Duration="${duration}" Power="${power}">`);
          lines.push(`      <textevent timeoffset="0" message="Recovery - easy spinning"/>`);
          lines.push('    </SteadyState>');
          break;

        default:
          // Work interval
          lines.push(`    <SteadyState Duration="${duration}" Power="${power}">`);
          if (step.name || step.instructions) {
            lines.push(`      <textevent timeoffset="0" message="${escapeXml(step.name || step.instructions || '')}"/>`);
          }
          lines.push('    </SteadyState>');
      }

      currentTime += duration;
    }
  }

  lines.push('  </workout>');
  lines.push('</workout_file>');

  return lines.join('\n');
}

// ============================================================
// MRC/ERG EXPORT
// ============================================================

/**
 * Generate MRC/ERG format (TrainerRoad compatible)
 * Format: time in minutes, power as % FTP
 * Reference: Golden Cheetah documentation
 */
export function generateMRC(
  workout: CyclingWorkoutStructure,
  workoutName: string,
  description: string
): string {
  const lines: string[] = [];

  lines.push('[COURSE HEADER]');
  lines.push('VERSION = 2');
  lines.push('UNITS = ENGLISH');
  lines.push(`DESCRIPTION = ${description}`);
  lines.push(`FILE NAME = ${workoutName}`);
  lines.push('MINUTES PERCENT');
  lines.push('[END COURSE HEADER]');
  lines.push('[COURSE DATA]');

  let currentTimeMinutes = 0;

  for (const step of workout.steps) {
    if (isRepeatBlock(step)) {
      // Expand repeat block
      for (let i = 0; i < step.iterations; i++) {
        for (const subStep of step.steps) {
          const durationMinutes = subStep.duration / 60;
          const power = getPowerPercentageInt(subStep.power);

          // Start of interval
          lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
          currentTimeMinutes += durationMinutes;
          // End of interval (same power)
          lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
        }
      }
    } else {
      const durationMinutes = step.duration / 60;
      const power = getPowerPercentageInt(step.power);

      if (step.type === 'warmup') {
        // Warmup: ramp from 25% to target
        lines.push(`${currentTimeMinutes.toFixed(2)}\t25`);
        currentTimeMinutes += durationMinutes;
        lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
      } else if (step.type === 'cooldown') {
        // Cooldown: ramp from target to 25%
        lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
        currentTimeMinutes += durationMinutes;
        lines.push(`${currentTimeMinutes.toFixed(2)}\t25`);
      } else {
        // Steady state
        lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
        currentTimeMinutes += durationMinutes;
        lines.push(`${currentTimeMinutes.toFixed(2)}\t${power}`);
      }
    }
  }

  lines.push('[END COURSE DATA]');

  return lines.join('\n');
}

// ============================================================
// JSON EXPORT
// ============================================================

/**
 * Generate JSON format for custom integrations
 */
export function generateJSON(
  workout: CyclingWorkoutStructure,
  workoutName: string,
  description: string
): string {
  return JSON.stringify({
    name: workoutName,
    description,
    totalDuration: workout.totalDuration,
    steps: workout.steps,
    terrain: workout.terrain,
    exportedAt: new Date().toISOString(),
    source: 'Tribos Studio'
  }, null, 2);
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================

export interface WorkoutExportOptions {
  format: WorkoutExportFormat;
  workoutName: string;
  description: string;
  author?: string;
  ftp?: number; // User's FTP for absolute power calculations
}

export interface WorkoutExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

/**
 * Export a cycling workout to the specified format
 */
export function exportWorkout(
  workout: CyclingWorkoutStructure,
  options: WorkoutExportOptions
): WorkoutExportResult {
  const { format, workoutName, description, author } = options;

  // Clean filename
  const cleanName = workoutName.replace(/[^a-zA-Z0-9-_]/g, '_');

  switch (format) {
    case 'zwo':
      return {
        content: generateZWO(workout, workoutName, description, author),
        filename: `${cleanName}.zwo`,
        mimeType: 'application/xml'
      };

    case 'mrc':
    case 'erg':
      return {
        content: generateMRC(workout, workoutName, description),
        filename: `${cleanName}.mrc`,
        mimeType: 'text/plain'
      };

    case 'json':
      return {
        content: generateJSON(workout, workoutName, description),
        filename: `${cleanName}.json`,
        mimeType: 'application/json'
      };

    case 'fit':
      // FIT files require binary encoding - return placeholder
      // Real FIT export would need a library like fit-file-writer
      throw new Error('FIT file export requires binary encoding. Use Garmin Connect or a dedicated tool.');

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Trigger download of exported workout file
 */
export function downloadWorkout(result: WorkoutExportResult): void {
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create a simple cycling workout structure from basic parameters
 * Useful for quickly generating exportable workouts
 */
export function createSimpleWorkout(params: {
  warmupMinutes: number;
  intervals: { durationSeconds: number; powerPercent: number; restSeconds: number; restPowerPercent: number }[];
  sets: number;
  cooldownMinutes: number;
}): CyclingWorkoutStructure {
  const steps: (CyclingIntervalStep | CyclingRepeatBlock)[] = [];

  // Warmup
  if (params.warmupMinutes > 0) {
    steps.push({
      name: 'Warmup',
      type: 'warmup',
      duration: params.warmupMinutes * 60,
      power: { type: 'percent_ftp', value: 55 }
    });
  }

  // Main set
  if (params.intervals.length > 0 && params.sets > 0) {
    const intervalSteps: CyclingIntervalStep[] = [];

    for (const interval of params.intervals) {
      intervalSteps.push({
        name: 'Work',
        type: 'work',
        duration: interval.durationSeconds,
        power: { type: 'percent_ftp', value: interval.powerPercent }
      });

      intervalSteps.push({
        name: 'Rest',
        type: 'recovery',
        duration: interval.restSeconds,
        power: { type: 'percent_ftp', value: interval.restPowerPercent }
      });
    }

    steps.push({
      type: 'repeat',
      name: 'Main Set',
      iterations: params.sets,
      steps: intervalSteps
    });
  }

  // Cooldown
  if (params.cooldownMinutes > 0) {
    steps.push({
      name: 'Cooldown',
      type: 'cooldown',
      duration: params.cooldownMinutes * 60,
      power: { type: 'percent_ftp', value: 50 }
    });
  }

  // Calculate total duration
  let totalDuration = params.warmupMinutes + params.cooldownMinutes;
  for (const interval of params.intervals) {
    totalDuration += ((interval.durationSeconds + interval.restSeconds) / 60) * params.sets;
  }

  return {
    totalDuration,
    steps
  };
}

export default {
  generateZWO,
  generateMRC,
  generateJSON,
  exportWorkout,
  downloadWorkout,
  createSimpleWorkout
};
