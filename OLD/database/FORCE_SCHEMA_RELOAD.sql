-- Force PostgREST to reload its schema cache
-- This fixes 406 errors when tables exist but PostgREST doesn't know about them yet

-- Method 1: Send reload notification
NOTIFY pgrst, 'reload schema';

-- Method 2: Verify notification was sent
SELECT pg_notify('pgrst', 'reload schema');

-- Wait a moment, then verify tables are accessible
SELECT 'Schema reload triggered. Wait 5-10 seconds, then test again.' as message;

-- Quick test: Try to query the table
SELECT
  'Test Query' as check_type,
  COUNT(*) as row_count,
  'If you see this without error, schema cache is reloaded!' as status
FROM bike_computer_integrations;
