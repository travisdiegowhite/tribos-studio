import { supabase } from '../supabase';

/**
 * Analytics Service
 * Handles workout performance analytics and insights
 */

/**
 * Get workout completion statistics for a coach
 * @param {string} coachId - Coach user ID
 * @returns {Promise} Workout completion stats
 */
export const getWorkoutCompletionStats = async (coachId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        id,
        completion_status,
        target_tss,
        actual_tss,
        athlete_rating,
        template_id,
        workout_templates (
          name,
          primary_zone,
          difficulty_level
        )
      `)
      .eq('coach_id', coachId);

    if (error) throw error;

    // Calculate aggregate statistics
    const stats = {
      total: data.length,
      completed: data.filter(w => w.completion_status === 'completed').length,
      skipped: data.filter(w => w.completion_status === 'skipped').length,
      missed: data.filter(w => w.completion_status === 'missed').length,
      scheduled: data.filter(w => !w.completion_status || w.completion_status === 'scheduled').length,
      completionRate: 0,
      avgRating: 0,
      avgTssAccuracy: 0
    };

    if (stats.total > 0) {
      stats.completionRate = ((stats.completed / stats.total) * 100).toFixed(1);
    }

    const completedWithRating = data.filter(w => w.completion_status === 'completed' && w.athlete_rating);
    if (completedWithRating.length > 0) {
      const totalRating = completedWithRating.reduce((sum, w) => sum + w.athlete_rating, 0);
      stats.avgRating = (totalRating / completedWithRating.length).toFixed(1);
    }

    const completedWithTss = data.filter(w => w.completion_status === 'completed' && w.actual_tss && w.target_tss);
    if (completedWithTss.length > 0) {
      const totalAccuracy = completedWithTss.reduce((sum, w) => {
        const accuracy = (w.actual_tss / w.target_tss) * 100;
        return sum + accuracy;
      }, 0);
      stats.avgTssAccuracy = (totalAccuracy / completedWithTss.length).toFixed(1);
    }

    return { data: { stats, workouts: data }, error: null };
  } catch (err) {
    console.error('Error fetching workout completion stats:', err);
    return { data: null, error: err };
  }
};

/**
 * Get completion rate by workout template
 * @param {string} coachId - Coach user ID
 * @returns {Promise} Template completion rates
 */
export const getTemplateCompletionRates = async (coachId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        template_id,
        completion_status,
        workout_templates (
          name,
          difficulty_level,
          target_tss
        )
      `)
      .eq('coach_id', coachId)
      .not('template_id', 'is', null);

    if (error) throw error;

    // Group by template
    const templateStats = {};
    data.forEach(workout => {
      const templateId = workout.template_id;
      if (!templateStats[templateId]) {
        templateStats[templateId] = {
          templateId,
          name: workout.workout_templates?.name || 'Unknown',
          difficulty: workout.workout_templates?.difficulty_level,
          targetTss: workout.workout_templates?.target_tss,
          total: 0,
          completed: 0,
          skipped: 0,
          missed: 0
        };
      }

      templateStats[templateId].total++;
      if (workout.completion_status === 'completed') {
        templateStats[templateId].completed++;
      } else if (workout.completion_status === 'skipped') {
        templateStats[templateId].skipped++;
      } else if (workout.completion_status === 'missed') {
        templateStats[templateId].missed++;
      }
    });

    // Calculate completion rates
    const templates = Object.values(templateStats).map(template => ({
      ...template,
      completionRate: ((template.completed / template.total) * 100).toFixed(1)
    }));

    // Sort by completion rate
    templates.sort((a, b) => b.completionRate - a.completionRate);

    return { data: templates, error: null };
  } catch (err) {
    console.error('Error fetching template completion rates:', err);
    return { data: null, error: err };
  }
};

/**
 * Get most assigned workouts
 * @param {string} coachId - Coach user ID
 * @param {number} limit - Number of results to return
 * @returns {Promise} Most assigned workouts
 */
