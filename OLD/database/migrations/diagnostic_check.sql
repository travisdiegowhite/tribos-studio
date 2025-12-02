-- =====================================================
-- DIAGNOSTIC CHECK: Coach Invitation System
-- =====================================================
-- Run this to verify all components are installed correctly
-- =====================================================

DO $$
DECLARE
  v_check_result TEXT;
  v_count INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COACH INVITATION SYSTEM - DIAGNOSTIC CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Check 1: Tables exist
  RAISE NOTICE '1. CHECKING TABLES...';

  -- coach_athlete_relationships
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'coach_athlete_relationships';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ coach_athlete_relationships table exists';
  ELSE
    RAISE NOTICE '   ❌ coach_athlete_relationships table MISSING';
  END IF;

  -- coach_invitations_pending
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'coach_invitations_pending';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ coach_invitations_pending table exists';
  ELSE
    RAISE NOTICE '   ❌ coach_invitations_pending table MISSING';
  END IF;

  -- coach_messages
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'coach_messages';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ coach_messages table exists';
  ELSE
    RAISE NOTICE '   ❌ coach_messages table MISSING';
  END IF;

  RAISE NOTICE '';

  -- Check 2: Columns exist in user_profiles
  RAISE NOTICE '2. CHECKING USER_PROFILES COLUMNS...';

  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
    AND column_name = 'account_type';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ account_type column exists';
  ELSE
    RAISE NOTICE '   ❌ account_type column MISSING';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
    AND column_name = 'coach_bio';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ coach_bio column exists';
  ELSE
    RAISE NOTICE '   ❌ coach_bio column MISSING';
  END IF;

  RAISE NOTICE '';

  -- Check 3: Functions exist
  RAISE NOTICE '3. CHECKING DATABASE FUNCTIONS...';

  SELECT COUNT(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name = 'find_user_by_email';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ find_user_by_email() function exists';
  ELSE
    RAISE NOTICE '   ❌ find_user_by_email() function MISSING';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name = 'generate_invitation_token';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ generate_invitation_token() function exists';
  ELSE
    RAISE NOTICE '   ❌ generate_invitation_token() function MISSING';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name = 'get_invitation_by_token';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ get_invitation_by_token() function exists';
  ELSE
    RAISE NOTICE '   ❌ get_invitation_by_token() function MISSING';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name = 'accept_pending_invitation';

  IF v_count = 1 THEN
    RAISE NOTICE '   ✅ accept_pending_invitation() function exists';
  ELSE
    RAISE NOTICE '   ❌ accept_pending_invitation() function MISSING';
  END IF;

  RAISE NOTICE '';

  -- Check 4: RLS Policies
  RAISE NOTICE '4. CHECKING RLS POLICIES...';

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'coach_athlete_relationships';

  RAISE NOTICE '   ℹ️  coach_athlete_relationships has % RLS policies', v_count;

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'coach_invitations_pending';

  RAISE NOTICE '   ℹ️  coach_invitations_pending has % RLS policies', v_count;

  RAISE NOTICE '';

  -- Check 5: Sample data
  RAISE NOTICE '5. CHECKING DATA...';

  SELECT COUNT(*) INTO v_count
  FROM coach_athlete_relationships;

  RAISE NOTICE '   ℹ️  % existing coach-athlete relationships', v_count;

  SELECT COUNT(*) INTO v_count
  FROM coach_invitations_pending;

  RAISE NOTICE '   ℹ️  % pending invitations', v_count;

  SELECT COUNT(*) INTO v_count
  FROM user_profiles
  WHERE account_type = 'coach';

  RAISE NOTICE '   ℹ️  % coach accounts', v_count;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DIAGNOSTIC CHECK COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  - If any items show ❌, run the corresponding migration';
  RAISE NOTICE '  - Missing tables: Run 001_coach_platform.sql or 002_coach_pending_invitations.sql';
  RAISE NOTICE '  - Missing functions: Re-run the migrations';
  RAISE NOTICE '  - All ✅? System is ready to use!';
  RAISE NOTICE '';
END $$;
