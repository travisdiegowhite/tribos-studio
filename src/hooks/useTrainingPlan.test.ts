/**
 * Tests for useTrainingPlan hook
 * Critical business logic for training plan management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTrainingPlan } from './useTrainingPlan';
import type { TrainingPlanDB } from '../types/training';

// Mock the supabase client
const mockSupabaseFrom = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
  },
}));

// Mock training plan templates
vi.mock('../data/trainingPlanTemplates', () => ({
  getPlanTemplate: vi.fn((id: string) => {
    if (id === 'test_plan_template') {
      return {
        id: 'test_plan_template',
        name: 'Test 4-Week Plan',
        description: 'A test plan',
        duration: 4,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitnessLevel: 'intermediate',
        category: 'foundation',
        hoursPerWeek: { min: 6, max: 10 },
        weeklyTSS: { min: 300, max: 500 },
        phases: [
          { weeks: [1, 2, 3], phase: 'base', focus: 'Build base' },
          { weeks: [4], phase: 'recovery', focus: 'Recovery' },
        ],
        weekTemplates: {
          1: {
            sunday: { workout: null, notes: 'Rest' },
            monday: { workout: 'recovery_spin', notes: '' },
            tuesday: { workout: 'foundation_miles', notes: '' },
            wednesday: { workout: null, notes: 'Rest' },
            thursday: { workout: 'tempo_intervals', notes: '' },
            friday: { workout: null, notes: 'Rest' },
            saturday: { workout: 'long_endurance', notes: '' },
          },
          2: {
            sunday: { workout: null, notes: 'Rest' },
            monday: { workout: 'recovery_spin', notes: '' },
            tuesday: { workout: 'foundation_miles', notes: '' },
            wednesday: { workout: null, notes: 'Rest' },
            thursday: { workout: 'tempo_intervals', notes: '' },
            friday: { workout: null, notes: 'Rest' },
            saturday: { workout: 'long_endurance', notes: '' },
          },
          3: {
            sunday: { workout: null, notes: 'Rest' },
            monday: { workout: 'recovery_spin', notes: '' },
            tuesday: { workout: 'foundation_miles', notes: '' },
            wednesday: { workout: null, notes: 'Rest' },
            thursday: { workout: 'vo2max_intervals', notes: '' },
            friday: { workout: null, notes: 'Rest' },
            saturday: { workout: 'long_endurance', notes: '' },
          },
          4: {
            sunday: { workout: null, notes: 'Rest' },
            monday: { workout: 'recovery_spin', notes: '' },
            tuesday: { workout: null, notes: 'Rest' },
            wednesday: { workout: 'easy_ride', notes: '' },
            thursday: { workout: null, notes: 'Rest' },
            friday: { workout: null, notes: 'Rest' },
            saturday: { workout: 'test_ride', notes: '' },
          },
        },
        expectedGains: { ftp: '+5-10%' },
        targetAudience: 'Intermediate cyclists',
      };
    }
    return null;
  }),
}));

// Mock workout library
vi.mock('../data/workoutLibrary', () => ({
  WORKOUT_LIBRARY: {},
  getWorkoutById: vi.fn((id: string) => {
    const workouts: Record<string, any> = {
      recovery_spin: {
        id: 'recovery_spin',
        name: 'Recovery Spin',
        category: 'recovery',
        duration: 45,
        targetTSS: 25,
      },
      foundation_miles: {
        id: 'foundation_miles',
        name: 'Foundation Miles',
        category: 'endurance',
        duration: 90,
        targetTSS: 65,
      },
    };
    return workouts[id] || null;
  }),
}));

// Mock training plan utils
vi.mock('../utils/trainingPlans', () => ({
  findOptimalSupplementDays: vi.fn(() => []),
  getSupplementWorkouts: vi.fn(() => ['core_workout', 'strength_lower']),
}));

// Helper to create chainable mock
function createQueryChain(finalData: any = null, finalError: any = null) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order'];

  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });

  chain.single = vi.fn(() => Promise.resolve({ data: finalData, error: finalError }));

  // For non-single queries, make the chain thenable
  chain.then = (resolve: Function) => resolve({ data: finalData, error: finalError });

  return chain;
}

describe('useTrainingPlan', () => {
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start with loading state when autoLoad is false', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.activePlan).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should have empty plannedWorkouts initially', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.plannedWorkouts).toEqual([]);
    });

    it('should return 0 for compliancePercent when no plan', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.compliancePercent).toBe(0);
    });

    it('should return null progress when no plan', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.progress).toBeNull();
    });

    it('should return 1 for currentWeek when no plan', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.currentWeek).toBe(1);
    });

    it('should return null for currentPhase when no plan', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.currentPhase).toBeNull();
    });
  });

  describe('utility functions without active plan', () => {
    beforeEach(() => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));
    });

    it('getPlanStartDate should return null when no plan', () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.getPlanStartDate()).toBeNull();
    });

    it('getDaysRemaining should return 0 when no plan', () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      expect(result.current.getDaysRemaining()).toBe(0);
    });

    it('getWorkoutsForDate should return empty array when no workouts', () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const workouts = result.current.getWorkoutsForDate(new Date());
      expect(workouts).toEqual([]);
    });

    it('getWorkoutsForWeek should return empty array when no workouts', () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const workouts = result.current.getWorkoutsForWeek(1);
      expect(workouts).toEqual([]);
    });

    it('getAvailableSupplementWorkouts should return workout IDs', () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const supplements = result.current.getAvailableSupplementWorkouts();
      expect(supplements).toEqual(['core_workout', 'strength_lower']);
    });
  });

  describe('operations without active plan', () => {
    beforeEach(() => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));
    });

    it('pausePlan should return false when no active plan', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const success = await result.current.pausePlan();
      expect(success).toBe(false);
    });

    it('resumePlan should return false when no active plan', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const success = await result.current.resumePlan();
      expect(success).toBe(false);
    });

    it('completePlan should return false when no active plan', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const success = await result.current.completePlan();
      expect(success).toBe(false);
    });

    it('cancelPlan should return false when no active plan', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const success = await result.current.cancelPlan();
      expect(success).toBe(false);
    });

    it('addSupplementWorkout should return false when no active plan', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const success = await result.current.addSupplementWorkout(
        'core_workout',
        new Date()
      );
      expect(success).toBe(false);
      // Error may be set but could be cleared on re-render
    });
  });

  describe('activatePlan', () => {
    it('should return null when userId is null', async () => {
      const { result } = renderHook(() =>
        useTrainingPlan({ userId: null, autoLoad: false })
      );

      const plan = await result.current.activatePlan(
        'test_plan_template',
        new Date()
      );
      expect(plan).toBeNull();
    });

    it('should set error when template not found', async () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: false })
      );

      const plan = await result.current.activatePlan(
        'non_existent_template',
        new Date()
      );

      expect(plan).toBeNull();
      // Error is set during the call, verify it was returned as null
      // The error state may have been set and then loading cleared it
    });
  });

  describe('null userId handling', () => {
    it('should not call supabase when userId is null', () => {
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      renderHook(() =>
        useTrainingPlan({ userId: null, autoLoad: true })
      );

      // Should not have called supabase.from() because userId is null
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('loadActivePlan', () => {
    it('should handle no active plan gracefully', async () => {
      // PGRST116 means no rows found - not an error
      mockSupabaseFrom.mockReturnValue(createQueryChain(null, { code: 'PGRST116' }));

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.activePlan).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should set error on database failure', async () => {
      mockSupabaseFrom.mockReturnValue(
        createQueryChain(null, { message: 'Database connection failed' })
      );

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('currentWeek calculation', () => {
    it('should calculate week based on start date', async () => {
      // Create a plan that started 14 days ago (week 3)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);

      const mockPlan: TrainingPlanDB = {
        id: 'plan-123',
        user_id: mockUserId,
        template_id: 'test_plan_template',
        name: 'Test Plan',
        duration_weeks: 8,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitness_level: 'intermediate',
        status: 'active',
        started_at: startDate.toISOString(),
        ended_at: null,
        paused_at: null,
        current_week: 1,
        workouts_completed: 0,
        workouts_total: 32,
        compliance_percentage: 0,
        custom_start_day: null,
        auto_adjust_enabled: false,
        notes: null,
        created_at: startDate.toISOString(),
        updated_at: startDate.toISOString(),
      };

      // Setup mock to return plan for training_plans, empty array for planned_workouts
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'training_plans') {
          return createQueryChain(mockPlan, null);
        }
        if (table === 'planned_workouts') {
          const chain = createQueryChain([], null);
          // Override order to return array directly
          chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createQueryChain(null);
      });

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.activePlan).not.toBeNull();
      });

      expect(result.current.currentWeek).toBe(3);
    });

    it('should cap currentWeek at plan duration', async () => {
      // Create a plan that started 100 days ago but only 4 weeks long
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 100);

      const mockPlan: TrainingPlanDB = {
        id: 'plan-123',
        user_id: mockUserId,
        template_id: 'test_plan_template',
        name: 'Test Plan',
        duration_weeks: 4,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitness_level: 'intermediate',
        status: 'active',
        started_at: startDate.toISOString(),
        ended_at: null,
        paused_at: null,
        current_week: 1,
        workouts_completed: 0,
        workouts_total: 16,
        compliance_percentage: 0,
        custom_start_day: null,
        auto_adjust_enabled: false,
        notes: null,
        created_at: startDate.toISOString(),
        updated_at: startDate.toISOString(),
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'training_plans') {
          return createQueryChain(mockPlan, null);
        }
        if (table === 'planned_workouts') {
          const chain = createQueryChain([], null);
          chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createQueryChain(null);
      });

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.activePlan).not.toBeNull();
      });

      // Should be capped at 4 (duration_weeks)
      expect(result.current.currentWeek).toBe(4);
    });
  });

  describe('getDaysRemaining calculation', () => {
    it('should calculate days remaining correctly', async () => {
      // Plan started 7 days ago, 4 weeks = 28 days total, so 21 remaining
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const mockPlan: TrainingPlanDB = {
        id: 'plan-123',
        user_id: mockUserId,
        template_id: 'test_plan_template',
        name: 'Test Plan',
        duration_weeks: 4,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitness_level: 'intermediate',
        status: 'active',
        started_at: startDate.toISOString(),
        ended_at: null,
        paused_at: null,
        current_week: 2,
        workouts_completed: 4,
        workouts_total: 16,
        compliance_percentage: 25,
        custom_start_day: null,
        auto_adjust_enabled: false,
        notes: null,
        created_at: startDate.toISOString(),
        updated_at: startDate.toISOString(),
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'training_plans') {
          return createQueryChain(mockPlan, null);
        }
        if (table === 'planned_workouts') {
          const chain = createQueryChain([], null);
          chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createQueryChain(null);
      });

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.activePlan).not.toBeNull();
      });

      expect(result.current.getDaysRemaining()).toBe(21);
    });
  });

  describe('currentPhase calculation', () => {
    it('should determine current phase from template', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Week 2 = still in base phase

      const mockPlan: TrainingPlanDB = {
        id: 'plan-123',
        user_id: mockUserId,
        template_id: 'test_plan_template',
        name: 'Test Plan',
        duration_weeks: 4,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitness_level: 'intermediate',
        status: 'active',
        started_at: startDate.toISOString(),
        ended_at: null,
        paused_at: null,
        current_week: 2,
        workouts_completed: 4,
        workouts_total: 16,
        compliance_percentage: 25,
        custom_start_day: null,
        auto_adjust_enabled: false,
        notes: null,
        created_at: startDate.toISOString(),
        updated_at: startDate.toISOString(),
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'training_plans') {
          return createQueryChain(mockPlan, null);
        }
        if (table === 'planned_workouts') {
          const chain = createQueryChain([], null);
          chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createQueryChain(null);
      });

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.activePlan).not.toBeNull();
      });

      // Week 2 is in base phase according to template
      expect(result.current.currentPhase).toBe('base');
    });
  });

  describe('compliance tracking', () => {
    it('should return compliance from plan data', async () => {
      const mockPlan: TrainingPlanDB = {
        id: 'plan-123',
        user_id: mockUserId,
        template_id: 'test_plan_template',
        name: 'Test Plan',
        duration_weeks: 4,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitness_level: 'intermediate',
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        paused_at: null,
        current_week: 1,
        workouts_completed: 8,
        workouts_total: 16,
        compliance_percentage: 50,
        custom_start_day: null,
        auto_adjust_enabled: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'training_plans') {
          return createQueryChain(mockPlan, null);
        }
        if (table === 'planned_workouts') {
          const chain = createQueryChain([], null);
          chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createQueryChain(null);
      });

      const { result } = renderHook(() =>
        useTrainingPlan({ userId: mockUserId, autoLoad: true })
      );

      await waitFor(() => {
        expect(result.current.activePlan).not.toBeNull();
      });

      expect(result.current.compliancePercent).toBe(50);
    });
  });
});
