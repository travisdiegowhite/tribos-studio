/**
 * Daily Morning Email — Vercel Cron Handler
 *
 * Sends personalized daily training updates to active Tribos users.
 * Triggered by Vercel cron (GET) at 13:00 UTC (~6 AM MT) or manual POST.
 *
 * Each content section is an independent module that returns HTML + plain text,
 * or null if there's nothing to show.
 */

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { todaysWorkout } from './utils/dailyEmail/todaysWorkout.js';
import { weatherModule } from './utils/dailyEmail/weather.js';
import { trainingStatus } from './utils/dailyEmail/trainingStatus.js';
import { aiCoachInsight } from './utils/dailyEmail/aiCoachInsight.js';
import { gearAlertsModule } from './utils/dailyEmail/gearAlerts.js';
import { routeSuggestion } from './utils/dailyEmail/routeSuggestion.js';
import { assembleEmailHtml, assembleEmailText, generateUnsubscribeUrl } from './utils/dailyEmail/emailTemplate.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BATCH_SIZE = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[daily-email] RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('[daily-email] SUPABASE_SERVICE_KEY not configured');
    return res.status(500).json({ error: 'Database service not configured' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[daily-email] Starting daily email run for ${todayStr}`);

    // Query eligible users
    const users = await getEligibleUsers(todayStr);

    if (!users || users.length === 0) {
      console.log('[daily-email] No eligible users found');
      return res.status(200).json({ sent: 0, message: 'No eligible users' });
    }

    console.log(`[daily-email] Found ${users.length} eligible user(s)`);

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

    // Process in batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(user => processUser(resend, user, todayStr))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.sent) {
            results.sent++;
          } else {
            results.skipped++;
          }
        } else {
          results.failed++;
          results.errors.push(result.reason?.message || 'Unknown error');
        }
      }
    }

    console.log(`[daily-email] Complete: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`);

    return res.status(200).json(results);
  } catch (error) {
    console.error('[daily-email] Fatal error:', error);
    return res.status(500).json({ error: 'Daily email processing failed' });
  }
}

/**
 * Get users eligible for the daily email:
 * - Synced at least 1 activity in the last 14 days
 * - Have not opted out of daily emails
 * - Have not already received an email today
 */
async function getEligibleUsers(todayStr) {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Get users with recent activity
  const { data: activeUserIds, error: activityError } = await supabase
    .from('activities')
    .select('user_id')
    .gte('start_date', fourteenDaysAgo.toISOString());

  if (activityError) {
    console.error('[daily-email] Failed to query activities:', activityError);
    return [];
  }

  if (!activeUserIds || activeUserIds.length === 0) return [];

  // Deduplicate user IDs
  const uniqueUserIds = [...new Set(activeUserIds.map(a => a.user_id))];

  // Fetch user profiles that haven't opted out and haven't been emailed today
  const { data: users, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .in('id', uniqueUserIds)
    .or('daily_email_opt_out.eq.false,daily_email_opt_out.is.null');

  if (profileError) {
    console.error('[daily-email] Failed to query profiles:', profileError);
    return [];
  }

  if (!users) return [];

  // Filter out users who already received an email today
  const eligibleUsers = users.filter(u => {
    // We'll check last_daily_email_sent in processUser to avoid extra query here
    return true;
  });

  // Get user emails from auth.users via admin API
  const usersWithEmail = [];
  for (const user of eligibleUsers) {
    const { data: authData } = await supabase.auth.admin.getUserById(user.id);
    if (authData?.user?.email) {
      usersWithEmail.push({
        id: user.id,
        displayName: user.display_name,
        email: authData.user.email,
      });
    }
  }

  return usersWithEmail;
}

/**
 * Process a single user: run all modules, assemble email, send via Resend.
 */
async function processUser(resend, user, todayStr) {
  // Check if already sent today (double-send prevention)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('last_daily_email_sent')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.last_daily_email_sent) {
    const lastSent = profile.last_daily_email_sent.split('T')[0];
    if (lastSent === todayStr) {
      console.log(`[daily-email] Skipping ${user.id} — already sent today`);
      return { sent: false };
    }
  }

  // Run all modules in parallel
  const moduleResults = await Promise.allSettled([
    todaysWorkout(supabase, user.id, todayStr),
    weatherModule(supabase, user.id),
    trainingStatus(supabase, user.id, todayStr),
    aiCoachInsight(supabase, user.id),
    gearAlertsModule(supabase, user.id),
    routeSuggestion(supabase, user.id, todayStr),
  ]);

  // Collect successful, non-null module outputs
  const moduleOutputs = moduleResults
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  // Log any module failures (non-fatal)
  moduleResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      const moduleNames = ['todaysWorkout', 'weather', 'trainingStatus', 'aiCoachInsight', 'gearAlerts', 'routeSuggestion'];
      console.warn(`[daily-email] Module ${moduleNames[i]} failed for ${user.id}:`, r.reason?.message);
    }
  });

  if (moduleOutputs.length === 0) {
    console.log(`[daily-email] No content for ${user.id} — skipping`);
    return { sent: false };
  }

  // Assemble email
  const unsubscribeUrl = generateUnsubscribeUrl(user.id);
  const html = assembleEmailHtml(user.displayName, moduleOutputs, unsubscribeUrl, todayStr);
  const text = assembleEmailText(user.displayName, moduleOutputs, unsubscribeUrl, todayStr);

  // Send via Resend
  const { data, error } = await resend.emails.send({
    from: 'Tribos Studio <noreply@tribos.studio>',
    to: [user.email],
    subject: `Your Training Brief — ${formatSubjectDate(todayStr)}`,
    html,
    text,
  });

  if (error) {
    console.error(`[daily-email] Resend error for ${user.id}:`, error);
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }

  // Update last_daily_email_sent
  await supabase
    .from('user_profiles')
    .update({ last_daily_email_sent: new Date().toISOString() })
    .eq('id', user.id);

  console.log(`[daily-email] Sent to ${user.email} (${moduleOutputs.length} modules)`);
  return { sent: true };
}

function formatSubjectDate(todayStr) {
  const date = new Date(todayStr + 'T00:00:00Z');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
