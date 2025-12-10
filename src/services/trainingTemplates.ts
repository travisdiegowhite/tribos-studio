/**
 * Training Templates Service
 * Loads training plan and workout templates from database with fallback to JS files
 */

import { supabase } from '../lib/supabase';
import {
  TRAINING_PLAN_TEMPLATES,
  getAllPlans as getAllLocalPlans,
  getPlanTemplate as getLocalPlanTemplate,
} from '../data/trainingPlanTemplates';
import {
  WORKOUT_LIBRARY,
  getWorkoutById as getLocalWorkoutById,
} from '../data/workoutLibrary';
import type { TrainingPlanTemplate, WorkoutDefinition } from '../types/training';

// Cache for database templates
let cachedPlanTemplates: TrainingPlanTemplate[] | null = null;
let cachedWorkoutTemplates: Map<string, WorkoutDefinition> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if cache is still valid
 */
function isCacheValid(): boolean {
  return Date.now() - cacheTimestamp < CACHE_TTL;
}

/**
 * Clear the template cache
 */
export function clearTemplateCache(): void {
  cachedPlanTemplates = null;
  cachedWorkoutTemplates = null;
  cacheTimestamp = 0;
}

/**
 * Convert database record to TrainingPlanTemplate type
 */
function dbRecordToPlanTemplate(record: any): TrainingPlanTemplate {
  return {
    id: record.template_id,
    name: record.name,
    description: record.description || '',
    duration: record.duration_weeks,
    methodology: record.methodology,
    goal: record.goal,
    fitnessLevel: record.fitness_level,
    hoursPerWeek: {
      min: record.hours_per_week_min || 3,
      max: record.hours_per_week_max || 10,
    },
    weeklyTSS: {
      min: record.weekly_tss_min || 150,
      max: record.weekly_tss_max || 500,
    },
    phases: record.phases || [],
    weekTemplates: record.week_templates || {},
    expectedGains: record.expected_gains || {},
    targetAudience: record.target_audience || '',
  };
}

/**
 * Convert database record to WorkoutDefinition type
 */
function dbRecordToWorkout(record: any): WorkoutDefinition {
  return {
    id: record.workout_id,
    name: record.name,
    category: record.category,
    difficulty: record.difficulty,
    duration: record.duration_minutes,
    targetTSS: record.target_tss,
    intensityFactor: record.intensity_factor,
    description: record.description || '',
    focusArea: record.focus_area || '',
    tags: record.tags || [],
    terrainType: record.terrain_type || 'flat',
    structure: record.structure || { warmup: null, main: [], cooldown: null },
    coachNotes: record.coach_notes || '',
  };
}

/**
 * Load all training plan templates
 * First tries database, falls back to local JS files
 */
export async function getAllPlanTemplates(): Promise<TrainingPlanTemplate[]> {
  // Return cached if valid
  if (cachedPlanTemplates && isCacheValid()) {
    return cachedPlanTemplates;
  }

  try {
    const { data, error } = await supabase
      .from('training_plan_templates')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      cachedPlanTemplates = data.map(dbRecordToPlanTemplate);
      cacheTimestamp = Date.now();
      return cachedPlanTemplates;
    }
  } catch (err) {
    console.warn('Failed to load templates from database, using local files:', err);
  }

  // Fallback to local JS files
  return getAllLocalPlans();
}

/**
 * Get a specific plan template by ID
 */
export async function getPlanTemplate(templateId: string): Promise<TrainingPlanTemplate | undefined> {
  // Try cache first
  if (cachedPlanTemplates && isCacheValid()) {
    return cachedPlanTemplates.find((p) => p.id === templateId);
  }

  try {
    const { data, error } = await supabase
      .from('training_plan_templates')
      .select('*')
      .eq('template_id', templateId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    if (data) {
      return dbRecordToPlanTemplate(data);
    }
  } catch (err) {
    console.warn(`Failed to load template ${templateId} from database:`, err);
  }

  // Fallback to local
  return getLocalPlanTemplate(templateId);
}

/**
 * Get featured plan templates
 */
export async function getFeaturedPlans(): Promise<TrainingPlanTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('training_plan_templates')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    if (data && data.length > 0) {
      return data.map(dbRecordToPlanTemplate);
    }
  } catch (err) {
    console.warn('Failed to load featured templates:', err);
  }

  // Fallback: return first 3 plans
  const all = await getAllPlanTemplates();
  return all.slice(0, 3);
}

