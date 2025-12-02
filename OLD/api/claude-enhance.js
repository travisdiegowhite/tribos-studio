// Vercel API Route: Claude Route Enhancement
// Secure server-side route for enhancing existing routes

import Anthropic from '@anthropic-ai/sdk';

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({}).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const claude = new Anthropic({ apiKey });

    const { route, params } = req.body;

    // Validate input
    if (!route || !route.name || !route.distance) {
      return res.status(400).json({ error: 'Valid route data required' });
    }

    const prompt = `You are a cycling coach analyzing a route. Provide an enhanced description and training analysis for this cycling route:

ROUTE DETAILS:
- Name: ${route.name}
- Distance: ${route.distance}km
- Elevation gain: ${route.elevationGain || 0}m
- Difficulty: ${route.difficulty || 'moderate'}
- Training goal: ${route.trainingGoal || 'general'}

CURRENT DESCRIPTION: ${route.description || 'No description provided'}

Please provide:
1. An enhanced, motivating description (2-3 sentences)
2. Specific training benefits
3. Pacing recommendations
4. Key challenges to expect

Respond in JSON format:
{
  "enhancedDescription": "improved description",
  "trainingBenefits": "specific benefits for this training goal",
  "pacingAdvice": "how to pace this route",
  "keyChallenges": "what to watch out for"
}`;

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }]
    });

    return res.status(200).json({
      success: true,
      enhancement: response.content[0].text
    });

  } catch (error) {
    console.error('Claude enhancement error:', error);

    return res.status(500).json({
      success: false,
      error: 'Route enhancement failed'
    });
  }
}