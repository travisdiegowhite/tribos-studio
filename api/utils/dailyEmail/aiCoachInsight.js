/**
 * Module 4: AI Coach Insight
 * Generates a short, personalized coaching insight using Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Generate an AI coaching insight for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function aiCoachInsight(supabase, userId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // Fetch last 7 days of activities
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activities } = await supabase
      .from('activities')
      .select('name, start_date, distance_meters, duration_seconds, elevation_gain_meters, average_power_watts, average_heart_rate, tss, type, sport_type')
      .eq('user_id', userId)
      .gte('start_date', sevenDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    if (!activities || activities.length === 0) return null;

    // Fetch user profile for FTP and context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ftp, primary_sport, fitness_level')
      .eq('id', userId)
      .maybeSingle();

    // Fetch latest fitness snapshot
    const { data: snapshot } = await supabase
      .from('fitness_snapshots')
      .select('ctl, atl, tsb, fitness_trend, load_trend')
      .eq('user_id', userId)
      .order('snapshot_week', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch active training plan context
    const { data: plan } = await supabase
      .from('training_plans')
      .select('name, goal, methodology, compliance_percentage, current_week, duration_weeks')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    // Build activity summary
    const activitySummary = activities.map(a => {
      const dist = ((a.distance_meters || 0) / 1000).toFixed(1);
      const dur = Math.round((a.duration_seconds || 0) / 60);
      const parts = [`${a.name || a.type || 'Activity'}`, `${dist}km`, `${dur}min`];
      if (a.average_power_watts) parts.push(`${Math.round(a.average_power_watts)}W avg`);
      if (a.average_heart_rate) parts.push(`${Math.round(a.average_heart_rate)}bpm`);
      if (a.elevation_gain_meters) parts.push(`${Math.round(a.elevation_gain_meters)}m climbing`);
      return `- ${a.start_date.split('T')[0]}: ${parts.join(', ')}`;
    }).join('\n');

    let context = `Last 7 days (${activities.length} activities):\n${activitySummary}`;
    if (profile?.ftp) context += `\nFTP: ${profile.ftp}W`;
    if (profile?.fitness_level) context += ` | Level: ${profile.fitness_level}`;
    if (snapshot) {
      context += `\nFitness: CTL ${snapshot.ctl}, ATL ${snapshot.atl}, TSB ${snapshot.tsb} (${snapshot.fitness_trend})`;
    }
    if (plan) {
      context += `\nPlan: ${plan.name} (${plan.methodology}, week ${plan.current_week}/${plan.duration_weeks}, ${Math.round(plan.compliance_percentage || 0)}% compliance)`;
    }

    const claude = new Anthropic({ apiKey });

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are a concise endurance sports coach writing a morning email insight. Give ONE specific, actionable coaching observation in 2-3 sentences. Reference actual numbers from the data. Be direct and encouraging. No greetings, sign-offs, or generic advice.',
      messages: [{ role: 'user', content: context }],
    });

    const insightText = response.content?.[0]?.text?.trim();
    if (!insightText) return null;

    return buildInsightBlock(insightText);
  } catch (err) {
    console.error('[daily-email] AI coach insight failed:', err.message);
    return null;
  }
}

function buildInsightBlock(insightText) {
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">AI Coach</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border-left: 3px solid #6B8C72; border-top: 1px solid #D4D4C8; border-right: 1px solid #D4D4C8; border-bottom: 1px solid #D4D4C8; padding: 20px;">
          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #2C2C2C;">${escapeHtml(insightText)}</p>
        </td>
      </tr>
    </table>`;

  const plainText = `AI COACH\n${insightText}\n`;

  return { html, plainText };
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
