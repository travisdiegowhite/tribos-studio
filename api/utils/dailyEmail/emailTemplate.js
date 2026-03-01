/**
 * Daily Morning Email HTML Template
 * Tribos design language: parchment theme, DM Mono labels, green accents, sharp corners.
 */

import crypto from 'crypto';

/**
 * Assemble the full daily email HTML from module outputs.
 * @param {string} displayName - User's display name
 * @param {Array<{html: string}>} moduleOutputs - Module HTML blocks
 * @param {string} unsubscribeUrl - Unsubscribe link
 * @param {string} todayStr - Formatted date string for header
 * @returns {string} Complete HTML email
 */
export function assembleEmailHtml(displayName, moduleOutputs, unsubscribeUrl, todayStr) {
  const greeting = displayName
    ? `Good morning, ${escapeHtml(displayName)}.`
    : 'Good morning.';

  const formattedDate = formatDateForHeader(todayStr);
  const moduleBlocks = moduleOutputs.map(m => m.html).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Daily Training Brief — Tribos Studio</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #E8E8E2;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #E8E8E2; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background-color: #EDEDE8; padding: 24px 32px; border-bottom: 2px solid #6B8C72;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 2px 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #6B8C72;">Tribos Studio</p>
                    <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #8A8A7E;">Daily Training Brief · ${escapeHtml(formattedDate)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: #F5F5F1; padding: 28px 32px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #2C2C2C;">${greeting}</p>
              ${moduleBlocks}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #EDEDE8; padding: 20px 32px; border-top: 1px solid #D4D4C8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #8A8A7E;">
                      <a href="https://www.tribos.studio/dashboard" style="color: #6B8C72; text-decoration: none; font-weight: 600;">Open Tribos Studio</a>
                    </p>
                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #A8A89E;">You're receiving this because you have an active Tribos Studio account.</p>
                    <p style="margin: 0; font-size: 11px; color: #A8A89E;">
                      <a href="${escapeHtml(unsubscribeUrl)}" style="color: #A8A89E; text-decoration: underline;">Unsubscribe from daily emails</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Assemble plain text version from module outputs.
 * @param {string} displayName - User's display name
 * @param {Array<{plainText: string}>} moduleOutputs - Module plain text blocks
 * @param {string} unsubscribeUrl - Unsubscribe link
 * @param {string} todayStr - Date string
 * @returns {string} Plain text email
 */
export function assembleEmailText(displayName, moduleOutputs, unsubscribeUrl, todayStr) {
  const greeting = displayName
    ? `Good morning, ${displayName}.`
    : 'Good morning.';

  const formattedDate = formatDateForHeader(todayStr);
  const moduleText = moduleOutputs.map(m => m.plainText).join('\n');

  return `TRIBOS STUDIO — Daily Training Brief · ${formattedDate}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${greeting}

${moduleText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Open Tribos Studio: https://www.tribos.studio/dashboard
Unsubscribe: ${unsubscribeUrl}
`;
}

/**
 * Generate a signed unsubscribe URL for a user.
 * @param {string} userId - User ID
 * @returns {string} Unsubscribe URL
 */
export function generateUnsubscribeUrl(userId) {
  const secret = process.env.SUPABASE_SERVICE_KEY || 'fallback-secret';
  const token = crypto
    .createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .substring(0, 32);

  return `https://www.tribos.studio/api/email-unsubscribe?userId=${encodeURIComponent(userId)}&token=${token}`;
}

function formatDateForHeader(todayStr) {
  const date = new Date(todayStr + 'T00:00:00Z');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
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
