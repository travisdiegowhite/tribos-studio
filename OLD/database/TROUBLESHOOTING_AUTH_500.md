# Troubleshooting Auth 500 Error: "Database error querying schema"

You're getting a 500 error when trying to sign in with the demo account. This is a **Supabase server-side issue**, not a client-side code issue.

## Error Details
- **Error:** `AuthApiError: Database error querying schema`
- **Status:** 500 (Internal Server Error)
- **Endpoint:** `POST /auth/v1/token?grant_type=password`

## Root Cause
Supabase Auth is trying to access database tables/schemas that either:
1. Don't exist
2. Have incorrect permissions
3. Have corrupt data
4. Have foreign key constraints that are violated

## Solution Steps (in order of likelihood)

### Step 1: Check Supabase Dashboard Logs (MOST IMPORTANT)
This will show you the actual SQL error:

1. Go to Supabase Dashboard
2. Click **Logs** in the left sidebar
3. Select **Postgres Logs**
4. Try demo login again
5. **Look for ERROR messages** that appear in the logs
6. The error will show the exact table/column causing the issue

**Common errors you might see:**
- `relation "auth.identities" does not exist`
- `foreign key constraint failed`
- `column "..." does not exist`

### Step 2: Check Auth Schema Integrity

Run this in Supabase SQL Editor:

```sql
-- Check if auth schema exists and has required tables
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'auth'
ORDER BY table_name;
```

**Expected tables:**
- `auth.users`
- `auth.identities`
- `auth.sessions`
- `auth.refresh_tokens`
- `auth.audit_log_entries`
- `auth.flow_state`
- `auth.saml_providers`
- `auth.saml_relay_states`
- `auth.sso_domains`
- `auth.sso_providers`

**If any are missing**, your Supabase project has a corrupted auth schema!

### Step 3: Check Demo User's Identity

Run this:

```sql
-- Check if demo user has an identity record
SELECT
    u.id as user_id,
    u.email,
    i.id as identity_id,
    i.provider
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'demo@tribos.studio';
```

**Expected result:** Should show a row with `provider = 'email'`

**If identity is NULL**, run this fix:

```sql
-- Create missing identity for demo user
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    id,
    jsonb_build_object(
        'sub', id::text,
        'email', email
    ),
    'email',
    now(),
    now(),
    now()
FROM auth.users
WHERE email = 'demo@tribos.studio'
  AND NOT EXISTS (
      SELECT 1 FROM auth.identities
      WHERE user_id = auth.users.id
      AND provider = 'email'
  );
```

### Step 4: Verify RLS Policies on Auth Tables

Run this:

```sql
-- Check RLS on auth tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'auth'
ORDER BY tablename;
```

**All auth tables should have `rowsecurity = false`** (Supabase manages auth security internally)

**If any show `true`**, disable RLS:

```sql
ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE auth.identities DISABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE auth.refresh_tokens DISABLE ROW LEVEL SECURITY;
```

### Step 5: Check for Orphaned Sessions

```sql
-- Clean up any orphaned sessions
DELETE FROM auth.sessions
WHERE user_id NOT IN (SELECT id FROM auth.users);

DELETE FROM auth.refresh_tokens
WHERE user_id NOT IN (SELECT id FROM auth.users);
```

### Step 6: Nuclear Option - Reset Auth for Demo User

If nothing else works:

```sql
-- 1. Delete all auth data for demo user
DELETE FROM auth.sessions WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');
DELETE FROM auth.refresh_tokens WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');
DELETE FROM auth.users WHERE email = 'demo@tribos.studio';

-- 2. Recreate via Dashboard
-- Go to Dashboard → Authentication → Users → Add User
-- Email: demo@tribos.studio
-- Password: demo2024tribos
-- ✅ Auto Confirm User
```

### Step 7: Check Supabase Project Version

Your Supabase project might be on an old version with bugs:

1. Go to Supabase Dashboard → Settings → General
2. Check "Postgres Version"
3. If it's older than Postgres 15, consider upgrading

### Step 8: Contact Supabase Support

If none of the above works, this might be a Supabase platform issue:

1. Go to Supabase Dashboard
2. Click the **?** icon → "Contact Support"
3. Provide:
   - Error message: "Database error querying schema on signInWithPassword"
   - What you've tried (list steps above)
   - Postgres logs showing the actual error

## Most Likely Solutions

### Solution A: Missing Identity (90% of cases)
Run Step 3 above - the demo user probably doesn't have an `auth.identities` record.

### Solution B: Corrupted Auth Schema (5% of cases)
Check Step 2 - if tables are missing, your project needs to be recreated or restored from backup.

### Solution C: Custom Trigger Breaking Auth (5% of cases)
Run `check_auth_triggers.sql` and drop any custom triggers on `auth.users`.

## After Fixing

1. Try demo login again
2. Check browser console for errors
3. Check Supabase logs for any new errors
4. If still failing, **check Postgres logs** - they will show the exact SQL error

## Prevention

Once working, document what fixed it so you can prevent it in the future:
- Don't manually insert into `auth.users` - use Dashboard or Admin API
- Don't add RLS to auth schema tables
- Don't create custom triggers on auth tables without understanding the impact
- Keep Supabase project updated

---

**The #1 thing to check: Supabase Dashboard → Logs → Postgres Logs**

That will show you the EXACT error happening on the database during sign-in.
