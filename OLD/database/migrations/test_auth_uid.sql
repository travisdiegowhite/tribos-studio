-- Test if auth.uid() is working

SELECT auth.uid() as my_user_id;

-- If that works, try calling the function directly with the UUID
SELECT seed_progression_simple(auth.uid());
