import { describe, it, expect, vi } from 'vitest';
import {
  generateCSV,
  generateICal,
  generatePlanJSON,
  exportTrainingPlan,
  workoutStructureToCycling,
  getCyclingStructure,
} from './trainingPlanExport';
import type {
  ActivePlan,
  PlannedWorkoutWithDetails,
  PlanProgress,
  WorkoutDefinition,
} from '../types/training';

// ============================================================
// TEST FIXTURES
// ============================================================

const mockPlan: ActivePlan = {
  id: 'plan-1',
  user_id: 'user-1',
  template_id: 'template-1',
  name: 'Sweet Spot Base',
  sport_type: 'cycling',
  duration_weeks: 6,
  methodology: 'sweet_spot',
  goal: 'general_fitness',
  fitness_level: 'intermediate',
  status: 'active',
  started_at: '2026-03-01',
  ended_at: null,
  paused_at: null,
  current_week: 2,
  workouts_completed: 5,
  workouts_total: 24,
  compliance_percentage: 83,
  custom_start_day: null,
  auto_adjust_enabled: true,
  notes: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-15T00:00:00Z',
};

const mockWorkoutDef: WorkoutDefinition = {
  id: 'sst-1',
  name: 'Sweet Spot Intervals',
  category: 'sweet_spot',
  difficulty: 'intermediate',
  duration: 65,
  targetTSS: 85,
  intensityFactor: 0.9,
  description: '3x15min Sweet Spot intervals',
  focusArea: 'threshold',
  tags: ['sst', 'threshold'],
  terrainType: 'flat',
  structure: {
    warmup: { duration: 10, zone: 2, powerPctFTP: 60 },
    main: [
      { duration: 15, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
      { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
      { duration: 15, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
      { duration: 5, zone: 1, powerPctFTP: 50, description: 'Recovery' },
      { duration: 15, zone: 3.5, powerPctFTP: 90, description: 'Sweet Spot' },
    ],
    cooldown: { duration: 10, zone: 1, powerPctFTP: 45 },
  },
  coachNotes: 'Keep cadence at 85-95rpm',
};

const mockWorkoutWithIntervals: WorkoutDefinition = {
  id: 'vo2-1',
  name: 'VO2 Max Repeats',
  category: 'vo2max',
  difficulty: 'advanced',
  duration: 60,
  targetTSS: 95,
  intensityFactor: 0.95,
  description: '5x4min VO2 Max intervals',
  focusArea: 'vo2max',
  tags: ['vo2max'],
  terrainType: 'flat',
  structure: {
    warmup: { duration: 15, zone: 2, powerPctFTP: 60 },
    main: [
      {
        type: 'repeat' as const,
        sets: 5,
        work: [{ duration: 4, zone: 5, powerPctFTP: 120, description: 'VO2 Max' }],
        rest: { duration: 4, zone: 1, powerPctFTP: 40 },
      },
    ],
    cooldown: { duration: 10, zone: 1, powerPctFTP: 45 },
  },
  coachNotes: 'Aim for consistent power across all intervals',
};

const mockWorkouts: PlannedWorkoutWithDetails[] = [
  {
    id: 'pw-1',
    plan_id: 'plan-1',
    week_number: 1,
    day_of_week: 1,
    scheduled_date: '2026-03-02',
    workout_type: 'sweet_spot',
    workout_id: 'sst-1',
    target_tss: 85,
    target_duration: 65,
    target_distance_km: null,
    completed: true,
    completed_at: '2026-03-02T18:00:00Z',
    activity_id: 'act-1',
    actual_tss: 82,
    actual_duration: 63,
    actual_distance_km: 30,
    difficulty_rating: 7,
    notes: 'Felt strong today',
    skipped_reason: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-02T18:00:00Z',
    workout: mockWorkoutDef,
  },
  {
    id: 'pw-2',
    plan_id: 'plan-1',
    week_number: 1,
    day_of_week: 3,
    scheduled_date: '2026-03-04',
    workout_type: 'endurance',
    workout_id: null,
    target_tss: 60,
    target_duration: 90,
    target_distance_km: 40,
    completed: false,
    completed_at: null,
    activity_id: null,
    actual_tss: null,
    actual_duration: null,
    actual_distance_km: null,
    difficulty_rating: null,
    notes: null,
    skipped_reason: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    workout: undefined,
  },
  {
    id: 'pw-3',
    plan_id: 'plan-1',
    week_number: 1,
    day_of_week: 5,
    scheduled_date: '2026-03-06',
    workout_type: 'rest',
    workout_id: null,
    target_tss: 0,
    target_duration: 0,
    target_distance_km: null,
    completed: false,
    completed_at: null,
    activity_id: null,
    actual_tss: null,
    actual_duration: null,
    actual_distance_km: null,
    difficulty_rating: null,
    notes: null,
    skipped_reason: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    workout: undefined,
  },
];

const mockProgress: PlanProgress = {
  currentWeek: 2,
  totalWeeks: 6,
  currentPhase: 'build',
  overallCompliance: 83,
  weeklyStats: [],
  daysRemaining: 28,
  nextWorkout: null,
};

// ============================================================
// CSV TESTS
// ============================================================

describe('generateCSV', () => {
  it('generates valid CSV with headers and data rows', () => {
    const csv = generateCSV(mockPlan, mockWorkouts, mockProgress);
    const lines = csv.split('\n');

    // Should have metadata lines
    expect(lines[0]).toContain('Sweet Spot Base');
    expect(lines[1]).toContain('sweet_spot');

    // Find column header line (first non-comment, non-empty line)
    const headerLine = lines.find(l => l.startsWith('Week,'));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain('Target Duration');
    expect(headerLine).toContain('Target TSS');
    expect(headerLine).toContain('Coach Notes');

    // Should have data rows
    const dataLines = lines.filter(l => !l.startsWith('#') && !l.startsWith('Week') && l.trim() !== '');
    expect(dataLines.length).toBe(3);
  });

  it('handles workouts with commas and quotes in fields', () => {
    const workoutsWithComma: PlannedWorkoutWithDetails[] = [{
      ...mockWorkouts[0],
      notes: 'Great workout, felt strong "today"',
    }];
    const csv = generateCSV(mockPlan, workoutsWithComma);
    expect(csv).toContain('"Great workout, felt strong ""today"""');
  });

  it('sorts workouts by week then day', () => {
    const unsorted = [mockWorkouts[2], mockWorkouts[0], mockWorkouts[1]];
    const csv = generateCSV(mockPlan, unsorted);
    const dataLines = csv.split('\n').filter(l => !l.startsWith('#') && !l.startsWith('Week') && l.trim() !== '');
    // First data line should be Monday (day 1), not Friday (day 5)
    expect(dataLines[0]).toContain('Monday');
    expect(dataLines[2]).toContain('Friday');
  });
});

// ============================================================
// ICAL TESTS
// ============================================================

describe('generateICal', () => {
  it('generates valid iCalendar format', () => {
    const ical = generateICal(mockPlan, mockWorkouts);

    expect(ical).toContain('BEGIN:VCALENDAR');
    expect(ical).toContain('END:VCALENDAR');
    expect(ical).toContain('VERSION:2.0');
    expect(ical).toContain('PRODID:-//Tribos Studio');
  });

  it('creates VEVENT for each workout with a date', () => {
    const ical = generateICal(mockPlan, mockWorkouts);

    const eventCount = (ical.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(3); // All 3 have scheduled_date
  });

  it('includes workout details in event summary', () => {
    const ical = generateICal(mockPlan, mockWorkouts);

    expect(ical).toContain('Sweet Spot Intervals');
    expect(ical).toContain('Wk1');
  });

  it('includes description with workout details', () => {
    const ical = generateICal(mockPlan, mockWorkouts);

    expect(ical).toContain('Target TSS: 85');
    expect(ical).toContain('sweet_spot');
  });

  it('uses DATE value type for all-day events', () => {
    const ical = generateICal(mockPlan, mockWorkouts);

    expect(ical).toContain('DTSTART;VALUE=DATE:20260302');
  });

  it('skips workouts without scheduled_date', () => {
    const workoutsNoDate: PlannedWorkoutWithDetails[] = [{
      ...mockWorkouts[0],
      scheduled_date: '',
    }];
    const ical = generateICal(mockPlan, workoutsNoDate);

    const eventCount = (ical.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(0);
  });
});

// ============================================================
// JSON TESTS
// ============================================================

describe('generatePlanJSON', () => {
  it('generates valid JSON', () => {
    const json = generatePlanJSON(mockPlan, mockWorkouts, mockProgress);
    const parsed = JSON.parse(json);

    expect(parsed.plan.name).toBe('Sweet Spot Base');
    expect(parsed.plan.durationWeeks).toBe(6);
    expect(parsed.workouts).toHaveLength(3);
    expect(parsed.source).toBe('Tribos Studio');
  });

  it('includes progress data when provided', () => {
    const json = generatePlanJSON(mockPlan, mockWorkouts, mockProgress);
    const parsed = JSON.parse(json);

    expect(parsed.progress).not.toBeNull();
    expect(parsed.progress.overallCompliance).toBe(83);
    expect(parsed.progress.currentPhase).toBe('build');
  });

  it('handles null progress', () => {
    const json = generatePlanJSON(mockPlan, mockWorkouts, null);
    const parsed = JSON.parse(json);

    expect(parsed.progress).toBeNull();
  });

  it('includes workout structure when available', () => {
    const json = generatePlanJSON(mockPlan, mockWorkouts, null);
    const parsed = JSON.parse(json);

    const firstWorkout = parsed.workouts[0];
    expect(firstWorkout.structure).not.toBeNull();
    expect(firstWorkout.structure.warmup).toBeDefined();
    expect(firstWorkout.coachNotes).toBe('Keep cadence at 85-95rpm');
  });
});

// ============================================================
// STRUCTURE CONVERTER TESTS
// ============================================================

describe('workoutStructureToCycling', () => {
  it('converts basic warmup/main/cooldown structure', () => {
    const result = workoutStructureToCycling(mockWorkoutDef.structure, 65);

    expect(result.totalDuration).toBe(65);
    expect(result.steps.length).toBe(7); // warmup + 5 main segments + cooldown
    expect(result.steps[0].type).toBe('warmup');
    expect(result.steps[result.steps.length - 1].type).toBe('cooldown');
  });

  it('converts durations from minutes to seconds', () => {
    const result = workoutStructureToCycling(mockWorkoutDef.structure, 65);

    // Warmup is 10 minutes = 600 seconds
    const warmup = result.steps[0] as { duration: number };
    expect(warmup.duration).toBe(600);
  });

  it('preserves power targets as percent_ftp', () => {
    const result = workoutStructureToCycling(mockWorkoutDef.structure, 65);

    const warmup = result.steps[0] as { power: { type: string; value: number } };
    expect(warmup.power.type).toBe('percent_ftp');
    expect(warmup.power.value).toBe(60);
  });

  it('converts repeat intervals to CyclingRepeatBlock', () => {
    const result = workoutStructureToCycling(mockWorkoutWithIntervals.structure, 60);

    // Should have warmup, repeat block, cooldown
    expect(result.steps.length).toBe(3);

    const repeatBlock = result.steps[1];
    expect(repeatBlock.type).toBe('repeat');
    expect((repeatBlock as { iterations: number }).iterations).toBe(5);
    expect((repeatBlock as { steps: unknown[] }).steps.length).toBe(2); // work + rest
  });
});

describe('getCyclingStructure', () => {
  it('returns cyclingStructure when present', () => {
    const workoutWithCycling = {
      ...mockWorkoutDef,
      cyclingStructure: {
        totalDuration: 65,
        steps: [{ name: 'test', type: 'work' as const, duration: 300, power: { type: 'percent_ftp' as const, value: 90 } }],
      },
    };

    const result = getCyclingStructure(workoutWithCycling);
    expect(result?.steps[0].name).toBe('test');
  });

  it('converts from basic structure when cyclingStructure is absent', () => {
    const result = getCyclingStructure(mockWorkoutDef);
    expect(result).not.toBeNull();
    expect(result!.steps.length).toBeGreaterThan(0);
  });
});

// ============================================================
// MAIN EXPORT FUNCTION TESTS
// ============================================================

describe('exportTrainingPlan', () => {
  it('exports as CSV with correct filename and mime type', () => {
    const result = exportTrainingPlan(mockPlan, mockWorkouts, { format: 'csv' });
    expect(result.filename).toBe('Sweet_Spot_Base_workouts.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(typeof result.content).toBe('string');
  });

  it('exports as iCal with correct filename and mime type', () => {
    const result = exportTrainingPlan(mockPlan, mockWorkouts, { format: 'ical' });
    expect(result.filename).toBe('Sweet_Spot_Base_workouts.ics');
    expect(result.mimeType).toBe('text/calendar');
  });

  it('exports as JSON with correct filename and mime type', () => {
    const result = exportTrainingPlan(mockPlan, mockWorkouts, { format: 'json' });
    expect(result.filename).toBe('Sweet_Spot_Base_workouts.json');
    expect(result.mimeType).toBe('application/json');
  });

  it('throws for unsupported format', () => {
    expect(() => {
      exportTrainingPlan(mockPlan, mockWorkouts, { format: 'pdf' as never });
    }).toThrow('Unsupported export format');
  });

  it('cleans special characters from filename', () => {
    const planWithSpecial = { ...mockPlan, name: 'My Plan: Test (2026)!' };
    const result = exportTrainingPlan(planWithSpecial, mockWorkouts, { format: 'csv' });
    expect(result.filename).toBe('My_Plan_Test_2026_workouts.csv');
  });
});

// ============================================================
// WORKOUT RESOLUTION TESTS (raw DB data without .workout)
// ============================================================

describe('workout resolution from library', () => {
  // These tests use workout_id='traditional_sst' which exists in the real workout library
  const rawDbWorkout: PlannedWorkoutWithDetails = {
    id: 'pw-raw',
    plan_id: 'plan-1',
    week_number: 1,
    day_of_week: 2,
    scheduled_date: '2026-03-03',
    workout_type: 'sweet_spot',
    workout_id: 'traditional_sst', // Real ID from workoutLibrary.ts
    target_tss: 85,
    target_duration: 65,
    target_distance_km: null,
    completed: false,
    completed_at: null,
    activity_id: null,
    actual_tss: null,
    actual_duration: null,
    actual_distance_km: null,
    difficulty_rating: null,
    notes: null,
    skipped_reason: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    // NOTE: no .workout property — simulates raw DB data from TrainingDashboard
  };

  it('CSV resolves workout name from library when .workout is missing', () => {
    const csv = generateCSV(mockPlan, [rawDbWorkout]);
    expect(csv).toContain('Traditional Sweet Spot');
  });

  it('iCal resolves workout details from library when .workout is missing', () => {
    const ical = generateICal(mockPlan, [rawDbWorkout]);
    expect(ical).toContain('Traditional Sweet Spot');
    expect(ical).toContain('sweet_spot');
  });

  it('JSON resolves workout structure from library when .workout is missing', () => {
    const json = generatePlanJSON(mockPlan, [rawDbWorkout]);
    const parsed = JSON.parse(json);
    const workout = parsed.workouts[0];
    expect(workout.name).toBe('Traditional Sweet Spot');
    expect(workout.structure).not.toBeNull();
    expect(workout.structure.warmup).toBeDefined();
  });

  it('falls back to workout_type when workout_id is not in library', () => {
    const unknownIdWorkout: PlannedWorkoutWithDetails = {
      ...rawDbWorkout,
      workout_id: 'nonexistent_workout_id',
    };
    const csv = generateCSV(mockPlan, [unknownIdWorkout]);
    // Should fall back to workout_type
    expect(csv).toContain('sweet_spot');
  });

  it('falls back to workout_type when workout_id is null', () => {
    const noIdWorkout: PlannedWorkoutWithDetails = {
      ...rawDbWorkout,
      workout_id: null,
    };
    const csv = generateCSV(mockPlan, [noIdWorkout]);
    expect(csv).toContain('sweet_spot');
  });
});
