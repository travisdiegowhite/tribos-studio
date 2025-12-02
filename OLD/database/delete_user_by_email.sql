-- =====================================================
-- COMPREHENSIVE USER DELETION SCRIPT
-- =====================================================
-- This script safely deletes a user and ALL associated data
-- Usage: Modify the email address below and run in Supabase SQL Editor
--
-- WARNING: This action is IRREVERSIBLE!
-- =====================================================

-- =====================================================
-- STEP 1: SET EMAIL ADDRESS TO DELETE
-- =====================================================
-- MODIFY THIS LINE with the email of the user you want to delete
DO $$
DECLARE
    target_email TEXT := 'travis@tribos.studio';  -- <<< CHANGE THIS EMAIL
    target_user_id UUID;

    -- User detail variables
    user_email_val TEXT;
    user_created_at TIMESTAMPTZ;
    user_last_sign_in TIMESTAMPTZ;
    user_email_confirmed TIMESTAMPTZ;

    -- Counters for pre-deletion summary
    count_user_preferences INTEGER;
    count_routing_preferences INTEGER;
    count_surface_preferences INTEGER;
    count_safety_preferences INTEGER;
    count_scenic_preferences INTEGER;
    count_training_context INTEGER;
    count_preference_history INTEGER;
    count_strava_tokens INTEGER;
    count_strava_imports INTEGER;
    count_bike_computer_integrations INTEGER;
    count_bike_computer_sync_history INTEGER;
    count_routes INTEGER;
    count_track_points INTEGER;
    count_training_plans INTEGER;
    count_planned_workouts INTEGER;
    count_training_metrics INTEGER;
    count_user_ftp_history INTEGER;
    count_training_zones INTEGER;
    count_adaptation_history INTEGER;
    count_adaptation_settings INTEGER;
    count_health_metrics INTEGER;
    count_progression_levels INTEGER;
    count_progression_level_history INTEGER;
    count_athlete_performance_profile INTEGER;
    count_workout_feedback INTEGER;
    count_coach_athlete_relationships INTEGER;
    count_coach_messages INTEGER;
    count_coach_invitations_pending INTEGER;
    count_ai_coach_conversations INTEGER;
    count_shared_routes INTEGER;
    count_route_comments INTEGER;
    count_garmin_webhook_events INTEGER;
    count_strava_webhook_events INTEGER;
    count_beta_feedback INTEGER;
    count_auth_sessions INTEGER;
    count_auth_refresh_tokens INTEGER;
    count_auth_identities INTEGER;

    total_records INTEGER := 0;

