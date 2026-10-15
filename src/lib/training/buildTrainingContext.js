/**
 * The coach's training context: a plain-text summary of the athlete's load,
 * week, plan, races and recent rides, sent with every coach request from /train.
 * Moved verbatim from src/pages/TrainingDashboard.jsx (training cleanup step 3);
 * buildTrainingContext.test.js pins its output.
 */

import { estimateActivityTSS } from '../../utils/computeFitnessSnapshots';
import { formatLocalDate, parsePlanStartDate } from '../../utils/dateUtils';
import { getActivitySport } from '../../utils/sportType';

// Sport of an activity row — the shared classifier, so a Garmin
// 'TRAIL_RUNNING' lands under running here exactly as it does in the load
// pipeline.
export const getSportTypeForActivity = getActivitySport;

// Build training context for AI Coach
export function buildTrainingContext(trainingMetrics, weeklyStats, actualWeeklyStats, ftp, activities, formatDist, formatTime, isImperial, activePlan = null, raceGoals = [], crossTrainingActivities = [], workoutRecommendation = null, plannedWorkouts = [], completedRaces = []) {
  const context = [];
  const distanceUnit = isImperial ? 'mi' : 'km';

  // Add current date context - critical for time-aware recommendations
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  context.push(`TODAY'S DATE: ${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`);
  context.push(`(Any references to days of the week in conversation history may be outdated - always use today's date above as the reference point)`);

  if (ftp) context.push(`FTP: ${ftp}W`);

  if (trainingMetrics.ctl > 0 || trainingMetrics.atl > 0) {
    context.push(`Training Load - Fitness (TFI): ${Math.round(trainingMetrics.ctl)}, Fatigue (AFI): ${Math.round(trainingMetrics.atl)}, Form Score (FS): ${Math.round(trainingMetrics.tsb)}`);
    if (trainingMetrics.interpretation) {
      context.push(`Form Status: ${trainingMetrics.interpretation.status} - ${trainingMetrics.interpretation.message}`);
    }
  }

  if ((actualWeeklyStats.activityCount || actualWeeklyStats.rideCount) > 0) {
    const parts = [];
    if (actualWeeklyStats.rideCount > 0) parts.push(`${actualWeeklyStats.rideCount} rides`);
    if (actualWeeklyStats.runCount > 0) parts.push(`${actualWeeklyStats.runCount} runs`);
    if (actualWeeklyStats.otherCount > 0) parts.push(`${actualWeeklyStats.otherCount} other sessions`);
    context.push(`This week: ${parts.join(', ')}, ${formatDist(actualWeeklyStats.totalDistance / 1000)}, ${formatTime(actualWeeklyStats.totalTime)}`);

    // Add per-sport breakdown if multi-sport
    const sportCount = [weeklyStats.cycling?.count > 0, weeklyStats.running?.count > 0, weeklyStats.other?.count > 0].filter(Boolean).length;
    if (sportCount > 1) {
      if (weeklyStats.cycling?.count > 0) {
        context.push(`  Cycling: ${formatDist(weeklyStats.cycling.distance / 1000)}, ${Math.round(weeklyStats.cycling.tss)} RSS${weeklyStats.cycling.avgPower > 0 ? `, ${weeklyStats.cycling.avgPower}W avg` : ''}`);
      }
      if (weeklyStats.running?.count > 0) {
        const runPace = weeklyStats.running.avgPaceMinKm;
        const paceStr = runPace > 0 ? `, ${Math.floor(runPace)}:${Math.round((runPace % 1) * 60).toString().padStart(2, '0')}/km avg pace` : '';
        context.push(`  Running: ${formatDist(weeklyStats.running.distance / 1000)}, ${Math.round(weeklyStats.running.tss)} RSS${paceStr}`);
      }
      if (weeklyStats.other?.count > 0) {
        context.push(`  Other (cross-training): ${weeklyStats.other.count} sessions, ${Math.round(weeklyStats.other.tss)} RSS`);
      }
    }
  }

  if (activities.length > 0) {
    context.push(`\n--- Recent Activities ---`);
    const recentActivities = activities.slice(0, 7);
    recentActivities.forEach((a, i) => {
      const date = a.start_date ? new Date(a.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '?';
      const sport = getSportTypeForActivity(a);
      const typeLabel = sport === 'running' ? 'Run' : sport === 'cycling' ? 'Ride' : a.type || 'Activity';
      const dist = a.distance ? formatDist(a.distance / 1000) : '';
      const dur = a.moving_time ? formatTime(a.moving_time) : '';
      const power = (sport === 'cycling' && a.average_watts) ? `${Math.round(a.average_watts)}W avg` : '';

      // Unified 5-tier RSS estimation (stored rss ?? tss first), capped at 500.
      const tss = Math.min(estimateActivityTSS(a, ftp) || 0, 500);

      const parts = [a.name || typeLabel, `(${typeLabel})`];
      if (dist) parts.push(dist);
      if (dur) parts.push(dur);
      if (power) parts.push(power);
      parts.push(`${Math.round(tss)} RSS`);

      context.push(`${i + 1}. ${date}: ${parts.join(', ')}`);
    });
    context.push(`Activity history available for analysis (use query_fitness_history tool for historical comparisons)`);
  }

  // Add upcoming race goals context
  if (raceGoals && raceGoals.length > 0) {
    context.push(`\n--- Upcoming Race Goals ---`);
    context.push(`IMPORTANT: The athlete has ${raceGoals.length} upcoming race(s). Training should be periodized around these events.`);

    raceGoals.forEach((race, index) => {
      const raceDate = new Date(race.race_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));
      const weeksUntil = Math.ceil(daysUntil / 7);

      const priorityLabel = race.priority === 'A' ? 'A-RACE (MAIN GOAL)' :
                           race.priority === 'B' ? 'B-Race (Important)' : 'C-Race (Training)';

      context.push(`\n${index + 1}. ${race.name} - ${priorityLabel}`);
      context.push(`   Date: ${raceDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
      context.push(`   Time Until: ~${weeksUntil} weeks (exact day counts are in DAYS_UNTIL — use those)`);
      context.push(`   Type: ${race.race_type?.replace('_', ' ') || 'race'}`);

      if (race.distance_km) {
        const distance = isImperial ? Math.round(race.distance_km * 0.621371) : Math.round(race.distance_km);
        context.push(`   Distance: ${distance} ${distanceUnit}`);
      }
      if (race.elevation_gain_m) {
        const elevation = isImperial ? Math.round(race.elevation_gain_m * 3.28084) : Math.round(race.elevation_gain_m);
        context.push(`   Elevation: ${elevation} ${isImperial ? 'ft' : 'm'}`);
      }
      if (race.goal_time_minutes) {
        const hours = Math.floor(race.goal_time_minutes / 60);
        const mins = race.goal_time_minutes % 60;
        context.push(`   Goal Time: ${hours}h ${mins}m`);
      }
      if (race.goal_power_watts) {
        context.push(`   Goal Power: ${race.goal_power_watts}W`);
      }
      if (race.goal_placement) {
        context.push(`   Goal: ${race.goal_placement}`);
      }
      if (race.course_description) {
        context.push(`   Course: ${race.course_description}`);
      }
      if (race.route_id) {
        context.push(`   Has a linked route`);
      }
    });

    // Race-specific coaching guidance, one line per race so the model can
    // never apply one race's phase to another.
    context.push(`\n--- Race Preparation Guidance (PER-RACE — each line applies ONLY to the named race; never apply one race's phase to another) ---`);
    raceGoals.forEach((race) => {
      const raceDate = new Date(race.race_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));

      let phase;
      if (daysUntil <= 7) {
        phase = 'RACE WEEK — rest, openers, and mental preparation; keep ride stress (RSS) very low.';
      } else if (daysUntil <= 14) {
        phase = 'TAPER — reduce volume 40-60%, maintain some intensity, focus on feeling fresh.';
      } else if (daysUntil <= 28) {
        phase = 'FINAL BUILD — last chance for hard training blocks before the taper.';
      } else if (daysUntil <= 56) {
        phase = 'BUILD — race-specific intensity, include race-pace efforts.';
      } else {
        phase = 'BASE/EARLY BUILD — build aerobic base and address limiters.';
      }
      context.push(`${race.name} (${race.priority || 'B'}-priority): ${phase}`);
    });
  }

  // Add cross-training activities context
  if (crossTrainingActivities && crossTrainingActivities.length > 0) {
    context.push(`\n--- Recent Cross-Training Activities ---`);
    context.push(`IMPORTANT: The athlete does cross-training beyond cycling. Consider this when recommending workouts and recovery.`);

    // Group by category
    const byCategory = {};
    let totalCrossTrainingTSS = 0;

    crossTrainingActivities.forEach(activity => {
      const category = activity.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(activity);
      // Cross-training activities carry their own `tss` field (not the
      // renamed activities.rss); leave the read as-is until
      // cross_training_activities gets its own rename pass.
      totalCrossTrainingTSS += activity.tss || 0;
    });

    context.push(`Total cross-training RSS (last 14 days): ${Math.round(totalCrossTrainingTSS)}`);
    context.push(`Activities breakdown:`);

    Object.entries(byCategory).forEach(([category, activities]) => {
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
      const totalDuration = activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
      context.push(`- ${categoryLabel}: ${activities.length} session${activities.length !== 1 ? 's' : ''}, ${totalDuration} minutes total`);
    });

    // List recent activities
    context.push(`\nRecent activities:`);
    crossTrainingActivities.slice(0, 5).forEach(activity => {
      context.push(`- ${activity.date}: ${activity.type} (${activity.durationMinutes}min, intensity ${activity.intensity}/10, ~${activity.tss || 0} RSS)`);
    });

    // Add coaching guidance for cross-training
    const hasStrength = byCategory.strength && byCategory.strength.length > 0;
    const hasCardio = byCategory.cardio && byCategory.cardio.length > 0;

    if (hasStrength) {
      const recentStrength = crossTrainingActivities.find(a => a.category === 'strength');
      if (recentStrength) {
        const daysSince = Math.floor((new Date() - new Date(recentStrength.date)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 1) {
          context.push(`\nNOTE: Athlete did strength training ${daysSince === 0 ? 'today' : 'yesterday'}. Consider leg fatigue when prescribing cycling intensity.`);
        }
      }
    }

    if (hasCardio) {
      context.push(`\nNOTE: Athlete does other cardio activities. Factor this into total weekly training load calculations.`);
    }
  }

  // Add active training plan context
  if (activePlan) {
    // Use parsePlanStartDate for timezone-safe parsing
    const planStart = parsePlanStartDate(activePlan.started_at || activePlan.start_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare at midnight
    const daysSinceStart = planStart ? Math.floor((now - planStart) / (24 * 60 * 60 * 1000)) : 0;
    const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    const totalWeeks = activePlan.duration_weeks || 8;
    const progress = currentWeek / totalWeeks;

    // Determine phase
    let phase = 'Base';
    if (progress > 0.3 && progress <= 0.6) phase = 'Build';
    else if (progress > 0.6 && progress <= 0.85) phase = 'Peak';
    else if (progress > 0.85) phase = 'Taper';

    context.push(`\n--- Active Training Plan ---`);
    context.push(`Plan: ${activePlan.name}`);
    context.push(`Methodology: ${activePlan.methodology || 'mixed'}`);
    context.push(`Goal: ${activePlan.goal || 'general fitness'}`);
    context.push(`Current Week: ${currentWeek} of ${totalWeeks} (${phase} Phase)`);
    context.push(`Overall Plan Compliance: ${Math.round(activePlan.compliance_percentage || 0)}% (${activePlan.workouts_completed || 0} of ${activePlan.workouts_total || 0} total plan workouts)`);

    if (activePlan.status === 'paused') {
      context.push(`Status: PAUSED - Plan is currently on hold`);
    }

    // Add plan adjustment capability info
    context.push(`\nYou can suggest plan adjustments based on the athlete's current form, compliance, and feedback. Consider:`);
    context.push(`- If compliance is low, suggest reducing volume or intensity`);
    context.push(`- If Form Score is very negative (fatigued), recommend recovery`);
    context.push(`- If Form Score is very positive (fresh), suggest adding intensity`);
    context.push(`- Consider the current training phase when making recommendations`);
    if (raceGoals && raceGoals.length > 0) {
      context.push(`- PRIORITIZE upcoming race goals when planning workouts and recovery`);
    }
  }

  // Add completed race results for historical reference
  if (completedRaces && completedRaces.length > 0) {
    context.push(`\n--- Recent Race Results (Completed) ---`);
    context.push(`Use these past results to assess the athlete's race fitness, compare progress, and provide context for upcoming races.`);

    completedRaces.forEach((race, index) => {
      const raceDate = new Date(race.race_date + 'T00:00:00');
      context.push(`\n${index + 1}. ${race.name} (${raceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`);
      context.push(`   Type: ${race.race_type?.replace('_', ' ') || 'race'}`);
      if (race.distance_km) {
        const distance = isImperial ? Math.round(race.distance_km * 0.621371) : Math.round(race.distance_km);
        context.push(`   Distance: ${distance} ${distanceUnit}`);
      }
      if (race.elevation_gain_m) {
        const elevation = isImperial ? Math.round(race.elevation_gain_m * 3.28084) : Math.round(race.elevation_gain_m);
        context.push(`   Elevation: ${elevation} ${isImperial ? 'ft' : 'm'}`);
      }
      // Actual results
      if (race.actual_time_minutes) {
        const hours = Math.floor(race.actual_time_minutes / 60);
        const mins = race.actual_time_minutes % 60;
        context.push(`   Actual Time: ${hours}h ${mins}m`);
      }
      if (race.actual_power_watts) {
        context.push(`   Actual Power: ${race.actual_power_watts}W avg`);
      }
      if (race.actual_placement) {
        context.push(`   Placement: ${race.actual_placement}`);
      }
      // Goals vs actuals comparison
      if (race.goal_time_minutes && race.actual_time_minutes) {
        const diff = race.actual_time_minutes - race.goal_time_minutes;
        context.push(`   vs Goal: ${diff > 0 ? '+' : ''}${diff} min (goal was ${Math.floor(race.goal_time_minutes / 60)}h ${race.goal_time_minutes % 60}m)`);
      }
      if (race.result_notes) {
        context.push(`   Notes: ${race.result_notes}`);
      }
    });
  }

  // Add planned workout schedule from the training calendar
  if (plannedWorkouts && plannedWorkouts.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Calculate this week's Monday
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(thisMonday.getDate() + mondayOffset);

    // Next Sunday end of this week
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisSunday.getDate() + 6);

    // Next week's Sunday
    const nextSunday = new Date(thisSunday);
    nextSunday.setDate(nextSunday.getDate() + 7);

    // Filter workouts for this week and next week
    const thisWeekWorkouts = plannedWorkouts.filter(w => {
      const d = new Date(w.scheduled_date + 'T12:00:00');
      return d >= thisMonday && d <= thisSunday;
    });

    const nextWeekWorkouts = plannedWorkouts.filter(w => {
      const d = new Date(w.scheduled_date + 'T12:00:00');
      return d > thisSunday && d <= nextSunday;
    });

    if (thisWeekWorkouts.length > 0 || nextWeekWorkouts.length > 0) {
      context.push(`\n--- TRAINING CALENDAR (PLANNED WORKOUTS) ---`);
      context.push(`IMPORTANT: These are the workouts currently scheduled on the athlete's training calendar. Reference this when discussing their schedule, suggesting changes, or advising on load management.`);

      // Build date-to-activities lookup for actual vs planned comparison.
      // Keyed by LOCAL date to match planned_workouts.scheduled_date — a UTC
      // split would mismatch evening workouts and print them as [MISSED].
      const activityByDate = {};
      activities.forEach(a => {
        const dateStr = a.start_date ? formatLocalDate(new Date(a.start_date)) : null;
        if (dateStr) {
          if (!activityByDate[dateStr]) activityByDate[dateStr] = [];
          activityByDate[dateStr].push(a);
        }
      });

      const formatWorkoutLine = (w) => {
        const wDate = new Date(w.scheduled_date + 'T12:00:00');
        const dayLabel = dayNames[wDate.getDay()];
        const dateLabel = wDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isToday = w.scheduled_date === formatLocalDate(today);
        const isPast = wDate < today && !isToday;
        const todayTag = isToday ? ' ** TODAY **' : '';
        const status = w.completed ? 'DONE' : w.skipped_reason ? 'SKIPPED' : isPast ? 'MISSED' : isToday ? 'TODAY' : 'UPCOMING';
        const typeParts = [];
        typeParts.push(w.name || w.workout_type || w.workout_id || 'Workout');
        const dur = w.duration_minutes || w.target_duration;
        if (dur) typeParts.push(`${dur}min`);
        // Prefer canonical target_rss (spec §2) with legacy fallback.
        const targetRss = w.target_rss ?? w.target_tss;
        if (targetRss) typeParts.push(`~${targetRss} RSS`);

        let actualStr = '';
        if (w.completed && w.scheduled_date) {
          const dayActivities = activityByDate[w.scheduled_date];
          if (dayActivities && dayActivities.length > 0) {
            const bestMatch = dayActivities[0];
            // Unified 5-tier RSS estimation (stored rss ?? tss first), capped at 500.
            const actualTSS = Math.min(estimateActivityTSS(bestMatch, ftp) || 0, 500);
            actualStr = ` -> actual ${Math.round(actualTSS)} RSS`;
            if (targetRss && targetRss > 0) {
              actualStr += ` (${Math.round(actualTSS / targetRss * 100)}%)`;
            }
          }
        }

        return `  ${dayLabel} ${dateLabel}${todayTag}: [${status}] ${typeParts.join(', ')}${actualStr}`;
      };

      if (thisWeekWorkouts.length > 0) {
        context.push(`\nThis Week:`);
        // Sort by date
        thisWeekWorkouts
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .forEach(w => context.push(formatWorkoutLine(w)));

        // Summary: how many done vs remaining, with weekly compliance.
        // Prefer canonical target_rss (spec §2) with legacy fallback.
        const completed = thisWeekWorkouts.filter(w => w.completed).length;
        const remaining = thisWeekWorkouts.filter(w => !w.completed && !w.skipped_reason && w.workout_type !== 'rest').length;
        const totalTSS = thisWeekWorkouts.reduce((sum, w) => sum + ((w.target_rss ?? w.target_tss) || 0), 0);

        // Weekly compliance: only count past-due non-rest workouts (not future ones)
        const pastDueThisWeek = thisWeekWorkouts.filter(w => {
          const d = new Date(w.scheduled_date + 'T12:00:00');
          return d < today && w.workout_type !== 'rest';
        });
        const pastDueCompleted = pastDueThisWeek.filter(w => w.completed).length;
        const weeklyCompliance = pastDueThisWeek.length > 0
          ? Math.round((pastDueCompleted / pastDueThisWeek.length) * 100) : 100;

        context.push(`  Summary: ${completed} completed, ${remaining} upcoming, ~${totalTSS} total planned RSS`);
        context.push(`  Weekly Compliance: ${weeklyCompliance}% (${pastDueCompleted} of ${pastDueThisWeek.length} past-due workouts completed)`);
        context.push(`  NOTE: Only workouts with dates BEFORE today count as missed. UPCOMING workouts are not yet due — do not treat them as failures.`);
      }

      if (nextWeekWorkouts.length > 0) {
        context.push(`\nNext Week:`);
        nextWeekWorkouts
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .forEach(w => context.push(formatWorkoutLine(w)));
      }
    }
  }

  // Add today's workout recommendation from unified service
  if (workoutRecommendation?.plannedRest) {
    context.push(`\n--- TODAY'S WORKOUT RECOMMENDATION ---`);
    context.push(`IMPORTANT: The dashboard is showing a REST DAY to the athlete (from their training plan). Your advice should be consistent with this. If you believe the athlete should train today instead, explain why you're deviating from the plan.`);
    context.push(`Primary: Rest Day (from training plan)`);
    const analysis = workoutRecommendation.analysis;
    if (analysis?.formStatus) {
      context.push(`Form Status: ${analysis.formStatus}`);
    }
  } else if (workoutRecommendation?.primary) {
    const rec = workoutRecommendation.primary;
    const analysis = workoutRecommendation.analysis;
    context.push(`\n--- TODAY'S WORKOUT RECOMMENDATION ---`);
    if (rec.source === 'plan') {
      context.push(`IMPORTANT: The dashboard is showing the athlete's PLANNED workout from their training plan. Your advice should be consistent with this. If you believe the athlete should do something different, explain why you're deviating from the plan.`);
    } else {
      context.push(`IMPORTANT: The dashboard is currently showing the following recommendation to the athlete. Your workout advice should be consistent with this unless the athlete asks you to override it.`);
    }
    context.push(`Primary: ${rec.workout?.name || 'None'} (${rec.workout?.id || 'unknown'})`);
    context.push(`Category: ${rec.category}`);
    context.push(`Reason: ${rec.reason}`);
    context.push(`Source: ${rec.source === 'plan' ? 'Training Plan' : 'Auto-recommendation'}`);
    if (analysis?.formStatus) {
      context.push(`Form Status: ${analysis.formStatus}`);
    }
    if (analysis?.raceProximity?.phase) {
      context.push(`Race Proximity: ${analysis.raceProximity.phase} (${analysis.raceProximity.daysUntilRace} days to ${analysis.raceProximity.nextRace?.name})`);
    }
    if (analysis?.gaps) {
      const gapNotes = [];
      if (analysis.gaps.missingZ2) gapNotes.push('no Z2 ride this week');
      if (analysis.gaps.missingIntensity) gapNotes.push('no intensity this week');
      if (gapNotes.length > 0) context.push(`Training Gaps: ${gapNotes.join(', ')}`);
    }
    if (workoutRecommendation.alternatives?.length > 0) {
      context.push(`Alternatives: ${workoutRecommendation.alternatives.map(a => a.workout?.name).join(', ')}`);
    }
  }

  return context.join('\n');
}
