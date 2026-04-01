/**
 * Cron: Activation Nudge Email
 * Schedule: daily at 10:00 UTC
 *
 * Sends a targeted nudge email to users who signed up ~24 hours ago
 * and have 2+ incomplete activation milestones.
 */

import { Resend } from 'resend';
import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';

const supabase = getSupabaseAdmin();

const MILESTONE_NUDGES = {
  connect_device: {
    subject: 'Connect your device to unlock everything',
    cta: 'Go to Settings',
    url: 'https://www.tribos.studio/settings',
  },
  first_sync: {
    subject: 'Your first ride is waiting to sync',
    cta: 'Go to Settings',
    url: 'https://www.tribos.studio/settings',
  },
  first_insight: {
    subject: 'Ask your coach anything',
    cta: 'Go to TODAY',
    url: 'https://www.tribos.studio/today',
  },
  first_route: {
    subject: 'Build your first route in 2 minutes',
    cta: 'Open Route Builder',
    url: 'https://www.tribos.studio/ride/new',
  },
  first_plan: {
    subject: 'Which training plan fits your goal?',
    cta: 'Browse Training Plans',
    url: 'https://www.tribos.studio/train/planner?tab=browse',
  },
};

export default async function handler(req, res) {
  const { verifyCronAuth } = await import('../utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(200).json({ skipped: true, reason: 'RESEND_API_KEY not configured' });
  }

  try {
    // Find users who signed up 22-26 hours ago, completed onboarding, haven't been nudged
    const now = new Date();
    const from = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString();

    const { data: candidates, error: queryError } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .eq('welcome_email_sent', true)
      .eq('activation_nudge_sent', false)
      .gte('created_at', from)
      .lte('created_at', to);

    if (queryError) {
      console.error('Nudge query error:', queryError);
      return res.status(500).json({ error: queryError.message });
    }

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No candidates' });
    }

    const resend = new Resend(resendKey);
    let sentCount = 0;

    for (const candidate of candidates) {
      // Get activation record
      const { data: activation } = await supabase
        .from('user_activation')
        .select('steps')
        .eq('user_id', candidate.id)
        .single();

      if (!activation?.steps) continue;

      // Count incomplete milestones
      const incomplete = Object.entries(activation.steps)
        .filter(([, v]) => !v.completed)
        .map(([k]) => k);

      if (incomplete.length < 2) continue;

      // Get user email from auth
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(candidate.id);
      if (!authUser?.email) continue;

      // Pick the first incomplete milestone
      const nextMilestone = incomplete[0];
      const nudge = MILESTONE_NUDGES[nextMilestone];
      if (!nudge) continue;

      const name = candidate.display_name || authUser.email.split('@')[0];

      try {
        await resend.emails.send({
          from: 'Tribos Studio <onboarding@tribos.studio>',
          to: [authUser.email],
          subject: nudge.subject,
          html: getNudgeHtml(name, nudge),
        });

        await supabase
          .from('user_profiles')
          .update({ activation_nudge_sent: true })
          .eq('id', candidate.id);

        sentCount++;
      } catch (emailErr) {
        console.error(`Nudge email failed for ${candidate.id}:`, emailErr);
      }
    }

    return res.status(200).json({ sent: sentCount, candidates: candidates.length });
  } catch (error) {
    console.error('Activation nudge cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function getNudgeHtml(name, nudge) {
  const safeName = name ? String(name).replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Rider';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a1a2e; color: #e0e0e0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #252540;">
          <tr>
            <td style="padding: 30px 40px; border-bottom: 2px solid #10b981;">
              <p style="color: #10b981; margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700;">tribos.studio</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #fff; margin: 0 0 16px; font-size: 22px;">Hey ${safeName},</h2>
              <p style="color: #a0a0b0; line-height: 1.6; margin: 0 0 30px; font-size: 16px;">
                You're one step away from getting personalized training insights.
                Your coach is waiting.
              </p>
              <a href="${nudge.url}" style="display: inline-block; background: #10b981; color: #fff; text-decoration: none; padding: 14px 28px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; font-size: 14px;">
                ${nudge.cta}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #333; text-align: center;">
              <p style="color: #666; font-size: 12px; margin: 0;">You're receiving this because you recently signed up for tribos.studio</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
