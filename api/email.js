// Consolidated Email API - Handles all email sending
// Routes: /api/email?action=confirmation|import|welcome

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query.action;

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    switch (action) {
      case 'confirmation':
        return await sendConfirmationEmail(req, res);
      case 'import':
        return await sendImportEmail(req, res);
      case 'welcome':
        return await sendWelcomeEmail(req, res);
      case 'beta-notify':
        return await sendBetaNotifyEmail(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action. Use: confirmation, import, welcome, or beta-notify' });
    }
  } catch (error) {
    console.error(`Error sending ${action} email:`, error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

// ============ CONFIRMATION EMAIL ============
async function sendConfirmationEmail(req, res) {
  const { email, confirmationUrl } = req.body;

  if (!email || !confirmationUrl) {
    return res.status(400).json({ error: 'Email and confirmationUrl are required' });
  }

  const { data, error } = await resend.emails.send({
    from: 'Tribos Studio <noreply@tribos.studio>',
    to: [email],
    subject: 'Confirm Your Tribos.Studio Account',
    html: getConfirmationEmailHtml(confirmationUrl),
  });

  if (error) {
    console.error('Resend API error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error });
  }

  console.log('Confirmation email sent successfully:', data);
  return res.status(200).json({ success: true, messageId: data.id });
}

// ============ IMPORT EMAIL ============
async function sendImportEmail(req, res) {
  const { email, stats } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  if (!stats) {
    return res.status(400).json({ error: 'Stats required' });
  }

  const { totalActivities, imported, skipped, errors } = stats;

  const { data, error } = await resend.emails.send({
    from: 'tribos.studio <noreply@tribos.studio>',
    to: [email],
    subject: 'Your Strava import is complete! 🚴',
    html: getImportEmailHtml(totalActivities, imported, skipped, errors),
    text: getImportEmailText(totalActivities, imported, skipped, errors)
  });

  if (error) {
    console.error('Resend API error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error });
  }

  console.log(`📧 Import completion email sent to ${email}:`, data);
  return res.status(200).json({ success: true, message: 'Email sent successfully', id: data.id });
}

// ============ BETA NOTIFY EMAIL (simple email-only signup) ============
async function sendBetaNotifyEmail(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const { data, error } = await resend.emails.send({
    from: 'Tribos Studio <noreply@tribos.studio>',
    to: [email],
    subject: "You're on the Tribos.Studio Beta List! 🚴",
    html: getBetaNotifyEmailHtml(),
  });

  if (error) {
    console.error('Resend API error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error });
  }

  console.log('Beta notify email sent successfully:', data);
  return res.status(200).json({ success: true, messageId: data.id });
}

// ============ WELCOME EMAIL ============
async function sendWelcomeEmail(req, res) {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const { data, error } = await resend.emails.send({
    from: 'Tribos Studio <onboarding@tribos.studio>',
    to: [email],
    subject: 'Welcome to Tribos Studio Cycling AI Beta!',
    html: getWelcomeEmailHtml(name),
  });

  if (error) {
    console.error('Resend API error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error });
  }

  console.log('Welcome email sent successfully:', data);
  return res.status(200).json({ success: true, messageId: data.id });
}

// ============ EMAIL TEMPLATES ============

function getConfirmationEmailHtml(confirmationUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Tribos.Studio Account</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #252540; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); padding: 50px 40px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; line-height: 1.2;">Welcome to Tribos.Studio</h1>
              <p style="margin: 15px 0 0; color: rgba(255,255,255,0.9); font-size: 18px; font-weight: 400;">Just one more step to get started</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%); border-left: 4px solid #10b981; margin: 0 0 35px 0; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #d1d5db;"><strong style="color: #10b981;">tribos</strong> (Greek: <em>tribos</em>) - the road less traveled, a path worn by those who venture beyond the ordinary.</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #d1d5db;">You're about to unlock AI-powered route planning, personalized training insights, and a smarter way to ride.</p>
              <p style="margin: 0 0 35px; font-size: 16px; line-height: 1.7; color: #d1d5db;">Click the button below to confirm your email and start exploring:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 35px 0;">
                <tr>
                  <td align="center">
                    <a href="${confirmationUrl}" style="display: inline-block; padding: 18px 48px; background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">Confirm My Email</a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 40px 0 0 0; border-top: 1px solid #374151; padding-top: 25px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #9ca3af;">If you didn't create an account with Tribos.Studio, you can safely ignore this email.</p>
                    <p style="margin: 15px 0 0; font-size: 13px; line-height: 1.6; color: #9ca3af;">This link will expire in 24 hours.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1e1e35; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #9ca3af;"><strong style="color: #d1d5db;">Tribos.Studio</strong> - Discover the road less traveled</p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">AI-powered cycling routes and training insights</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getImportEmailHtml(total, imported, skipped, errors) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Import Complete</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #FC4C02 0%, #007CC3 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Import Complete! 🚴</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; margin-top: 0;">Great news! Your Strava activity import has finished processing.</p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FC4C02;">
      <h2 style="margin-top: 0; font-size: 20px; color: #FC4C02;">Import Summary</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0; font-weight: 600;">Total Activities Processed:</td>
          <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #007CC3;">${total}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px 0;">Successfully Imported:</td>
          <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #28a745;">${imported}</td>
        </tr>
        ${skipped > 0 ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0;">Skipped (duplicates):</td><td style="padding: 10px 0; text-align: right; color: #6c757d;">${skipped}</td></tr>` : ''}
        ${errors > 0 ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0;">Errors:</td><td style="padding: 10px 0; text-align: right; color: #dc3545;">${errors}</td></tr>` : ''}
      </table>
    </div>
    <p style="margin: 25px 0;">Your cycling activities are now available in tribos.studio!</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://www.tribos.studio/dashboard" style="display: inline-block; background: linear-gradient(135deg, #FC4C02 0%, #FF6633 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Your Rides →</a>
    </div>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">tribos.studio - Intelligent Cycling Route Planning & Performance Tracking</p>
  </div>
</body>
</html>`;
}

function getImportEmailText(total, imported, skipped, errors) {
  return `Import Complete! 🚴

Your Strava activity import has finished processing.

IMPORT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Activities Processed: ${total}
Successfully Imported: ${imported}
${skipped > 0 ? `Skipped (duplicates): ${skipped}\n` : ''}${errors > 0 ? `Errors: ${errors}\n` : ''}

View Your Rides: https://www.tribos.studio/dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tribos.studio - Intelligent Cycling Route Planning
`;
}

function getBetaNotifyEmailHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the Tribos.Studio Beta List!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #252540; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); padding: 50px 40px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; line-height: 1.3;">You're on the Beta List!</h1>
              <p style="margin: 15px 0 0; color: rgba(255,255,255,0.9); font-size: 18px; font-weight: 400;">Thanks for your interest in Tribos.Studio</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%); border-left: 4px solid #10b981; margin: 0 0 35px 0; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #d1d5db;"><strong style="color: #10b981;">tribos</strong> (Greek: <em>tribos</em>) - the road less traveled, a path worn by those who venture beyond the ordinary.</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.7; color: #d1d5db;">I'm building something different for cyclists who want more than cookie-cutter routes and generic training plans.</p>

              <h2 style="margin: 30px 0 15px; font-size: 18px; font-weight: 600; color: #ffffff;">What Tribos.Studio Will Offer:</h2>
              <ul style="margin: 0 0 25px; padding-left: 20px; font-size: 15px; line-height: 2; color: #d1d5db;">
                <li><strong style="color: #10b981;">AI-powered route generation</strong> - describe your ideal ride in plain English</li>
                <li><strong style="color: #10b981;">Training-aware routes</strong> - routes designed around your workout goals</li>
                <li><strong style="color: #10b981;">Strava & Garmin integration</strong> - sync your ride history for personalized suggestions</li>
                <li><strong style="color: #10b981;">Professional route builder</strong> - elevation profiles, surface types, and more</li>
              </ul>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e1e35; border-radius: 8px; margin: 30px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <p style="margin: 0 0 10px; font-size: 16px; font-weight: 600; color: #ffffff;">What happens next?</p>
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #9ca3af;">I'll email you when the beta is ready. Early supporters get locked-in pricing and direct access to shape what gets built next.</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 5px; font-size: 16px; line-height: 1.6; color: #d1d5db;">Looking forward to riding smarter together,</p>
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #ffffff; font-weight: 600;">Travis</p>
              <p style="margin: 5px 0 0; font-size: 14px; color: #9ca3af;">Founder, Tribos.Studio</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1e1e35; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #9ca3af;"><strong style="color: #d1d5db;">Tribos.Studio</strong> - Discover the road less traveled</p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">AI-powered cycling routes and training insights</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getWelcomeEmailHtml(name) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Tribos.Studio Beta!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; line-height: 1.3;">You're officially part of the Tribos.Studio Beta!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">Hi ${name},</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #d1fae5; border-left: 4px solid #10b981; margin: 0 0 25px 0; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.7; color: #065f46; font-weight: 600;">🎉 The beta is now open! You can start using Tribos.Studio right away.</p>
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #065f46;"><strong>Beta Perks:</strong> $4/month pricing locked in forever, direct founder access, and help shape what gets built next.</p>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 30px 0 15px; font-size: 20px; font-weight: 600; color: #111827;">Get Started</h2>
              <ul style="margin: 0 0 25px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #374151;">
                <li style="margin-bottom: 10px;"><strong>Generate your first AI-powered route</strong> - just set your goal and time</li>
                <li style="margin-bottom: 10px;"><strong>Explore our professional route builder</strong> with elevation profiles</li>
                <li style="margin-bottom: 10px;"><strong>Optionally import your ride history</strong> for personalized recommendations</li>
              </ul>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://tribos.studio" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #10b981 0%, #22d3ee 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Start Exploring →</a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dbeafe; border-left: 4px solid #3b82f6; margin: 0 0 25px 0; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.7; color: #1e3a8a; font-weight: 600;">💬 Direct Access to Travis</p>
                    <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #1e40af;">Use the feedback button in the app or email <a href="mailto:travis@tribos.studio" style="color: #3b82f6;">travis@tribos.studio</a></p>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 20px; font-size: 18px; line-height: 1.6; color: #111827; font-weight: 600;">Ready to ride smarter?</p>
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">Travis<br><strong>Tribos.Studio</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280;">Tribos.Studio - Discover the road less traveled</p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">This email was sent because you signed up for our beta program.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
