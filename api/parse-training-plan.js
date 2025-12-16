// Vercel API Route: Parse Training Plan Screenshot
// Uses Claude Vision to extract workout schedules from screenshots

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// System prompt for extracting training plan data
const EXTRACTION_PROMPT = `Analyze this training plan screenshot. Extract all scheduled workouts and return as JSON.

Your task:
1. Identify each workout day in the plan
2. Extract the workout type, duration, and description
3. Note any training goals or plan structure
4. Flag anything that's hard to read

Return a JSON object with this exact structure:
{
  "workouts": [
    {
      "day_of_week": "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
      "workout_type": "endurance|tempo|threshold|intervals|recovery|sweet_spot|vo2max|rest",
      "duration_mins": <number>,
      "description": "<workout description or instructions>",
      "intensity": "easy|moderate|hard|very_hard",
      "confidence": "high|medium|low"
    }
  ],
  "plan_info": {
    "name": "<plan name if visible>",
    "duration_weeks": <number if visible>,
    "goal": "<training goal if mentioned>",
    "notes": "<any relevant context about the plan>"
  },
  "extraction_notes": "<any difficulties reading the image or uncertain data>"
}

Workout type mapping:
- Easy/Recovery rides → "recovery"
- Base/Endurance/Long rides → "endurance"
- Tempo/Steady state → "tempo"
- Threshold/FTP work → "threshold"
- Intervals/VO2max/HIIT → "intervals" or "vo2max"
- Sweet spot → "sweet_spot"
- Rest/Off days → "rest"

If duration is given as a range (e.g., "60-90 mins"), use the middle value.
If duration is given in hours, convert to minutes.
If a workout type is unclear, make your best guess and set confidence to "low".

IMPORTANT: Return ONLY the JSON object, no markdown formatting or additional text.`;

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
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting (5 requests per 5 minutes - vision is expensive)
  const rateLimitResult = await rateLimitMiddleware(
    req,
    res,
    'parse_training_plan',
    5,
    5
  );

  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, ...params } = req.body;

    switch (action) {
      case 'parse_screenshot':
        return await parseScreenshot(req, res, params);

      case 'save_plan':
        return await saveParsedPlan(req, res, params);

      case 'save_manual_workout':
        return await saveManualWorkout(req, res, params);

      case 'save_manual_workouts_batch':
        return await saveManualWorkoutsBatch(req, res, params);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Training plan parse error:', error);
    return res.status(500).json({
      error: 'Failed to process training plan',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Parse training plan screenshot using Claude Vision
 */
async function parseScreenshot(req, res, { imageData, imageUrl, userId }) {
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  if (!imageData && !imageUrl) {
    return res.status(400).json({ error: 'imageData or imageUrl required' });
  }

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    console.log('Parsing training plan screenshot with Claude Vision...');

    const claude = new Anthropic({ apiKey });

    // Build the image content
    let imageContent;
    if (imageData) {
      // Base64 encoded image data
      const mediaType = imageData.startsWith('/9j/') ? 'image/jpeg' :
                        imageData.startsWith('iVBOR') ? 'image/png' :
                        'image/jpeg';
      imageContent = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: imageData
        }
      };
    } else {
      // URL-based image
      imageContent = {
        type: 'image',
        source: {
          type: 'url',
          url: imageUrl
        }
      };
    }

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: EXTRACTION_PROMPT
            }
          ]
        }
      ]
    });

    // Extract the JSON response
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent) {
      throw new Error('No response from AI');
    }

    // Parse the JSON (Claude should return clean JSON)
    let parsedPlan;
    try {
      // Try to extract JSON if it's wrapped in markdown code blocks
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      parsedPlan = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', textContent.text);
      throw new Error('Failed to parse training plan data');
    }

    // Validate the structure
    if (!parsedPlan.workouts || !Array.isArray(parsedPlan.workouts)) {
      throw new Error('Invalid plan structure: missing workouts array');
    }

    // Normalize and validate each workout
    const normalizedWorkouts = parsedPlan.workouts.map((workout, index) => ({
      id: `workout_${index}`,
      day_of_week: normalizeDayOfWeek(workout.day_of_week),
      workout_type: normalizeWorkoutType(workout.workout_type),
      duration_mins: parseInt(workout.duration_mins) || 60,
      description: workout.description || '',
      intensity: workout.intensity || 'moderate',
      confidence: workout.confidence || 'medium'
    }));

    console.log(`Extracted ${normalizedWorkouts.length} workouts from screenshot`);

    return res.status(200).json({
      success: true,
      workouts: normalizedWorkouts,
      planInfo: parsedPlan.plan_info || {},
      extractionNotes: parsedPlan.extraction_notes || null,
      usage: response.usage
    });

  } catch (error) {
    console.error('Screenshot parsing error:', error);
    throw error;
  }
}

/**
 * Save parsed training plan to database
 */
