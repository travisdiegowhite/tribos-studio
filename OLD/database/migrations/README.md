# Database Migrations

This directory contains SQL migration files for the Tribos Cycling AI app.

## How to Run Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the contents of the migration file
5. Click "Run" to execute the migration

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref toihfeffpljsmgritmuy

# Run migrations
supabase db push
```

## Migration Order

Run these migrations in the following order:

1. **create_bike_computer_integrations.sql** - Creates tables for Garmin/Wahoo integrations
2. **fix_bike_computer_integrations.sql** - Updates column names (only if table already existed)
3. **fix_sync_history.sql** - Additional sync history fixes

## Required Migrations for Garmin/Wahoo Integration

To enable Garmin and Wahoo integrations, you **must** run:
- `create_bike_computer_integrations.sql`

This creates:
- `bike_computer_integrations` table - Stores OAuth tokens and connection info
- `bike_computer_sync_history` table - Tracks sync operations
- Adds `garmin_id`, `wahoo_id` columns to `routes` table
- Sets up Row Level Security (RLS) policies

## Current Status

If you're seeing 406 errors from Supabase for bike_computer_integrations, it means the table doesn't exist yet. Run `create_bike_computer_integrations.sql` to fix this.

## Verifying Migrations

After running migrations, verify they were successful:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('bike_computer_integrations', 'bike_computer_sync_history');

-- Check table structure
\d bike_computer_integrations
\d bike_computer_sync_history

-- Check RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('bike_computer_integrations', 'bike_computer_sync_history');
```
