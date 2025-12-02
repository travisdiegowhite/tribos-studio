/**
 * Apply AI Workout Recommendation API
 * Adds an AI-recommended workout to the athlete's training calendar
 */

import { createClient } from '@supabase/supabase-js';

// Use server-side environment variables
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { athleteId, recommendation } = req.body;

    if (!athleteId || !recommendation) {
      return res.status(400).json({
        success: false,
        error: 'athleteId and recommendation are required'
      });
    }

    // Validate recommendation structure
    if (!recommendation.workout_id || !recommendation.scheduled_date) {
      return res.status(400).json({
        success: false,
        error: 'recommendation must include workout_id and scheduled_date'
      });
    }

    // Parse scheduled_date
    const scheduledDate = parseScheduledDate(recommendation.scheduled_date);

    // Get workout template by library_id
    let { data: template, error: templateError } = await supabase
      .from('workout_templates')
      .select('id, name, structure, workout_type, target_tss, duration, difficulty_level, terrain_type')
      .eq('library_id', recommendation.workout_id)
      .eq('is_system_template', true)
      .maybeSingle();

    if (templateError) {
      console.error('Error fetching template:', templateError);
      return res.status(500).json({
        success: false,
        error: 'Database error fetching workout template'
      });
    }

    if (!template) {
      // Fallback: try by name match
      const { data: fallbackTemplate } = await supabase
        .from('workout_templates')
        .select('id, name, structure, workout_type, target_tss, duration, difficulty_level, terrain_type')
        .ilike('name', `%${recommendation.workout_id}%`)
        .limit(1)
        .maybeSingle();

      if (fallbackTemplate) {
        template = fallbackTemplate;
      } else {
        return res.status(404).json({
          success: false,
          error: `Workout template not found: ${recommendation.workout_id}. Please run the database migration to add library_id mappings.`
        });
      }
    }

    // Check if there's already a workout on this date
    const { data: existingWorkout } = await supabase
      .from('planned_workouts')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', scheduledDate)
      .maybeSingle();

    if (existingWorkout) {
      return res.status(409).json({
        success: false,
        error: `You already have a workout scheduled for ${scheduledDate}`
      });
    }

    // Calculate week_number and day_of_week for metadata
    const date = new Date(scheduledDate);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate week number from start of year
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((daysSinceStart + 1) / 7);

    // Build AI metadata
    const aiMetadata = {
      recommended: true,
      source: 'ai_coach',
      reason: recommendation.reason || 'AI-recommended workout',
      priority: recommendation.priority || 'medium',
      recommended_at: new Date().toISOString(),
      modifications: recommendation.modifications || null
    };

    // Create planned workout using new schema
    const plannedWorkoutData = {
      athlete_id: athleteId,
      template_id: template.id,
      scheduled_date: scheduledDate,
      workout_type: template.workout_type,
      target_tss: recommendation.modifications?.target_tss || template.target_tss,
      target_duration: recommendation.modifications?.duration || template.duration,
      target_zone: template.target_zone || null,
      terrain_preference: template.terrain_type || null,
      description: recommendation.reason || template.name,
      completion_status: 'scheduled',
      ai_metadata: aiMetadata,
      created_at: new Date().toISOString()
    };

    // Insert into database
    const { data, error } = await supabase
      .from('planned_workouts')
      .insert(plannedWorkoutData)
      .select(`
        *,
        template:workout_templates (
          id,
          name,
          description,
          structure,
          workout_type,
          target_tss,
          duration,
          difficulty_level
        )
      `)
      .single();

    if (error) {
      console.error('Error creating planned workout:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to add workout to calendar',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (err) {
    console.error('Error applying AI workout:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}

/**
 * Parse scheduled_date string to ISO date
 * Handles: "YYYY-MM-DD", "today", "tomorrow", "this_monday", "next_tuesday", etc.
 */
function parseScheduledDate(dateStr) {
  // If already in ISO format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle relative dates
  if (dateStr === 'today') {
    return today.toISOString().split('T')[0];
  }

  if (dateStr === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // Handle "this_monday", "next_tuesday", etc.
  const thisMatch = dateStr.match(/^this_(\w+)$/);
  const nextMatch = dateStr.match(/^next_(\w+)$/);

  if (thisMatch || nextMatch) {
    const dayName = (thisMatch || nextMatch)[1];
    const targetDay = getDayOfWeekNumber(dayName);
    const currentDay = today.getDay();
    const isNext = !!nextMatch;

    let daysToAdd = 0;
    if (isNext) {
      // Next week's day
      daysToAdd = (7 - currentDay + targetDay) % 7;
      if (daysToAdd === 0) daysToAdd = 7;
      daysToAdd += 7; // Add full week for "next"
    } else {
      // This week's day
      daysToAdd = (targetDay - currentDay + 7) % 7;
      if (daysToAdd === 0 && targetDay !== currentDay) daysToAdd = 7;
    }

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysToAdd);
    return targetDate.toISOString().split('T')[0];
  }

  // Fallback: return today
  console.warn(`Could not parse date: ${dateStr}, using today`);
  return today.toISOString().split('T')[0];
}

/**
 * Get day of week number from name
 */
function getDayOfWeekNumber(dayName) {
  const days = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  return days[dayName.toLowerCase()] || 0;
}
