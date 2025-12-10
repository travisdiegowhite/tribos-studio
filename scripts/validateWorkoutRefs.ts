/**
 * Script to validate all workout references in training plan templates
 * Run with: npx ts-node scripts/validateWorkoutRefs.ts
 */

import { getAllWorkoutIdsFromTemplates } from '../src/data/trainingPlanTemplates';
import { getAllWorkoutIds, workoutExists } from '../src/data/workoutLibrary';

function validateWorkoutReferences() {
  console.log('Validating workout references...\n');

  const templateWorkoutIds = getAllWorkoutIdsFromTemplates();
  const libraryWorkoutIds = new Set(getAllWorkoutIds());

  const missingWorkouts: string[] = [];
  const validWorkouts: string[] = [];

  for (const workoutId of templateWorkoutIds) {
    if (workoutExists(workoutId)) {
      validWorkouts.push(workoutId);
    } else {
      missingWorkouts.push(workoutId);
    }
  }

  console.log(`Total unique workout IDs in templates: ${templateWorkoutIds.size}`);
  console.log(`Total workouts in library: ${libraryWorkoutIds.size}`);
  console.log(`Valid references: ${validWorkouts.length}`);
  console.log(`Missing references: ${missingWorkouts.length}\n`);

  if (missingWorkouts.length > 0) {
    console.log('MISSING WORKOUTS (referenced in templates but not in library):');
    missingWorkouts.forEach(id => console.log(`  - ${id}`));
    console.log('\nThese workouts need to be added to workoutLibrary.ts');
    process.exit(1);
  } else {
    console.log('All workout references are valid!');
    process.exit(0);
  }
}

validateWorkoutReferences();
