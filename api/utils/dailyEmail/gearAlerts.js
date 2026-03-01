/**
 * Module 5: Gear Alerts
 * Surfaces gear maintenance warnings from the existing gear alerts system.
 */

import { computeGearAlerts } from '../gearAlerts.js';

/**
 * Generate gear alert content for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function gearAlertsModule(supabase, userId) {
  try {
    const alerts = await computeGearAlerts(supabase, userId);

    // Only show warning and critical level alerts
    const relevantAlerts = (alerts || []).filter(a => a.level === 'warning' || a.level === 'critical');

    if (relevantAlerts.length === 0) return null;

    // Get user's preferred units
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('preferred_units')
      .eq('id', userId)
      .maybeSingle();

    const useImperial = profile?.preferred_units === 'imperial';

    const alertRows = relevantAlerts.slice(0, 3).map(alert => {
      const distStr = formatDistanceForGear(alert.currentDistance, useImperial);
      const icon = alert.level === 'critical' ? '⚠' : '●';
      const color = alert.level === 'critical' ? '#C45D3E' : '#B8860B';

      let message;
      if (alert.timeBased) {
        message = `${alert.componentType} on ${alert.gearName} — due for replacement (installed ${alert.installedDate})`;
      } else if (alert.componentType) {
        message = `${formatComponentType(alert.componentType)} on ${alert.gearName} — ${distStr}`;
      } else {
        message = `${alert.gearName} — ${distStr}`;
      }

      return `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #EDEDE8;">
            <p style="margin: 0; font-size: 14px; color: ${color};">${icon} ${escapeHtml(message)}</p>
          </td>
        </tr>`;
    });

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
        <tr>
          <td style="padding: 0 0 8px 0;">
            <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Gear Alerts</p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 16px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${alertRows.join('')}
            </table>
            <table cellpadding="0" cellspacing="0" style="margin-top: 12px;">
              <tr>
                <td style="background-color: #6B8C72; padding: 10px 24px;">
                  <a href="https://www.tribos.studio/gear" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View Gear</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    const textAlerts = relevantAlerts.slice(0, 3).map(a => {
      const distStr = formatDistanceForGear(a.currentDistance, useImperial);
      if (a.componentType) {
        return `- ${formatComponentType(a.componentType)} on ${a.gearName}: ${distStr}`;
      }
      return `- ${a.gearName}: ${distStr}`;
    });

    const plainText = `GEAR ALERTS\n${textAlerts.join('\n')}\nView: https://www.tribos.studio/gear\n`;

    return { html, plainText };
  } catch (err) {
    console.error('[daily-email] Gear alerts failed:', err.message);
    return null;
  }
}

function formatDistanceForGear(meters, useImperial) {
  if (!meters) return '0 mi';
  if (useImperial) {
    return `${Math.round(meters / 1609.34).toLocaleString()} mi`;
  }
  return `${Math.round(meters / 1000).toLocaleString()} km`;
}

function formatComponentType(type) {
  const labels = {
    chain: 'Chain',
    cassette: 'Cassette',
    front_tire: 'Front tire',
    rear_tire: 'Rear tire',
    brake_pads: 'Brake pads',
    bar_tape: 'Bar tape',
    cables: 'Cables',
    bottom_bracket: 'Bottom bracket',
    chainring: 'Chainring',
    wheel_front: 'Front wheel',
    wheel_rear: 'Rear wheel',
  };
  return labels[type] || type || 'Component';
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
