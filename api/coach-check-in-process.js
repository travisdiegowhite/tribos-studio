// Vercel Cron: Coach Check-In Processor
// Runs every minute to generate AI coaching check-ins for newly synced activities.
// Picks up pending rows from coach_check_ins table and calls Claude API.

import { createClient } from '@supabase/supabase-js';
import { generateCheckIn } from './coach-check-in-generate.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BATCH_SIZE = 3; // Smaller than proactive insights due to heavier context assembly

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch pending check-ins
    const { data: pendingCheckIns, error: fetchError } = await supabase
      .from('coach_check_ins')
      .select('id, user_id, activity_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Failed to fetch pending check-ins:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch pending check-ins' });
    }

    if (!pendingCheckIns || pendingCheckIns.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No pending check-ins' });
    }

    console.log(`Processing ${pendingCheckIns.length} pending check-in(s)`);

    const results = [];

    for (const checkIn of pendingCheckIns) {
      try {
        // Mark as processing
        await supabase
          .from('coach_check_ins')
          .update({ status: 'processing' })
          .eq('id', checkIn.id);

        // Generate the check-in
        const result = await generateCheckIn(supabase, checkIn.user_id, checkIn.activity_id);

        // Save completed check-in
        await supabase
          .from('coach_check_ins')
          .update({
            persona_id: result.persona_id,
            narrative: result.narrative,
            deviation_callout: result.deviation_callout,
            recommendation: result.recommendation,
            next_session_purpose: result.next_session_purpose,
            context_snapshot: result.context_snapshot,
            status: 'completed',
          })
          .eq('id', checkIn.id);

        results.push({ id: checkIn.id, status: 'completed' });
        console.log(`Check-in generated for activity ${checkIn.activity_id}`);
      } catch (error) {
        console.error(`Failed to generate check-in ${checkIn.id}:`, error.message);

        await supabase
          .from('coach_check_ins')
          .update({
            status: 'failed',
            error_message: error.message?.substring(0, 500),
          })
          .eq('id', checkIn.id);

        results.push({ id: checkIn.id, status: 'failed', error: error.message });
      }
    }

    return res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Check-in processor error:', error);
    return res.status(500).json({ error: 'Processing failed', message: error.message });
  }
}