export const getMostAssignedWorkouts = async (coachId, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        template_id,
        workout_templates (
          name,
          difficulty_level,
          target_tss,
          duration,
          primary_zone
        )
      `)
      .eq('coach_id', coachId)
      .not('template_id', 'is', null);

    if (error) throw error;

    // Count assignments per template
    const assignmentCounts = {};
    data.forEach(workout => {
      const templateId = workout.template_id;
      if (!assignmentCounts[templateId]) {
        assignmentCounts[templateId] = {
          templateId,
          ...workout.workout_templates,
          count: 0
        };
      }
      assignmentCounts[templateId].count++;
    });

    // Convert to array and sort
    const workouts = Object.values(assignmentCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { data: workouts, error: null };
  } catch (err) {
    console.error('Error fetching most assigned workouts:', err);
    return { data: null, error: err };
  }
};

/**
 * Get athlete workout completion stats
 * @param {string} athleteId - Athlete user ID
 * @returns {Promise} Athlete workout stats
 */
export const getAthleteWorkoutStats = async (athleteId) => {
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(`
        id,
        completion_status,
        completed_at,
        target_tss,
        actual_tss,
        athlete_rating,
        scheduled_date,
        workout_templates (
          name,
          primary_zone,
          difficulty_level
        )
      `)
      .eq('athlete_id', athleteId)
      .order('scheduled_date', { ascending: false });

    if (error) throw error;

    const stats = {
      total: data.length,
      completed: data.filter(w => w.completion_status === 'completed').length,
      skipped: data.filter(w => w.completion_status === 'skipped').length,
      upcoming: data.filter(w => !w.completion_status || w.completion_status === 'scheduled').length,
      totalTss: 0,
      avgRating: 0,
      currentStreak: 0,
      longestStreak: 0
    };

    // Calculate total TSS
    const completedWorkouts = data.filter(w => w.completion_status === 'completed' && w.actual_tss);
    stats.totalTss = completedWorkouts.reduce((sum, w) => sum + (w.actual_tss || w.target_tss), 0);

    // Calculate average rating
    const ratedWorkouts = completedWorkouts.filter(w => w.athlete_rating);
    if (ratedWorkouts.length > 0) {
      stats.avgRating = (ratedWorkouts.reduce((sum, w) => sum + w.athlete_rating, 0) / ratedWorkouts.length).toFixed(1);
    }

    // Calculate streaks (consecutive weeks with at least one completed workout)
    const completedByWeek = {};
    completedWorkouts.forEach(workout => {
      if (workout.scheduled_date) {
        const weekKey = getWeekKey(new Date(workout.scheduled_date));
        completedByWeek[weekKey] = true;
      }
    });

    const weeks = Object.keys(completedByWeek).sort().reverse();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    const currentWeek = getWeekKey(new Date());

    weeks.forEach((week, index) => {
      if (index === 0 && week === currentWeek) {
        currentStreak = 1;
        tempStreak = 1;
      } else if (index === 0) {
        tempStreak = 1;
      } else {
        const prevWeek = weeks[index - 1];
        if (isConsecutiveWeek(week, prevWeek)) {
          tempStreak++;
          if (weeks[0] === currentWeek && currentStreak > 0) {
            currentStreak = tempStreak;
          }
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    });

    stats.currentStreak = currentStreak;
    stats.longestStreak = Math.max(longestStreak, tempStreak);

    return { data: { stats, workouts: data }, error: null };
  } catch (err) {
    console.error('Error fetching athlete workout stats:', err);
    return { data: null, error: err };
  }
};

/**
 * Get weekly training load for an athlete
 * @param {string} athleteId - Athlete user ID
 * @param {number} weeks - Number of weeks to include
 * @returns {Promise} Weekly TSS data
 */
export const getWeeklyTrainingLoad = async (athleteId, weeks = 12) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const { data, error } = await supabase
      .from('planned_workouts')
      .select('scheduled_date, target_tss, actual_tss, completion_status')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .order('scheduled_date');

    if (error) throw error;

    // Group by week
    const weeklyData = {};
    data.forEach(workout => {
      if (workout.scheduled_date) {
        const weekKey = getWeekKey(new Date(workout.scheduled_date));
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = {
            week: weekKey,
            plannedTss: 0,
            actualTss: 0,
            workouts: 0,
            completed: 0
          };
        }

        weeklyData[weekKey].plannedTss += workout.target_tss || 0;
        weeklyData[weekKey].workouts++;

        if (workout.completion_status === 'completed') {
          weeklyData[weekKey].actualTss += workout.actual_tss || workout.target_tss || 0;
          weeklyData[weekKey].completed++;
        }
      }
    });

    const weeklyLoad = Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week));

    return { data: weeklyLoad, error: null };
  } catch (err) {
    console.error('Error fetching weekly training load:', err);
    return { data: null, error: err };
  }
};

// Helper functions
const getWeekKey = (date) => {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
};

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const isConsecutiveWeek = (week1, week2) => {
  const [year1, w1] = week1.split('-W').map(Number);
  const [year2, w2] = week2.split('-W').map(Number);

  if (year1 === year2) {
    return Math.abs(w1 - w2) === 1;
  } else if (year2 === year1 + 1) {
    return w1 === 52 && w2 === 1;
  }
  return false;
};

const analyticsService = {
  getWorkoutCompletionStats,
  getTemplateCompletionRates,
  getMostAssignedWorkouts,
  getAthleteWorkoutStats,
  getWeeklyTrainingLoad
};

export default analyticsService;
