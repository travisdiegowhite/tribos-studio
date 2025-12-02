// Vercel API Route: Import Job Status
// Returns current status of a background import job for polling

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId required' });
    }

    // Fetch job status
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) {
      console.error('Error fetching job status:', jobError);
      return res.status(500).json({ error: 'Failed to fetch job status' });
    }

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Return job status
    return res.status(200).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        importType: job.import_type,

        // Progress
        progressPercent: job.progress_percent || 0,
        totalActivities: job.total_activities,
        processedCount: job.processed_count || 0,

        // Results
        importedCount: job.imported_count || 0,
        skippedCount: job.skipped_count || 0,
        errorCount: job.error_count || 0,

        // Timestamps
        startedAt: job.started_at,
        completedAt: job.completed_at,
        lastUpdatedAt: job.last_updated_at,

        // Error info
        errorMessage: job.error_message,

        // Email notification
        emailSent: job.email_sent || false
      }
    });

  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({
      error: 'Failed to fetch job status',
      message: error.message
    });
  }
}
