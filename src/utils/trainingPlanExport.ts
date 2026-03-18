/**
 * Training Plan Export Utility
 * Exports planned workouts from a training plan in various formats:
 * - CSV: Spreadsheet-friendly format with all workout details
 * - iCalendar (.ics): Import into Google Calendar, Apple Calendar, Outlook
 * - JSON: Full structured data for backup or external integrations
 * - FIT (ZIP): Structured workout files for bike computers (Garmin, Wahoo, Hammerhead)
 */

import JSZip from 'jszip';
import { encodeFitWorkout } from './fitWorkoutEncoder';
import type {
  ActivePlan,
  PlannedWorkoutWithDetails,
  PlanProgress,
  WorkoutDefinition,
  WorkoutStructure,
  WorkoutSegment,
  WorkoutInterval,
  CyclingWorkoutStructure,
  CyclingIntervalStep,
  CyclingRepeatBlock,
} from '../types/training';

// ============================================================
// TYPES
// ============================================================

export type PlanExportFormat = 'csv' | 'ical' | 'json' | 'fit';

export interface PlanExportResult {
  content: string | Uint8Array;
  filename: string;
  mimeType: string;
}

export interface PlanExportOptions {
  format: PlanExportFormat;
  includeCompleted?: boolean;
  includeNotes?: boolean;
}

// ============================================================
// DAY NAME HELPERS
// ============================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] || 'Unknown';
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// ============================================================
// CSV EXPORT
// ============================================================

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCSV(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[],
  progress?: PlanProgress | null
): string {
  const lines: string[] = [];

  // Header metadata
  lines.push(`# Training Plan: ${plan.name}`);
  lines.push(`# Methodology: ${plan.methodology || 'N/A'}`);
  lines.push(`# Goal: ${plan.goal || 'N/A'}`);
  lines.push(`# Duration: ${plan.duration_weeks} weeks`);
  lines.push(`# Started: ${formatDate(plan.started_at)}`);
  if (progress) {
    lines.push(`# Compliance: ${Math.round(progress.overallCompliance)}%`);
  }
  lines.push('');

  // Column headers
  lines.push([
    'Week',
    'Day',
    'Date',
    'Workout Name',
    'Type',
    'Target Duration (min)',
    'Target TSS',
    'Target Distance (km)',
    'Description',
    'Coach Notes',
    'Completed',
    'Actual Duration (min)',
    'Actual TSS',
    'Actual Distance (km)',
    'Notes',
  ].join(','));

  // Sort by week then day
  const sorted = [...workouts].sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.day_of_week - b.day_of_week;
  });

  for (const w of sorted) {
    lines.push([
      escapeCSV(w.week_number),
      escapeCSV(getDayName(w.day_of_week)),
      escapeCSV(w.scheduled_date ? formatDate(w.scheduled_date) : ''),
      escapeCSV(w.workout?.name || w.workout_type || 'Rest'),
      escapeCSV(w.workout?.category || w.workout_type || ''),
      escapeCSV(w.target_duration || w.workout?.duration || ''),
      escapeCSV(w.target_tss || w.workout?.targetTSS || ''),
      escapeCSV(w.target_distance_km),
      escapeCSV(w.workout?.description || ''),
      escapeCSV(w.workout?.coachNotes || ''),
      escapeCSV(w.completed ? 'Yes' : 'No'),
      escapeCSV(w.actual_duration),
      escapeCSV(w.actual_tss),
      escapeCSV(w.actual_distance_km),
      escapeCSV(w.notes),
    ].join(','));
  }

  return lines.join('\n');
}

