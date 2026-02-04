-- Migration 039: Add process_notes column to separate info messages from errors
--
-- Problem: The process_error field was being used for both actual errors AND
-- success/info messages like "Data added: GPS: 219 points" or "Already imported".
-- This made it hard to identify real errors in the admin dashboard.
--
-- Solution: Add a process_notes column for informational messages, keeping
-- process_error for actual errors only.

-- Add the new column for informational notes
ALTER TABLE garmin_webhook_events
  ADD COLUMN IF NOT EXISTS process_notes TEXT;

-- Add comment explaining the difference
COMMENT ON COLUMN garmin_webhook_events.process_error IS
  'Stores actual error messages when webhook processing fails. NULL on success.';

COMMENT ON COLUMN garmin_webhook_events.process_notes IS
  'Stores informational notes about processing (e.g., "Data added: GPS: 219 points",
   "Already imported", "Filtered: activity too short"). Not an error indicator.';

-- Migrate existing non-error messages from process_error to process_notes
-- These patterns indicate success or expected behavior, not errors:
UPDATE garmin_webhook_events
SET
  process_notes = process_error,
  process_error = NULL
WHERE process_error IS NOT NULL
  AND (
    process_error LIKE 'Data added:%'
    OR process_error LIKE 'Already imported%'
    OR process_error LIKE 'Filtered:%'
    OR process_error LIKE 'Garmin took over%'
    OR process_error LIKE 'Skipped:%'
  );

-- Create index for finding actual errors quickly
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_has_error
  ON garmin_webhook_events(received_at DESC)
  WHERE process_error IS NOT NULL;