/**
 * Load all workout templates
 */
export async function getAllWorkoutTemplates(): Promise<Map<string, WorkoutDefinition>> {
  // Return cached if valid
  if (cachedWorkoutTemplates && isCacheValid()) {
    return cachedWorkoutTemplates;
  }

  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    if (data && data.length > 0) {
      cachedWorkoutTemplates = new Map();
      data.forEach((record) => {
        const workout = dbRecordToWorkout(record);
        cachedWorkoutTemplates!.set(workout.id, workout);
      });
      cacheTimestamp = Date.now();
      return cachedWorkoutTemplates;
    }
  } catch (err) {
    console.warn('Failed to load workouts from database:', err);
  }

  // Fallback to local
  const localMap = new Map<string, WorkoutDefinition>();
  Object.entries(WORKOUT_LIBRARY).forEach(([id, workout]) => {
    localMap.set(id, workout as WorkoutDefinition);
  });
  return localMap;
}

/**
 * Get a specific workout by ID
 */
export async function getWorkout(workoutId: string): Promise<WorkoutDefinition | null> {
  // Try cache first
  if (cachedWorkoutTemplates && isCacheValid()) {
    return cachedWorkoutTemplates.get(workoutId) || null;
  }

  try {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .eq('workout_id', workoutId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    if (data) {
      return dbRecordToWorkout(data);
    }
  } catch (err) {
    // Silently fall back to local
  }

  // Fallback to local
  return getLocalWorkoutById(workoutId);
}

/**
 * Filter plan templates
 */
export async function filterPlanTemplates(filters: {
  fitnessLevel?: string;
  goal?: string;
  methodology?: string;
  minDuration?: number;
  maxDuration?: number;
}): Promise<TrainingPlanTemplate[]> {
  const all = await getAllPlanTemplates();

  return all.filter((plan) => {
    if (filters.fitnessLevel && plan.fitnessLevel !== filters.fitnessLevel) return false;
    if (filters.goal && plan.goal !== filters.goal) return false;
    if (filters.methodology && plan.methodology !== filters.methodology) return false;
    if (filters.minDuration && plan.duration < filters.minDuration) return false;
    if (filters.maxDuration && plan.duration > filters.maxDuration) return false;
    return true;
  });
}

/**
 * Admin: Create or update a plan template (requires service role)
 */
export async function upsertPlanTemplate(
  template: TrainingPlanTemplate,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const record = {
      template_id: template.id,
      name: template.name,
      description: template.description,
      duration_weeks: template.duration,
      methodology: template.methodology,
      goal: template.goal,
      fitness_level: template.fitnessLevel,
      hours_per_week_min: template.hoursPerWeek.min,
      hours_per_week_max: template.hoursPerWeek.max,
      weekly_tss_min: template.weeklyTSS.min,
      weekly_tss_max: template.weeklyTSS.max,
      phases: template.phases,
      week_templates: template.weekTemplates,
      expected_gains: template.expectedGains,
      target_audience: template.targetAudience,
      is_active: true,
      updated_by: userId,
    };

    const { error } = await supabase
      .from('training_plan_templates')
      .upsert(record, { onConflict: 'template_id' });

    if (error) throw error;

    // Clear cache to pick up changes
    clearTemplateCache();

    return { success: true };
  } catch (err: any) {
    console.error('Failed to upsert plan template:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Admin: Delete a plan template
 */
export async function deletePlanTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('training_plan_templates')
      .update({ is_active: false })
      .eq('template_id', templateId);

    if (error) throw error;

    clearTemplateCache();
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete plan template:', err);
    return { success: false, error: err.message };
  }
}