// ============================================================
// iCALENDAR (.ICS) EXPORT
// ============================================================

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toICalDate(isoDate: string): string {
  // Convert ISO date string to iCal date format: YYYYMMDD
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function generateUID(workoutId: string): string {
  return `${workoutId}@tribos.studio`;
}

export function generateICal(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[]
): string {
  const lines: string[] = [];
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Tribos Studio//Training Plan Export//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalText(plan.name)}`);
  lines.push('X-WR-TIMEZONE:UTC');

  // Sort by date
  const sorted = [...workouts].sort((a, b) => {
    if (a.scheduled_date && b.scheduled_date) {
      return a.scheduled_date.localeCompare(b.scheduled_date);
    }
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.day_of_week - b.day_of_week;
  });

  for (const w of sorted) {
    if (!w.scheduled_date) continue;

    const workoutName = w.workout?.name || w.workout_type || 'Workout';
    const duration = w.target_duration || w.workout?.duration || 60;
    const dateStr = toICalDate(w.scheduled_date);

    // Build description
    const descParts: string[] = [];
    if (w.workout?.category) descParts.push(`Type: ${w.workout.category}`);
    if (w.target_tss || w.workout?.targetTSS) {
      descParts.push(`Target TSS: ${w.target_tss || w.workout?.targetTSS}`);
    }
    if (duration) descParts.push(`Duration: ${formatDuration(duration)}`);
    if (w.target_distance_km) descParts.push(`Distance: ${w.target_distance_km} km`);
    if (w.workout?.description) descParts.push(`\\n${w.workout.description}`);
    if (w.workout?.coachNotes) descParts.push(`\\nCoach Notes: ${w.workout.coachNotes}`);
    if (w.notes) descParts.push(`\\nNotes: ${w.notes}`);

    // Build workout structure summary if available
    if (w.workout?.structure) {
      const struct = w.workout.structure;
      const structParts: string[] = [];
      if (struct.warmup) structParts.push(`Warmup: ${struct.warmup.duration}min @ ${struct.warmup.zone}`);
      if (struct.main && struct.main.length > 0) {
        structParts.push('Main:');
        for (const interval of struct.main) {
          if ('type' in interval && interval.type === 'repeat') {
            structParts.push(`  ${interval.iterations}x repeat`);
          } else {
            const step = interval as { name?: string; duration?: number; zone?: string };
            structParts.push(`  ${step.name || 'Interval'}: ${step.duration || '?'}min @ ${step.zone || '?'}`);
          }
        }
      }
      if (struct.cooldown) structParts.push(`Cooldown: ${struct.cooldown.duration}min @ ${struct.cooldown.zone}`);
      if (structParts.length > 0) {
        descParts.push(`\\nStructure:\\n${structParts.join('\\n')}`);
      }
    }

    const description = escapeICalText(descParts.join('\\n'));

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${generateUID(w.id)}`);
    lines.push(`DTSTAMP:${timestamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
    // All-day event (workouts are full-day markers)
    lines.push(`SUMMARY:${escapeICalText(`${plan.name} - Wk${w.week_number}: ${workoutName}`)}`);
    if (description) lines.push(`DESCRIPTION:${description}`);
    if (w.completed) lines.push('STATUS:CONFIRMED');
    lines.push(`CATEGORIES:Training,${escapeICalText(w.workout?.category || 'workout')}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ============================================================
// JSON EXPORT
// ============================================================

export function generatePlanJSON(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[],
  progress?: PlanProgress | null
): string {
  const sorted = [...workouts].sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.day_of_week - b.day_of_week;
  });

  const exportData = {
    plan: {
      name: plan.name,
      methodology: plan.methodology,
      goal: plan.goal,
      fitnessLevel: plan.fitness_level,
      durationWeeks: plan.duration_weeks,
      status: plan.status,
      startedAt: plan.started_at,
      sportType: plan.sport_type,
    },
    progress: progress ? {
      currentWeek: progress.currentWeek,
      totalWeeks: progress.totalWeeks,
      currentPhase: progress.currentPhase,
      overallCompliance: progress.overallCompliance,
      daysRemaining: progress.daysRemaining,
      weeklyStats: progress.weeklyStats,
    } : null,
    workouts: sorted.map(w => ({
      weekNumber: w.week_number,
      dayOfWeek: getDayName(w.day_of_week),
      scheduledDate: w.scheduled_date,
      name: w.workout?.name || w.workout_type || 'Rest',
      category: w.workout?.category || w.workout_type || null,
      targetDurationMinutes: w.target_duration || w.workout?.duration || null,
      targetTSS: w.target_tss || w.workout?.targetTSS || null,
      targetDistanceKm: w.target_distance_km,
      description: w.workout?.description || null,
      coachNotes: w.workout?.coachNotes || null,
      structure: w.workout?.structure || null,
      completed: w.completed,
      completedAt: w.completed_at,
      actualDurationMinutes: w.actual_duration,
      actualTSS: w.actual_tss,
      actualDistanceKm: w.actual_distance_km,
      notes: w.notes,
    })),
    exportedAt: new Date().toISOString(),
    source: 'Tribos Studio',
  };

  return JSON.stringify(exportData, null, 2);
}

// ============================================================
// WORKOUT STRUCTURE CONVERTER
// ============================================================

/**
 * Convert a basic WorkoutStructure (warmup/main/cooldown with powerPctFTP)
 * to CyclingWorkoutStructure (detailed steps with PowerTarget) for FIT encoding.
 * Most workouts in the library use the basic format; only a few have cyclingStructure.
 */
function convertSegmentToStep(
  segment: WorkoutSegment,
  stepType: CyclingIntervalStep['type'] = 'work'
): CyclingIntervalStep {
  return {
    name: segment.description || stepType,
    type: stepType,
    duration: segment.duration * 60, // minutes to seconds
    power: {
      type: 'percent_ftp',
      value: segment.powerPctFTP || 50,
    },
  };
}

function convertIntervalToRepeat(interval: WorkoutInterval): CyclingRepeatBlock {
  const steps: CyclingIntervalStep[] = [];

  // Handle work — can be a single segment, array, or nested interval
  const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
  for (const item of workItems) {
    if ('type' in item && item.type === 'repeat') {
      // Nested repeat — flatten into the steps
      const nested = convertIntervalToRepeat(item as WorkoutInterval);
      steps.push(...nested.steps);
    } else {
      steps.push(convertSegmentToStep(item as WorkoutSegment, 'work'));
    }
  }

  // Add rest segment
  if (interval.rest && interval.rest.duration > 0) {
    const rest = interval.rest as WorkoutSegment;
    steps.push(convertSegmentToStep(
      { duration: rest.duration, zone: rest.zone, powerPctFTP: rest.powerPctFTP || 40, description: 'Recovery' },
      'recovery'
    ));
  }

  return {
    type: 'repeat',
    name: 'Main Set',
    iterations: interval.sets || 1,
    steps,
  };
}

export function workoutStructureToCycling(
  structure: WorkoutStructure,
  totalDuration?: number
): CyclingWorkoutStructure {
  const steps: (CyclingIntervalStep | CyclingRepeatBlock)[] = [];

  // Warmup
  if (structure.warmup && structure.warmup.duration > 0) {
    steps.push({
      name: structure.warmup.description || 'Warmup',
      type: 'warmup',
      duration: structure.warmup.duration * 60,
      power: { type: 'percent_ftp', value: structure.warmup.powerPctFTP || 50 },
    });
  }

  // Main set
  for (const item of structure.main) {
    if ('type' in item && item.type === 'repeat') {
      steps.push(convertIntervalToRepeat(item as WorkoutInterval));
    } else {
      steps.push(convertSegmentToStep(item as WorkoutSegment, 'work'));
    }
  }

  // Cooldown
  if (structure.cooldown && structure.cooldown.duration > 0) {
    steps.push({
      name: structure.cooldown.description || 'Cooldown',
      type: 'cooldown',
      duration: structure.cooldown.duration * 60,
      power: { type: 'percent_ftp', value: structure.cooldown.powerPctFTP || 45 },
    });
  }

  // Calculate total duration from steps if not provided
  const calcDuration = totalDuration || steps.reduce((sum, step) => {
    if (step.type === 'repeat') {
      const block = step as CyclingRepeatBlock;
      const blockTime = block.steps.reduce((s, st) => s + st.duration, 0) * block.iterations;
      return sum + blockTime / 60;
    }
    return sum + (step as CyclingIntervalStep).duration / 60;
  }, 0);

  return { totalDuration: calcDuration, steps };
}

/**
 * Get a CyclingWorkoutStructure from a WorkoutDefinition,
 * preferring the explicit cyclingStructure if available, else converting from basic structure.
 */
export function getCyclingStructure(workout: WorkoutDefinition): CyclingWorkoutStructure | null {
  if (workout.cyclingStructure) return workout.cyclingStructure;
  if (workout.structure) return workoutStructureToCycling(workout.structure, workout.duration);
  return null;
}

// ============================================================
// FIT WORKOUTS ZIP EXPORT
// ============================================================

export async function generateFitZip(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[]
): Promise<Uint8Array> {
  const zip = new JSZip();
  let fileCount = 0;

  const sorted = [...workouts].sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.day_of_week - b.day_of_week;
  });

  for (const w of sorted) {
    if (!w.workout) continue;

    const cyclingStructure = getCyclingStructure(w.workout);
    if (!cyclingStructure || cyclingStructure.steps.length === 0) continue;

    const workoutName = w.workout.name || w.workout_type || 'Workout';
    const prefix = `Wk${w.week_number}_${getDayName(w.day_of_week).slice(0, 3)}`;
    const cleanName = `${prefix}_${workoutName}`.replace(/[^a-zA-Z0-9-_]/g, '_');

    try {
      const fitData = encodeFitWorkout(cyclingStructure, {
        workoutName: `${prefix}: ${workoutName}`,
        description: w.workout.description,
      });
      zip.file(`${cleanName}.fit`, fitData);
      fileCount++;
    } catch {
      // Skip workouts that fail to encode (e.g. missing power data)
    }
  }

  if (fileCount === 0) {
    throw new Error('No workouts with structured power data found in this plan');
  }

  return zip.generateAsync({ type: 'uint8array' });
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================

export function exportTrainingPlan(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[],
  options: PlanExportOptions,
  progress?: PlanProgress | null
): PlanExportResult {
  const cleanName = plan.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');

  switch (options.format) {
    case 'csv':
      return {
        content: generateCSV(plan, workouts, progress),
        filename: `${cleanName}_workouts.csv`,
        mimeType: 'text/csv',
      };

    case 'ical':
      return {
        content: generateICal(plan, workouts),
        filename: `${cleanName}_workouts.ics`,
        mimeType: 'text/calendar',
      };

    case 'json':
      return {
        content: generatePlanJSON(plan, workouts, progress),
        filename: `${cleanName}_workouts.json`,
        mimeType: 'application/json',
      };

    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

/**
 * Export training plan workouts as FIT files in a ZIP archive.
 * Async because ZIP generation is async.
 */
export async function exportTrainingPlanFit(
  plan: ActivePlan,
  workouts: PlannedWorkoutWithDetails[]
): Promise<PlanExportResult> {
  const cleanName = plan.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
  const zipData = await generateFitZip(plan, workouts);
  return {
    content: zipData,
    filename: `${cleanName}_workouts.zip`,
    mimeType: 'application/zip',
  };
}

/**
 * Trigger download of exported training plan file
 */
export function downloadPlanExport(result: PlanExportResult): void {
  const blob = result.content instanceof Uint8Array
    ? new Blob([result.content], { type: result.mimeType })
    : new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
