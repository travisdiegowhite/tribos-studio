-- 091: security-advisor ERROR/WARN remediation — SECURITY DEFINER views + function search_path
--
-- Addresses the Supabase security advisors recorded in BETA_AUDIT_FINDINGS.md:
--   * security_definer_view (ERROR) on the 2 public views below.
--   * function_search_path_mutable (WARN) on the SECURITY DEFINER functions in
--     public — the CLAUDE.md auth rule mandates SET search_path = public on all
--     SECURITY DEFINER functions.
--
-- SAFETY (verified against production 2026-06-23):
--   * Both views read tables with RLS ENABLED + policies:
--       daily_training_load     → public.cross_training_activities (RLS, 4 policies)
--       garmin_completeness_audit → public.activities             (RLS enabled)
--     so flipping to security_invoker scopes results to the caller's own rows
--     (service-role callers bypass RLS regardless, so backend audits are unaffected).
--   * The function loop only touches SECURITY DEFINER functions in `public` that
--     are NOT extension-owned (excludes PostGIS st_* helpers). None of these
--     functions reference the `auth.` schema, so pinning search_path = public does
--     not change any cross-schema name resolution.
--   * The one trigger on auth.users (create_user_activation) ALREADY has
--     search_path set and is therefore NOT in this set — the critical signup path
--     is untouched.
--
-- Idempotent: ALTER VIEW SET is a no-op if already set; the loop skips any
-- function that already has a search_path config.
--
-- NOT covered here (manual, no SQL surface): enable Supabase Auth
-- "leaked password protection" (HaveIBeenPwned) in the Auth dashboard before
-- opening public signups — tracked in BETA_AUDIT_FINDINGS.md.

BEGIN;

-- 1) SECURITY DEFINER views → security_invoker (caller's RLS applies)
ALTER VIEW public.daily_training_load      SET (security_invoker = true);
ALTER VIEW public.garmin_completeness_audit SET (security_invoker = true);

-- 2) Pin search_path = public on every SECURITY DEFINER function in public that
--    lacks one (excluding extension-owned PostGIS functions). Signature-safe via
--    oid::regprocedure so overloads are handled correctly.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'  -- skip extension-owned (PostGIS)
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
    RAISE NOTICE 'search_path pinned: %', r.sig;
  END LOOP;
END $$;

COMMIT;

-- Verification (both should return 0 after apply):
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--     WHERE n.nspname='public' AND c.relkind='v'
--       AND c.relname IN ('daily_training_load','garmin_completeness_audit')
--       AND NOT (coalesce(c.reloptions,'{}') @> ARRAY['security_invoker=true']);
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.prosecdef
--       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
--       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e');
