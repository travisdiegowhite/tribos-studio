/**
 * Cron: Welcome Email
 * Schedule: every 5 minutes
 *
 * Sends a welcome email to users who signed up ~15 minutes ago.
 * Two variants based on whether they completed onboarding or not.
 * Window: 12–22 minutes post-signup so every user is caught in exactly one run.
 */

import { Resend } from 'resend';
import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { verifyCronAuth } from '../utils/verifyCronAuth.js';

const supabase = getSupabaseAdmin();

const BCC = ['travis@tribos.studio'];

export default async function handler(req, res) {
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(200).json({ skipped: true, reason: 'RESEND_API_KEY not configured' });
  }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - 22 * 60 * 1000).toISOString();
    const to   = new Date(now.getTime() - 12 * 60 * 1000).toISOString();

    const { data: candidates, error: queryError } = await supabase
      .from('user_profiles')
      .select('id, onboarding_completed')
      .eq('welcome_email_sent', false)
      .gte('created_at', from)
      .lte('created_at', to);

    if (queryError) {
      console.error('Welcome email query error:', queryError);
      return res.status(500).json({ error: queryError.message });
    }

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No candidates' });
    }

    const resend = new Resend(resendKey);
    let sentCount = 0;

    for (const candidate of candidates) {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(candidate.id);
      if (!authUser?.email) continue;

      const completed = !!candidate.onboarding_completed;

      try {
        await resend.emails.send({
          from: 'Travis <travis@tribos.studio>',
          to: [authUser.email],
          bcc: BCC,
          subject: completed
            ? 'Your coach is set — two more steps'
            : 'One step to actually start',
          html: completed ? getCompletedHtml() : getIncompleteHtml(),
        });

        await supabase
          .from('user_profiles')
          .update({ welcome_email_sent: true })
          .eq('id', candidate.id);

        sentCount++;
      } catch (emailErr) {
        console.error(`Welcome email failed for ${candidate.id}:`, emailErr.message);
      }
    }

    return res.status(200).json({ sent: sentCount, candidates: candidates.length });
  } catch (error) {
    console.error('Welcome email cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function getCompletedHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #ffffff; color: #1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 0 0 32px; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; letter-spacing: 1px; text-transform: uppercase;">
              tribos.studio
            </td>
          </tr>
          <tr>
            <td style="font-size: 16px; line-height: 1.7; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif;">
              <p style="margin: 0 0 20px;">Hey,</p>
              <p style="margin: 0 0 20px;">I&apos;m Travis. I&apos;m the one person who built Tribos, and I race the thing I&apos;m building. Thanks for setting up your coach.</p>
              <p style="margin: 0 0 20px;">Quick context: I started Tribos because every training app I used felt built for someone with unlimited time and a coach on speed dial. I&apos;m a washed-up masters racer doing mostly gravel and road, with a family, a day job, and about 10 hours a week to train. Tribos is what I wanted to exist.</p>
              <p style="margin: 0 0 12px;">You&apos;ve picked your coach. Two things left:</p>
              <ol style="margin: 0 0 20px; padding-left: 24px; color: #1a1a1a;">
                <li style="margin-bottom: 10px;">Connect Garmin, Strava, or Wahoo so the coach can pull your ride history.</li>
                <li style="margin-bottom: 10px;">Open the Coach Check-In. That&apos;s the default view and the actual product &mdash; not a dashboard, not a calendar. A real conversation about what you&apos;re doing and why.</li>
              </ol>
              <p style="margin: 0 0 20px;">This is a beta. Things will break. When they do, reply to this email. It comes straight to me.</p>
              <p style="margin: 0 0 8px;">Travis</p>
              <p style="margin: 0; font-size: 14px; color: #555555;">P.S. &mdash; when you have a minute, poke around the RIDE tab. The route builder is the other half of Tribos, and it&apos;s the reason I started this whole thing.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getIncompleteHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #ffffff; color: #1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 0 0 32px; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; letter-spacing: 1px; text-transform: uppercase;">
              tribos.studio
            </td>
          </tr>
          <tr>
            <td style="font-size: 16px; line-height: 1.7; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif;">
              <p style="margin: 0 0 20px;">Hey,</p>
              <p style="margin: 0 0 20px;">I&apos;m Travis. I&apos;m the one person who built Tribos, and I race the thing I&apos;m building. Thanks for signing up.</p>
              <p style="margin: 0 0 20px;">Quick context: I started Tribos because every training app I used felt built for someone with unlimited time and a coach on speed dial. I&apos;m a washed-up masters racer doing mostly gravel and road, with a family, a day job, and about 10 hours a week to train. Tribos is what I wanted to exist.</p>
              <p style="margin: 0 0 20px;">The first thing to do is the 3-minute intake. It picks which coach voice fits you &mdash; The Hammer, The Scientist, The Encourager, The Pragmatist, or The Competitor. Without it, there&apos;s no coach, and without the coach, Tribos is just another dashboard.</p>
              <p style="margin: 0 0 20px;">Once that&apos;s done, connect Garmin, Strava, or Wahoo and open the Coach Check-In. That&apos;s where the actual product lives &mdash; a real conversation about what you&apos;re doing and why.</p>
              <p style="margin: 0 0 20px;">This is a beta. Things will break. When they do, reply to this email. It comes straight to me.</p>
              <p style="margin: 0 0 8px;">Travis</p>
              <p style="margin: 0; font-size: 14px; color: #555555;">P.S. &mdash; when you have a minute, poke around the RIDE tab. The route builder is the other half of Tribos, and it&apos;s the reason I started this whole thing.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
