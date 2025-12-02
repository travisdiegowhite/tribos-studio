-- Create import_jobs table for tracking background import operations
-- This enables users to safely leave the page during imports

-- Create the table
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Job type and status
  import_type TEXT NOT NULL CHECK (import_type IN ('strava_bulk', 'garmin_backfill', 'wahoo_sync')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Progress tracking
  total_activities INTEGER,
  processed_count INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Progress percentage (0-100)
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),

  -- Date range for import
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Error tracking
  error_message TEXT,

  -- Email notification tracking
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_status ON import_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own import jobs" ON import_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own import jobs" ON import_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own import jobs" ON import_jobs
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can manage all import jobs (for API updates)
CREATE POLICY "Service role can manage import jobs" ON import_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON import_jobs TO authenticated;
GRANT ALL ON import_jobs TO service_role;

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_import_jobs_timestamp
    BEFORE UPDATE ON import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_import_jobs_updated_at();

-- Add comment
COMMENT ON TABLE import_jobs IS 'Tracks background import jobs for Strava, Garmin, and other services. Enables users to leave page during long imports.';

-- Verification query
SELECT 'import_jobs table created successfully' AS status;
