# RLS Security Issues - Fix Summary

## Overview
This document explains the Supabase security linter issues and how they are resolved.

## Security Issues Detected

### 1. Policy Exists but RLS Disabled (ERROR)
**Table:** `bike_computer_integrations`
**Issue:** RLS policies are defined but RLS is not enabled on the table
**Risk:** High - data can be accessed without policy enforcement

**Policies affected:**
- Users can delete their own bike computer integrations
- Users can insert their own bike computer integrations
- Users can update their own bike computer integrations
- Users can view their own bike computer integrations
- Users manage own integrations

### 2. Security Definer View (ERROR)
**View:** `user_activity_summary`
**Issue:** View uses SECURITY DEFINER instead of SECURITY INVOKER
**Risk:** Medium - view enforces RLS of view creator, not querying user

### 3. RLS Disabled in Public Schema (ERROR)
**Table:** `spatial_ref_sys`
**Issue:** PostGIS system table without RLS enabled
**Risk:** Low - contains only coordinate reference system data (no user data)

**Table:** `bike_computer_integrations` (duplicate of #1)

## Fixes Applied

### Migration: `022_fix_rls_security_issues.sql`

#### Fix 1: Enable RLS on bike_computer_integrations
```sql
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;
```

**Impact:**
- Existing RLS policies will now be enforced
- Users can only access their own integration records
- Service role continues to have full access (bypasses RLS)

#### Fix 2: Convert user_activity_summary to security_invoker
```sql
CREATE OR REPLACE VIEW user_activity_summary
WITH (security_invoker = true)
AS ...
```

**Impact:**
- View now enforces RLS policies of the querying user
- More secure: prevents privilege escalation
- Users can only see their own activity summary

#### Fix 3: Handle spatial_ref_sys
```sql
-- Attempts to enable RLS with error handling
-- May require superuser permissions
ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY;
```

**Impact:**
- If successful: eliminates the warning
- If fails: documented as low-risk (contains no user data)
- PostGIS system table with public coordinate reference data

## How to Apply

### Option 1: Run the Migration Directly
```bash
# Using Supabase CLI
supabase db reset  # Runs all migrations including the new one

# Or apply just this migration
psql -h <your-db-host> -U postgres -d postgres -f database/migrations/022_fix_rls_security_issues.sql
```

### Option 2: Via Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of `database/migrations/022_fix_rls_security_issues.sql`
3. Paste and execute

### Option 3: Using Migration Script
```bash
npm run db:migrate  # If you have a migration script configured
```

## Verification

After applying the migration, verify the fixes:

### Check RLS is enabled
```sql
SELECT tablename, rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('bike_computer_integrations', 'spatial_ref_sys');
```

Expected result:
- `bike_computer_integrations`: `rls_enabled = true`
- `spatial_ref_sys`: `rls_enabled = true` (if permissions allow)

### Check view security mode
```sql
SELECT
    viewname,
    CASE
        WHEN definition LIKE '%security_invoker%' THEN 'security_invoker'
        ELSE 'security_definer'
    END as security_mode
FROM pg_views
WHERE viewname = 'user_activity_summary';
```

Expected result: `security_invoker`

### Run Supabase Linter Again
In the Supabase Dashboard:
1. Go to Database → Linter
2. Run the linter
3. Verify the 4 errors are resolved

## Expected Outcome

After applying this migration:
- ✅ `bike_computer_integrations` RLS enabled with existing policies enforced
- ✅ `user_activity_summary` uses security_invoker for proper RLS enforcement
- ✅ `spatial_ref_sys` RLS enabled (or documented as low-risk if permissions insufficient)
- ✅ All 4 security linter errors resolved

## Security Best Practices

Going forward:
1. **Always enable RLS** when creating tables with policies
2. **Use security_invoker** for views (default in PostgreSQL 15+)
3. **Test RLS policies** thoroughly before deployment
4. **Run Supabase linter** regularly to catch issues early

## Rollback (if needed)

If you need to rollback these changes:

```sql
-- Disable RLS (NOT RECOMMENDED)
ALTER TABLE bike_computer_integrations DISABLE ROW LEVEL SECURITY;

-- Revert view to original
DROP VIEW user_activity_summary;
-- Then recreate original view from 021_user_activity_tracking.sql
```

**Note:** Rollback is not recommended as it removes security protections.
