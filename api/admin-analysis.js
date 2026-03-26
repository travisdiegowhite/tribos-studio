// Vercel API Route: Admin Analytics Analysis with Claude AI
// SECURITY: Restricted to admin (travis@tribos.studio) only

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

const supabase = getSupabaseAdmin();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'travis@tribos.studio';

async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    console.warn(`SECURITY: Unauthorized admin-analysis access attempt by ${user.email}`);
    return { user: null, error: 'Unauthorized - admin access denied' };
  }

  return { user, error: null };
}

const SYSTEM_PROMPT = `You are an analytics advisor for Tribos Studio, a cycling training platform (SaaS).
Analyze the provided user analytics data and provide actionable insights.

Focus on:
- Key trends and patterns in the data
- Anomalies or concerning metrics
- Growth and engagement opportunities
- Specific, actionable recommendations the founder can implement

Be concise and data-driven. Use markdown headers and bullet points for clarity.
When referencing numbers, include the actual values from the data.
Limit your response to the most impactful insights — quality over quantity.`;

const ANALYSIS_PROMPTS = {
  user_overview: 'Analyze this user data. Focus on growth trends, activation rates, and user health. Identify which users are most/least engaged and suggest retention strategies.',
  activity_analysis: 'Analyze this user activity/engagement data. Identify usage patterns, most/least used features, and suggest ways to increase engagement.',
  insights_deep_dive: 'Analyze this comprehensive insights data including activation funnel, feature adoption, retention cohorts, and stale users. Provide a strategic assessment with prioritized recommendations.',
  overview: 'Provide a high-level overview of platform health based on this analytics data. Highlight the most important metrics and any areas needing attention.',
};

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 5 requests per 5 minutes
  const rateLimited = await rateLimitMiddleware(req, res, {
    maxRequests: 5,
    windowMs: 5 * 60 * 1000,
    keyPrefix: 'admin-analysis',
  });
  if (rateLimited) return;

  const { user, error: authError } = await verifyAdminAccess(req);
  if (!user) {
    return res.status(403).json({ error: authError });
  }

  const { analyticsData, analysisType = 'overview' } = req.body;

  if (!analyticsData) {
    return res.status(400).json({ error: 'analyticsData is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI analysis service not configured' });
  }

  try {
    const claude = new Anthropic({ apiKey });

    const typePrompt = ANALYSIS_PROMPTS[analysisType] || ANALYSIS_PROMPTS.overview;

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${typePrompt}\n\nHere is the analytics data:\n\n${JSON.stringify(analyticsData, null, 2)}`,
        },
      ],
    });

    const analysis = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    console.error('Admin analysis error:', err);
    return res.status(500).json({ error: 'Failed to generate analysis' });
  }
}
