/**
 * Email Unsubscribe Endpoint
 * GET /api/email-unsubscribe?userId=xxx&token=xxx
 *
 * Verifies HMAC token and sets daily_email_opt_out = true on user_profiles.
 * Returns a simple HTML confirmation page.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, token } = req.query;

  if (!userId || !token) {
    return res.status(400).send(renderPage('Missing Parameters', 'Invalid unsubscribe link. Please use the link from your email.'));
  }

  // Verify HMAC token
  const secret = process.env.SUPABASE_SERVICE_KEY || 'fallback-secret';
  const expectedToken = crypto
    .createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .substring(0, 32);

  if (token !== expectedToken) {
    return res.status(403).send(renderPage('Invalid Link', 'This unsubscribe link is invalid or has expired.'));
  }

  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ daily_email_opt_out: true })
      .eq('id', userId);

    if (error) {
      console.error('[email-unsubscribe] Update failed:', error);
      return res.status(500).send(renderPage('Error', 'Something went wrong. Please try again or contact support.'));
    }

    console.log(`[email-unsubscribe] User ${userId} unsubscribed from daily emails`);

    return res.status(200).send(renderPage(
      'Unsubscribed',
      "You've been unsubscribed from Tribos Studio daily emails. You can re-enable them anytime in your account settings."
    ));
  } catch (err) {
    console.error('[email-unsubscribe] Error:', err);
    return res.status(500).send(renderPage('Error', 'Something went wrong. Please try again.'));
  }
}

function renderPage(title, message) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Tribos Studio</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #E8E8E2; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
  <div style="background-color: #F5F5F1; border: 1px solid #D4D4C8; padding: 40px; max-width: 480px; width: 90%; text-align: center;">
    <p style="margin: 0 0 8px 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #6B8C72;">Tribos Studio</p>
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #2C2C2C;">${escapeHtml(title)}</h1>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4A4A42;">${escapeHtml(message)}</p>
    <a href="https://www.tribos.studio/dashboard" style="display: inline-block; background-color: #6B8C72; color: #FFFFFF; padding: 10px 24px; text-decoration: none; font-size: 14px; font-weight: 600;">Back to Tribos Studio</a>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
