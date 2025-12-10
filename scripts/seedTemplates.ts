/**
 * Seed Training Plan and Workout Templates to Database
 *
 * This script populates the Supabase database with templates from the TypeScript files.
 * Run with: npx tsx scripts/seedTemplates.ts
 *
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set
 * - Migration 011_training_plan_templates.sql must be applied
 */

import { createClient } from '@supabase/supabase-js';
import { TRAINING_PLAN_TEMPLATES, getAllPlans } from '../src/data/trainingPlanTemplates';
import { WORKOUT_LIBRARY } from '../src/data/workoutLibrary';

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  console.log('Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/seedTemplates.ts');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seedWorkoutTemplates() {
  console.log('\n📦 Seeding workout templates...');

  const workouts = Object.values(WORKOUT_LIBRARY);
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const workout of workouts) {
    try {
      const record = {
        workout_id: workout.id,
        name: workout.name,
        description: workout.description,
        category: workout.category,
        difficulty: workout.difficulty,
        duration_minutes: workout.duration,
        target_tss: workout.targetTSS,
        intensity_factor: workout.intensityFactor,
        focus_area: workout.focusArea,
        tags: workout.tags,
        terrain_type: workout.terrainType,
        structure: workout.structure,
        coach_notes: workout.coachNotes,
        is_active: true,
      };

      // Upsert (insert or update if exists)
      const { error } = await supabase
        .from('workout_templates')
        .upsert(record, { onConflict: 'workout_id' });

      if (error) {
        console.error(`  ❌ Error seeding workout ${workout.id}:`, error.message);
        errors++;
      } else {
        inserted++;
      }
    } catch (err: any) {
      console.error(`  ❌ Exception seeding workout ${workout.id}:`, err.message);
      errors++;
    }
  }

  console.log(`  ✅ Workouts: ${inserted} inserted/updated, ${errors} errors`);
  return { inserted, errors };
}

async function seedPlanTemplates() {
  console.log('\n📋 Seeding training plan templates...');

  const plans = getAllPlans();
  let inserted = 0;
  let errors = 0;

  for (const plan of plans) {
    try {
      const record = {
        template_id: plan.id,
        name: plan.name,
        description: plan.description,
        duration_weeks: plan.duration,
        methodology: plan.methodology,
        goal: plan.goal,
        fitness_level: plan.fitnessLevel,
        hours_per_week_min: plan.hoursPerWeek.min,
        hours_per_week_max: plan.hoursPerWeek.max,
        weekly_tss_min: plan.weeklyTSS.min,
        weekly_tss_max: plan.weeklyTSS.max,
        phases: plan.phases,
        week_templates: plan.weekTemplates,
        expected_gains: plan.expectedGains,
        target_audience: plan.targetAudience,
        is_active: true,
        is_featured: ['polarized_8_week', 'sweet_spot_12_week', 'beginner_6_week'].includes(plan.id),
        display_order: plans.indexOf(plan),
      };

      // Upsert (insert or update if exists)
      const { error } = await supabase
        .from('training_plan_templates')
        .upsert(record, { onConflict: 'template_id' });

      if (error) {
        console.error(`  ❌ Error seeding plan ${plan.id}:`, error.message);
        errors++;
      } else {
        inserted++;
      }
    } catch (err: any) {
      console.error(`  ❌ Exception seeding plan ${plan.id}:`, err.message);
      errors++;
    }
  }

  console.log(`  ✅ Plans: ${inserted} inserted/updated, ${errors} errors`);
  return { inserted, errors };
}

async function verifyData() {
  console.log('\n🔍 Verifying seeded data...');

  const { count: workoutCount } = await supabase
    .from('workout_templates')
    .select('*', { count: 'exact', head: true });

  const { count: planCount } = await supabase
    .from('training_plan_templates')
    .select('*', { count: 'exact', head: true });

  console.log(`  📊 Workout templates in database: ${workoutCount}`);
  console.log(`  📊 Plan templates in database: ${planCount}`);

  return { workoutCount, planCount };
}

async function main() {
  console.log('🚀 Starting template seeding process...');
  console.log(`   URL: ${SUPABASE_URL}`);

  try {
    // Seed workouts first (plans reference them)
    const workoutResult = await seedWorkoutTemplates();

    // Seed plans
    const planResult = await seedPlanTemplates();

    // Verify
    const counts = await verifyData();

    console.log('\n✨ Seeding complete!');
    console.log(`   Workouts: ${workoutResult.inserted} (${workoutResult.errors} errors)`);
    console.log(`   Plans: ${planResult.inserted} (${planResult.errors} errors)`);

    if (workoutResult.errors > 0 || planResult.errors > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('\n❌ Fatal error during seeding:', err.message);
    process.exit(1);
  }
}

main();
