/**
 * Test Push Notification Endpoint
 *
 * Sends a test push notification to the authenticated user.
 * Useful for verifying the full pipeline: SW → subscription → VAPID → delivery.
 *
 * POST /api/push-test
 * Auth: Bearer JWT
 * Body (optional): { "title": "...", "body": "..." }
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { sendPushToUser } from './utils/pushNotification.js';

export default async function handler(req, res) {
  if (setupCors(req, res, { allowedMethods: ['POST', 'OPTIONS'] })) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Authenticate user
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const title = req.body?.title || 'Test notification';
    const body = req.body?.body || 'If you see this, push notifications are working!';

    const result = await sendPushToUser(user.id, {
      title,
      body,
      url: '/settings?tab=notifications',
      notificationType: 'post_ride_insight', // reuse existing type for the test
      referenceId: `test-${Date.now()}`, // unique each time so dedup doesn't block
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Test push failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
