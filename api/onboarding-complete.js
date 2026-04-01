/**
 * POST /api/onboarding-complete
 *
 * Called when the user finishes the expanded 6-step onboarding.
 * Saves all profile data, sends the welcome email, and marks onboarding complete.
 */

import { Resend } from 'resend';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';

const supabase = getSupabaseAdmin();

const WELCOME_SUBJECTS = {
  hammer: (name) => `Time to get to work, ${name}`,
  scientist: (name) => `Your training data is ready, ${name}`,
  encourager: (name) => `You've got this, ${name}!`,
  pragmatist: (name) => `Let's keep it simple, ${name}`,
  competitor: (name) => `Ready to push limits, ${name}?`,
};

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    experience_level,
    weekly_hours_available,
    preferred_terrain,
    primary_goal,
    target_event_date,
    target_event_name,
    ftp,
    units_preference,
    weekly_tss_estimate,
    persona_id,
  } = req.body;

  try {
    // 1. Upsert user_profiles
    const profileUpdate = {
      id: user.id,
      onboarding_completed: true,
      units_preference: units_preference || 'imperial',
    };

    if (experience_level) profileUpdate.experience_level = experience_level;
    if (weekly_hours_available != null) profileUpdate.weekly_hours_available = weekly_hours_available;
    if (preferred_terrain) profileUpdate.preferred_terrain = preferred_terrain;
    if (primary_goal) profileUpdate.primary_goal = primary_goal;
    if (target_event_date) profileUpdate.target_event_date = target_event_date;
    if (target_event_name) profileUpdate.target_event_name = target_event_name;
    if (ftp != null) profileUpdate.ftp = ftp;
    if (weekly_tss_estimate != null) profileUpdate.weekly_tss_estimate = weekly_tss_estimate;
    if (persona_id) profileUpdate.onboarding_persona_set = true;

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(profileUpdate);

    if (profileError) {
      console.error('Profile upsert error:', profileError);
    }

    // 2. Send welcome email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && user.email) {
      try {
        const resend = new Resend(resendKey);
        const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
        const subjectFn = WELCOME_SUBJECTS[persona_id] || WELCOME_SUBJECTS.pragmatist;

        await resend.emails.send({
          from: 'Tribos Studio <onboarding@tribos.studio>',
          to: [user.email],
          subject: subjectFn(displayName),
          html: getWelcomeHtml(displayName, persona_id),
        });

        await supabase
          .from('user_profiles')
          .update({ welcome_email_sent: true })
          .eq('id', user.id);
      } catch (emailErr) {
        // Non-blocking — don't fail onboarding if email fails
        console.error('Welcome email failed:', emailErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getWelcomeHtml(name, personaId) {
  const safeName = escapeHtml(name);
  const personaNames = {
    hammer: 'The Hammer',
    scientist: 'The Scientist',
    encourager: 'The Encourager',
    pragmatist: 'The Pragmatist',
    competitor: 'The Competitor',
  };
  const coachName = personaNames[personaId] || 'your AI coach';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a1a2e; color: #e0e0e0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #252540; border-radius: 0;">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); padding: 40px; text-align: center;">
              <h1 style="color: #fff; margin: 0; font-size: 28px;">tribos.studio</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Department of Cycling Intelligence</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #fff; margin: 0 0 16px;">Welcome, ${safeName}</h2>
              <p style="color: #a0a0b0; line-height: 1.6; margin: 0 0 20px;">
                Your account is set up and ${coachName} is ready to work with you.
              </p>
              <p style="color: #a0a0b0; line-height: 1.6; margin: 0 0 20px;">
                Here&apos;s how to get the most out of tribos:
              </p>
              <ul style="color: #a0a0b0; line-height: 1.8; padding-left: 20px; margin: 0 0 30px;">
                <li><strong style="color: #e0e0e0;">Connect your device</strong> — Sync Strava, Garmin, or Wahoo to import your rides</li>
                <li><strong style="color: #e0e0e0;">Start a training plan</strong> — Choose from 13+ structured cycling plans</li>
                <li><strong style="color: #e0e0e0;">Build a route</strong> — AI-powered route building that matches your training</li>
                <li><strong style="color: #e0e0e0;">Check your TODAY screen</strong> — Your daily briefing with workout + route match</li>
              </ul>
              <a href="https://www.tribos.studio/today" style="display: inline-block; background: #10b981; color: #fff; text-decoration: none; padding: 14px 28px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; font-size: 14px;">
                Go to your TODAY screen
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #333; text-align: center;">
              <p style="color: #666; font-size: 12px; margin: 0;">
                Questions? Reply to this email or use the feedback button in the app.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
