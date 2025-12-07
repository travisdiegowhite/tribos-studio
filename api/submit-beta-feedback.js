const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * API endpoint to send beta feedback notification emails
 * POST /api/submit-beta-feedback
 * Body: { feedbackType, message, pageUrl, userEmail, userId }
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { feedbackType, message, pageUrl, userEmail, userId } = req.body;

    if (!feedbackType || !message) {
      return res.status(400).json({ error: 'Feedback type and message are required' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not configured');
      return res.status(500).json({ error: 'Email service not configured' });
    }

    // Get feedback type emoji and label
    const typeLabels = {
      bug: 'Bug Report',
      feature: 'Feature Request',
      improvement: 'Improvement Idea',
      question: 'Question',
      general: 'General Feedback',
    };

    const typeLabel = typeLabels[feedbackType] || 'Feedback';

    // Send notification email to admin
    const { data, error } = await resend.emails.send({
      from: 'Tribos Beta Feedback <feedback@tribos.studio>',
      to: ['travis@tribos.studio'],
      replyTo: userEmail || undefined,
      subject: `[Beta Feedback] ${typeLabel} from ${userEmail || 'User'}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Beta Feedback</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #1a1b1e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1b1e; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #25262b; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                ${typeLabel}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <!-- User Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px; background-color: #2c2e33; border-radius: 6px; padding: 15px;">
                <tr>
                  <td style="padding: 15px;">
                    <p style="margin: 0 0 8px; font-size: 14px; color: #909296;">
                      <strong style="color: #c1c2c5;">From:</strong> ${userEmail || 'Unknown'}
                    </p>
                    <p style="margin: 0 0 8px; font-size: 14px; color: #909296;">
                      <strong style="color: #c1c2c5;">User ID:</strong> ${userId || 'N/A'}
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #909296;">
                      <strong style="color: #c1c2c5;">Page:</strong> ${pageUrl || 'Not specified'}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feedback Message -->
              <h2 style="margin: 0 0 15px; font-size: 18px; font-weight: 600; color: #c1c2c5;">
                Message:
              </h2>
              <div style="padding: 20px; background-color: #2c2e33; border-left: 4px solid #bef264; border-radius: 4px; margin-bottom: 25px;">
                <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #e9ecef; white-space: pre-wrap;">
${message}
                </p>
              </div>

              <!-- Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <a href="mailto:${userEmail}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-right: 10px;">
                      Reply to User
                    </a>
                    <a href="${pageUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4b5563; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      View Page
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #2c2e33; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #373a40;">
              <p style="margin: 0; font-size: 12px; color: #909296;">
                Beta Feedback System • Tribos.Studio
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
${typeLabel}

From: ${userEmail || 'Unknown'}
User ID: ${userId || 'N/A'}
Page: ${pageUrl || 'Not specified'}

Message:
${message}

---
Reply to: ${userEmail}
View page: ${pageUrl}
      `,
    });

    if (error) {
      console.error('Resend API error:', error);
      return res.status(500).json({ error: 'Failed to send email notification', details: error });
    }

    console.log('Beta feedback notification sent successfully:', data);
    res.status(200).json({ success: true, messageId: data.id });

  } catch (error) {
    console.error('Error sending beta feedback notification:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