async function saveParsedPlan(req, res, { userId, workouts, planInfo, screenshotUrl }) {
  if (!userId || !workouts || !Array.isArray(workouts)) {
    return res.status(400).json({ error: 'userId and workouts array required' });
  }

  try {
    // Create training plan record
    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .insert({
        user_id: userId,
        template_id: 'imported_screenshot',
        name: planInfo?.name || 'Imported Training Plan',
        duration_weeks: planInfo?.duration_weeks || 1,
        methodology: 'imported',
        goal: planInfo?.goal || 'general_fitness',
        status: 'active',
        started_at: new Date().toISOString(),
        notes: `Imported from screenshot. ${planInfo?.notes || ''}`
      })
      .select()
      .single();

    if (planError) {
      throw new Error(`Failed to create training plan: ${planError.message}`);
    }

    // Calculate the start date (next Monday or today if Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + daysUntilMonday);
    startDate.setHours(0, 0, 0, 0);

    // Day of week mapping
    const dayToNumber = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };

    // Create scheduled workouts
    const scheduledWorkouts = workouts.map(workout => {
      const dayNum = dayToNumber[workout.day_of_week.toLowerCase()] || 1;
      const scheduledDate = new Date(startDate);
      // Adjust for day of week (startDate is Monday = 1)
      const daysToAdd = dayNum === 0 ? 6 : dayNum - 1; // Sunday becomes +6, Mon=0, Tue=1, etc.
      scheduledDate.setDate(startDate.getDate() + daysToAdd);

      return {
        user_id: userId,
        training_plan_id: plan.id,
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        workout_type: workout.workout_type,
        target_duration_mins: workout.duration_mins,
        description: workout.description,
        status: 'planned'
      };
    });

    const { data: createdWorkouts, error: workoutsError } = await supabase
      .from('scheduled_workouts')
      .insert(scheduledWorkouts)
      .select();

    if (workoutsError) {
      // Rollback: delete the plan
      await supabase.from('training_plans').delete().eq('id', plan.id);
      throw new Error(`Failed to create workouts: ${workoutsError.message}`);
    }

    console.log(`Created training plan with ${createdWorkouts.length} scheduled workouts`);

    return res.status(200).json({
      success: true,
      plan: plan,
      workouts: createdWorkouts
    });

  } catch (error) {
    console.error('Save plan error:', error);
    throw error;
  }
}

/**
 * Save a single manual workout entry
 */
async function saveManualWorkout(req, res, { userId, workout }) {
  if (!userId || !workout) {
    return res.status(400).json({ error: 'userId and workout required' });
  }

  try {
    const { data, error } = await supabase
      .from('scheduled_workouts')
      .insert({
        user_id: userId,
        scheduled_date: workout.scheduled_date,
        workout_type: workout.workout_type,
        target_duration_mins: workout.duration_mins,
        description: workout.description || '',
        status: 'planned'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save workout: ${error.message}`);
    }

    return res.status(200).json({
      success: true,
      workout: data
    });

  } catch (error) {
    console.error('Save manual workout error:', error);
    throw error;
  }
}

/**
 * Save multiple manual workout entries (batch)
 */
async function saveManualWorkoutsBatch(req, res, { userId, workouts, recurring }) {
  if (!userId || !workouts || !Array.isArray(workouts)) {
    return res.status(400).json({ error: 'userId and workouts array required' });
  }

  try {
    // If recurring, duplicate for multiple weeks
    let allWorkouts = [...workouts];
    if (recurring && recurring.weeks > 1) {
      for (let week = 1; week < recurring.weeks; week++) {
        const weekWorkouts = workouts.map(w => ({
          ...w,
          scheduled_date: addDays(new Date(w.scheduled_date), week * 7)
            .toISOString().split('T')[0]
        }));
        allWorkouts = [...allWorkouts, ...weekWorkouts];
      }
    }

    // Prepare for insert
    const workoutsToInsert = allWorkouts.map(workout => ({
      user_id: userId,
      scheduled_date: workout.scheduled_date,
      workout_type: workout.workout_type,
      target_duration_mins: workout.duration_mins,
      description: workout.description || '',
      status: 'planned'
    }));

    const { data, error } = await supabase
      .from('scheduled_workouts')
      .insert(workoutsToInsert)
      .select();

    if (error) {
      throw new Error(`Failed to save workouts: ${error.message}`);
    }

    return res.status(200).json({
      success: true,
      workouts: data,
      count: data.length
    });

  } catch (error) {
    console.error('Save batch workouts error:', error);
    throw error;
  }
}

// Helper functions
function normalizeDayOfWeek(day) {
  if (!day) return 'monday';
  const normalized = day.toLowerCase().trim();
  const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return validDays.includes(normalized) ? normalized : 'monday';
}

function normalizeWorkoutType(type) {
  if (!type) return 'endurance';
  const normalized = type.toLowerCase().trim().replace(/[^a-z_]/g, '_');
  const validTypes = ['endurance', 'tempo', 'threshold', 'intervals', 'recovery', 'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest'];

  // Handle common variations
  const typeMapping = {
    'easy': 'recovery',
    'base': 'endurance',
    'long': 'endurance',
    'steady': 'tempo',
    'ftp': 'threshold',
    'hiit': 'intervals',
    'hard': 'intervals',
    'off': 'rest',
    'zone_2': 'endurance',
    'zone_3': 'tempo',
    'zone_4': 'threshold',
    'zone_5': 'vo2max'
  };

  if (validTypes.includes(normalized)) {
    return normalized;
  }

  // Try mapping
  for (const [key, value] of Object.entries(typeMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return 'endurance'; // Default
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
