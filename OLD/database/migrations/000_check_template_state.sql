-- Diagnostic query to see current state of workout templates
-- Run this to understand what templates exist and their library_id status

SELECT
  id,
  name,
  library_id,
  workout_type,
  duration,
  target_tss,
  is_system_template,
  CASE
    WHEN library_id IS NOT NULL THEN '✅ Mapped'
    ELSE '❌ Unmapped'
  END as status
FROM workout_templates
WHERE is_system_template = true
ORDER BY
  library_id NULLS LAST,
  workout_type,
  name;

-- Count summary
SELECT
  'Total templates' as metric,
  COUNT(*) as count
FROM workout_templates
WHERE is_system_template = true

UNION ALL

SELECT
  'Mapped (has library_id)' as metric,
  COUNT(*) as count
FROM workout_templates
WHERE is_system_template = true AND library_id IS NOT NULL

UNION ALL

SELECT
  'Unmapped (no library_id)' as metric,
  COUNT(*) as count
FROM workout_templates
WHERE is_system_template = true AND library_id IS NULL;

-- Check for potential duplicates
SELECT
  library_id,
  COUNT(*) as duplicate_count,
  string_agg(name, ', ') as template_names
FROM workout_templates
WHERE library_id IS NOT NULL
GROUP BY library_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
