// Vercel API Route: Database Cleanup (Daily Cron)
// Runs daily at 3 AM UTC to clean up old processed webhook events,
// stale proactive insights, and expired weather cache entries.

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  // Verify cron authorization
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('=== Database Cleanup Started ===');

  const results = {
    webhookEvents: null,
    insights: null,
    weatherCache: null,
    errors: [],
  };

  // 1. Clean up old processed webhook events (30-day retention)
  try {
    const { data, error } = await supabase.rpc('cleanup_old_webhook_events', {
      retention_days: 30,
    });

    if (error) throw error;

    const row = data?.[0] || data;
    results.webhookEvents = {
      garmin: row?.garmin_deleted || 0,
      strava: row?.strava_deleted || 0,
      coros: row?.coros_deleted || 0,
    };
    console.log('Webhook events cleaned:', results.webhookEvents);
  } catch (err) {
    console.error('Webhook cleanup failed:', err.message);
    results.errors.push(`webhookEvents: ${err.message}`);
  }

  // 2. Clean up old proactive insights
  try {
    const { data, error } = await supabase.rpc('cleanup_old_insights');

    if (error) throw error;

    const row = data?.[0] || data;
    results.insights = {
      completed: row?.completed_deleted || 0,
      failed: row?.failed_deleted || 0,
    };
    console.log('Insights cleaned:', results.insights);
  } catch (err) {
    console.error('Insights cleanup failed:', err.message);
    results.errors.push(`insights: ${err.message}`);
  }

  // 3. Clean up expired weather cache
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_weather_cache');

    if (error) throw error;

    results.weatherCache = { deleted: data || 0 };
    console.log('Weather cache cleaned:', results.weatherCache);
  } catch (err) {
    console.error('Weather cache cleanup failed:', err.message);
    results.errors.push(`weatherCache: ${err.message}`);
  }

  console.log('=== Database Cleanup Complete ===');

  const hasErrors = results.errors.length > 0;
  return res.status(hasErrors ? 207 : 200).json({
    success: !hasErrors,
    ...results,
  });
}