BEGIN
    -- =====================================================
    -- STEP 2: FIND USER AND DISPLAY INFO
    -- =====================================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'USER DELETION SCRIPT';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'Target Email: %', target_email;
    RAISE NOTICE '';

    -- Find the user
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = target_email;

    -- Check if user exists
    IF target_user_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: User with email "%" not found!', target_email;
        RAISE NOTICE 'No action taken.';
        RETURN;
    END IF;

    RAISE NOTICE '✓ User found!';
    RAISE NOTICE 'User ID: %', target_user_id;
    RAISE NOTICE '';

    -- Display user details
    RAISE NOTICE '--------------------------------------------------------';
    RAISE NOTICE 'USER DETAILS:';
    RAISE NOTICE '--------------------------------------------------------';

    SELECT
        email,
        created_at,
        last_sign_in_at,
        email_confirmed_at
    INTO
        user_email_val,
        user_created_at,
        user_last_sign_in,
        user_email_confirmed
    FROM auth.users
    WHERE id = target_user_id;

    RAISE NOTICE 'Email: %', user_email_val;
    RAISE NOTICE 'Created: %', user_created_at;
    RAISE NOTICE 'Last Sign In: %', user_last_sign_in;
    RAISE NOTICE 'Email Confirmed: %', user_email_confirmed;
    RAISE NOTICE '';

    -- =====================================================
    -- STEP 3: PRE-DELETION DATA SUMMARY
    -- =====================================================
    RAISE NOTICE '--------------------------------------------------------';
    RAISE NOTICE 'PRE-DELETION DATA SUMMARY:';
    RAISE NOTICE '--------------------------------------------------------';

    -- Count records in each table
    SELECT COUNT(*) INTO count_user_preferences FROM user_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_routing_preferences FROM routing_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_surface_preferences FROM surface_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_safety_preferences FROM safety_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_scenic_preferences FROM scenic_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_context FROM training_context WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_preference_history FROM preference_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_tokens FROM strava_tokens WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_imports FROM strava_imports WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_bike_computer_integrations FROM bike_computer_integrations WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_bike_computer_sync_history FROM bike_computer_sync_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_routes FROM routes WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_track_points FROM track_points WHERE route_id IN (SELECT id FROM routes WHERE user_id = target_user_id);
    SELECT COUNT(*) INTO count_training_plans FROM training_plans WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_planned_workouts FROM planned_workouts WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = target_user_id);
    SELECT COUNT(*) INTO count_training_metrics FROM training_metrics WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_user_ftp_history FROM user_ftp_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_zones FROM training_zones WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_adaptation_history FROM adaptation_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_adaptation_settings FROM adaptation_settings WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_health_metrics FROM health_metrics WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_progression_levels FROM progression_levels WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_progression_level_history FROM progression_level_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_athlete_performance_profile FROM athlete_performance_profile WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_workout_feedback FROM workout_feedback WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_athlete_relationships FROM coach_athlete_relationships WHERE coach_id = target_user_id OR athlete_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_messages FROM coach_messages WHERE sender_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_invitations_pending FROM coach_invitations_pending WHERE coach_id = target_user_id;
    SELECT COUNT(*) INTO count_ai_coach_conversations FROM ai_coach_conversations WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_shared_routes FROM shared_routes WHERE owner_id = target_user_id;
    SELECT COUNT(*) INTO count_route_comments FROM route_comments WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_garmin_webhook_events FROM garmin_webhook_events WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_webhook_events FROM strava_webhook_events WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_beta_feedback FROM beta_feedback WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_auth_sessions FROM auth.sessions WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_auth_refresh_tokens FROM auth.refresh_tokens WHERE user_id::uuid = target_user_id;
    SELECT COUNT(*) INTO count_auth_identities FROM auth.identities WHERE user_id::uuid = target_user_id;

    -- Display counts
    IF count_user_preferences > 0 THEN
        RAISE NOTICE 'user_preferences: %', count_user_preferences;
        total_records := total_records + count_user_preferences;
    END IF;

    IF count_routing_preferences > 0 THEN
        RAISE NOTICE 'routing_preferences: %', count_routing_preferences;
        total_records := total_records + count_routing_preferences;
    END IF;

    IF count_surface_preferences > 0 THEN
        RAISE NOTICE 'surface_preferences: %', count_surface_preferences;
        total_records := total_records + count_surface_preferences;
    END IF;

    IF count_safety_preferences > 0 THEN
        RAISE NOTICE 'safety_preferences: %', count_safety_preferences;
        total_records := total_records + count_safety_preferences;
    END IF;

    IF count_scenic_preferences > 0 THEN
        RAISE NOTICE 'scenic_preferences: %', count_scenic_preferences;
        total_records := total_records + count_scenic_preferences;
    END IF;

    IF count_training_context > 0 THEN
        RAISE NOTICE 'training_context: %', count_training_context;
        total_records := total_records + count_training_context;
    END IF;

    IF count_preference_history > 0 THEN
        RAISE NOTICE 'preference_history: %', count_preference_history;
        total_records := total_records + count_preference_history;
    END IF;

    IF count_strava_tokens > 0 THEN
        RAISE NOTICE 'strava_tokens: %', count_strava_tokens;
        total_records := total_records + count_strava_tokens;
    END IF;

    IF count_strava_imports > 0 THEN
        RAISE NOTICE 'strava_imports: %', count_strava_imports;
        total_records := total_records + count_strava_imports;
    END IF;

    IF count_bike_computer_integrations > 0 THEN
        RAISE NOTICE 'bike_computer_integrations: %', count_bike_computer_integrations;
        total_records := total_records + count_bike_computer_integrations;
    END IF;

    IF count_bike_computer_sync_history > 0 THEN
        RAISE NOTICE 'bike_computer_sync_history: %', count_bike_computer_sync_history;
        total_records := total_records + count_bike_computer_sync_history;
    END IF;

    IF count_routes > 0 THEN
        RAISE NOTICE 'routes: %', count_routes;
        total_records := total_records + count_routes;
    END IF;

    IF count_track_points > 0 THEN
        RAISE NOTICE 'track_points: %', count_track_points;
        total_records := total_records + count_track_points;
    END IF;

    IF count_training_plans > 0 THEN
        RAISE NOTICE 'training_plans: %', count_training_plans;
        total_records := total_records + count_training_plans;
    END IF;

    IF count_planned_workouts > 0 THEN
        RAISE NOTICE 'planned_workouts: %', count_planned_workouts;
        total_records := total_records + count_planned_workouts;
    END IF;

    IF count_training_metrics > 0 THEN
        RAISE NOTICE 'training_metrics: %', count_training_metrics;
        total_records := total_records + count_training_metrics;
    END IF;

    IF count_user_ftp_history > 0 THEN
        RAISE NOTICE 'user_ftp_history: %', count_user_ftp_history;
        total_records := total_records + count_user_ftp_history;
    END IF;

    IF count_training_zones > 0 THEN
        RAISE NOTICE 'training_zones: %', count_training_zones;
        total_records := total_records + count_training_zones;
    END IF;

    IF count_adaptation_history > 0 THEN
        RAISE NOTICE 'adaptation_history: %', count_adaptation_history;
        total_records := total_records + count_adaptation_history;
    END IF;

    IF count_adaptation_settings > 0 THEN
        RAISE NOTICE 'adaptation_settings: %', count_adaptation_settings;
        total_records := total_records + count_adaptation_settings;
    END IF;

    IF count_health_metrics > 0 THEN
        RAISE NOTICE 'health_metrics: %', count_health_metrics;
        total_records := total_records + count_health_metrics;
    END IF;

    IF count_progression_levels > 0 THEN
        RAISE NOTICE 'progression_levels: %', count_progression_levels;
        total_records := total_records + count_progression_levels;
    END IF;

    IF count_progression_level_history > 0 THEN
        RAISE NOTICE 'progression_level_history: %', count_progression_level_history;
        total_records := total_records + count_progression_level_history;
    END IF;

    IF count_athlete_performance_profile > 0 THEN
        RAISE NOTICE 'athlete_performance_profile: %', count_athlete_performance_profile;
        total_records := total_records + count_athlete_performance_profile;
    END IF;

    IF count_workout_feedback > 0 THEN
        RAISE NOTICE 'workout_feedback: %', count_workout_feedback;
        total_records := total_records + count_workout_feedback;
    END IF;

    IF count_coach_athlete_relationships > 0 THEN
        RAISE NOTICE 'coach_athlete_relationships: %', count_coach_athlete_relationships;
        total_records := total_records + count_coach_athlete_relationships;
    END IF;

    IF count_coach_messages > 0 THEN
        RAISE NOTICE 'coach_messages: %', count_coach_messages;
        total_records := total_records + count_coach_messages;
    END IF;

    IF count_coach_invitations_pending > 0 THEN
        RAISE NOTICE 'coach_invitations_pending: %', count_coach_invitations_pending;
        total_records := total_records + count_coach_invitations_pending;
    END IF;

    IF count_ai_coach_conversations > 0 THEN
        RAISE NOTICE 'ai_coach_conversations: %', count_ai_coach_conversations;
        total_records := total_records + count_ai_coach_conversations;
    END IF;

    IF count_shared_routes > 0 THEN
        RAISE NOTICE 'shared_routes: %', count_shared_routes;
        total_records := total_records + count_shared_routes;
    END IF;

    IF count_route_comments > 0 THEN
        RAISE NOTICE 'route_comments: %', count_route_comments;
        total_records := total_records + count_route_comments;
    END IF;

    IF count_garmin_webhook_events > 0 THEN
        RAISE NOTICE 'garmin_webhook_events: %', count_garmin_webhook_events;
        total_records := total_records + count_garmin_webhook_events;
    END IF;

    IF count_strava_webhook_events > 0 THEN
        RAISE NOTICE 'strava_webhook_events: %', count_strava_webhook_events;
        total_records := total_records + count_strava_webhook_events;
    END IF;

    IF count_beta_feedback > 0 THEN
        RAISE NOTICE 'beta_feedback: %', count_beta_feedback;
        total_records := total_records + count_beta_feedback;
    END IF;

    IF count_auth_sessions > 0 THEN
        RAISE NOTICE 'auth.sessions: %', count_auth_sessions;
        total_records := total_records + count_auth_sessions;
    END IF;

    IF count_auth_refresh_tokens > 0 THEN
        RAISE NOTICE 'auth.refresh_tokens: %', count_auth_refresh_tokens;
        total_records := total_records + count_auth_refresh_tokens;
    END IF;

    IF count_auth_identities > 0 THEN
        RAISE NOTICE 'auth.identities: %', count_auth_identities;
        total_records := total_records + count_auth_identities;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'TOTAL RECORDS TO DELETE: %', total_records + 1; -- +1 for auth.users
    RAISE NOTICE '';

    -- =====================================================
    -- STEP 4: EXECUTE DELETION
    -- =====================================================
    RAISE NOTICE '--------------------------------------------------------';
    RAISE NOTICE 'EXECUTING DELETION...';
    RAISE NOTICE '--------------------------------------------------------';

    -- Delete from auth helper tables first (not covered by CASCADE)
    DELETE FROM auth.sessions WHERE user_id = target_user_id;
    RAISE NOTICE '✓ Deleted % auth.sessions', count_auth_sessions;

    DELETE FROM auth.refresh_tokens WHERE user_id::uuid = target_user_id;
    RAISE NOTICE '✓ Deleted % auth.refresh_tokens', count_auth_refresh_tokens;

    DELETE FROM auth.identities WHERE user_id::uuid = target_user_id;
    RAISE NOTICE '✓ Deleted % auth.identities', count_auth_identities;

    -- Delete the user (this triggers CASCADE DELETE for all related tables)
    DELETE FROM auth.users WHERE id = target_user_id;
    RAISE NOTICE '✓ Deleted user from auth.users';
    RAISE NOTICE '✓ CASCADE deleted all related records';

    RAISE NOTICE '';

    -- =====================================================
    -- STEP 5: POST-DELETION VERIFICATION
    -- =====================================================
    RAISE NOTICE '--------------------------------------------------------';
    RAISE NOTICE 'POST-DELETION VERIFICATION:';
    RAISE NOTICE '--------------------------------------------------------';

    -- Re-count to verify deletion
    SELECT COUNT(*) INTO count_user_preferences FROM user_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_routing_preferences FROM routing_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_surface_preferences FROM surface_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_safety_preferences FROM safety_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_scenic_preferences FROM scenic_preferences WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_context FROM training_context WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_preference_history FROM preference_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_tokens FROM strava_tokens WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_imports FROM strava_imports WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_bike_computer_integrations FROM bike_computer_integrations WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_bike_computer_sync_history FROM bike_computer_sync_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_routes FROM routes WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_plans FROM training_plans WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_metrics FROM training_metrics WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_user_ftp_history FROM user_ftp_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_training_zones FROM training_zones WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_adaptation_history FROM adaptation_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_adaptation_settings FROM adaptation_settings WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_health_metrics FROM health_metrics WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_progression_levels FROM progression_levels WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_progression_level_history FROM progression_level_history WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_athlete_performance_profile FROM athlete_performance_profile WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_workout_feedback FROM workout_feedback WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_athlete_relationships FROM coach_athlete_relationships WHERE coach_id = target_user_id OR athlete_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_messages FROM coach_messages WHERE sender_id = target_user_id;
    SELECT COUNT(*) INTO count_coach_invitations_pending FROM coach_invitations_pending WHERE coach_id = target_user_id;
    SELECT COUNT(*) INTO count_ai_coach_conversations FROM ai_coach_conversations WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_shared_routes FROM shared_routes WHERE owner_id = target_user_id;
    SELECT COUNT(*) INTO count_route_comments FROM route_comments WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_garmin_webhook_events FROM garmin_webhook_events WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_strava_webhook_events FROM strava_webhook_events WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO count_beta_feedback FROM beta_feedback WHERE user_id = target_user_id;

    -- Check if any records remain
    total_records := count_user_preferences + count_routing_preferences + count_surface_preferences +
                    count_safety_preferences + count_scenic_preferences + count_training_context +
                    count_preference_history + count_strava_tokens + count_strava_imports +
                    count_bike_computer_integrations + count_bike_computer_sync_history + count_routes +
                    count_training_plans + count_training_metrics + count_user_ftp_history +
                    count_training_zones + count_adaptation_history + count_adaptation_settings +
                    count_health_metrics + count_progression_levels + count_progression_level_history +
                    count_athlete_performance_profile + count_workout_feedback +
                    count_coach_athlete_relationships + count_coach_messages + count_coach_invitations_pending +
                    count_ai_coach_conversations + count_shared_routes + count_route_comments +
                    count_garmin_webhook_events + count_strava_webhook_events +
                    count_beta_feedback;

    IF total_records = 0 THEN
        RAISE NOTICE '✅ SUCCESS! All user data has been completely deleted.';
        RAISE NOTICE '';
        RAISE NOTICE 'User "%" (%) has been removed.', target_email, target_user_id;
    ELSE
        RAISE NOTICE '⚠️  WARNING: % orphaned records found!', total_records;
        RAISE NOTICE 'Some data may not have been deleted properly.';
        RAISE NOTICE 'Please review the database schema for missing CASCADE constraints.';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'DELETION COMPLETE';
    RAISE NOTICE '========================================================';

END $$;
