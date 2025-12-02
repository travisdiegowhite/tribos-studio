# Coach Platform Migration Instructions

## Quick Start

To enable coach features, run the database migration:

### Option 1: Supabase Dashboard (Recommended)

1. Open the Supabase SQL Editor:
   https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/sql

2. Create a new query

3. Copy the entire contents of `database/migrations/001_coach_platform.sql`

4. Paste into the editor and click **Run**

5. You should see success messages confirming:
   - New columns added to `user_profiles`
   - New tables created (`coach_athlete_relationships`, `coach_messages`)
   - New columns added to `planned_workouts`
   - RLS policies enabled
   - Helper functions created

### Option 2: Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Link your project
supabase link --project-ref toihfeffpljsmgritmuy

# Run migration
supabase db push
```

## What This Migration Does

### 1. Extends `user_profiles` table
- Adds `account_type` ('athlete' or 'coach')
- Adds coach-specific fields: bio, certifications, specialties, pricing
- Sets all existing users to 'athlete' type

### 2. Creates `coach_athlete_relationships` table
- Manages coach-athlete connections
- Handles invitation flow (pending → active)
- Stores permission settings (can view rides, health metrics, etc.)

### 3. Extends `planned_workouts` table
- Adds `assigned_by_coach_id` to track coach assignments
- Adds `coach_notes` for workout instructions
- Adds `athlete_id` for direct athlete assignment

### 4. Creates `coach_messages` table
- Simple messaging between coaches and athletes
- Can be linked to specific workouts
- Tracks read status

### 5. Row Level Security (RLS)
- Coaches can only see their athletes
- Athletes can only see their coaches
- Proper data access controls

### 6. Helper Functions
- `get_athlete_summary(coach_id, athlete_id)` - Returns comprehensive athlete data
- Auto-updating timestamps for relationship changes

## Verification

After running the migration, verify success:

```sql
-- Check user_profiles has new columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name IN ('account_type', 'coach_bio');

-- Check new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('coach_athlete_relationships', 'coach_messages');

-- Check RLS policies
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('coach_athlete_relationships', 'coach_messages');
```

## Rollback (if needed)

If you need to undo this migration:

```sql
-- Remove columns from user_profiles
ALTER TABLE user_profiles DROP COLUMN IF EXISTS account_type;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS coach_bio;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS coach_certifications;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS coach_specialties;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS coach_pricing;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS coach_availability;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS max_athletes;

-- Remove columns from planned_workouts
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS assigned_by_coach_id;
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS coach_notes;
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS athlete_id;

-- Drop new tables
DROP TABLE IF EXISTS coach_messages;
DROP TABLE IF EXISTS coach_athlete_relationships;

-- Drop functions
DROP FUNCTION IF EXISTS get_athlete_summary(UUID, UUID);
DROP FUNCTION IF EXISTS update_relationship_status();
```

## Next Steps

After the migration completes:

1. ✅ Database schema ready
2. → Install coach service layer (`src/services/coachService.js`)
3. → Create coach UI components
4. → Add routing for coach pages
5. → Test with coach account creation

---

**Need Help?**
- Check Supabase logs for any errors
- Verify your database connection
- Ensure you have proper permissions
