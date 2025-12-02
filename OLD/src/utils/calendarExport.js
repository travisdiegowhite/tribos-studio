/**
 * Calendar Export Utility
 * Exports training plan workouts to .ICS format for Google Calendar, Apple Calendar, Outlook, etc.
 */

/**
 * Generate .ICS file content from planned workouts
 * @param {Array} workouts - Array of planned workout objects
 * @param {Object} plan - Training plan object
 * @param {string} userEmail - User's email for organizer field
 * @returns {string} .ICS file content
 */
export function generateICSContent(workouts, plan, userEmail = 'noreply@tribos.studio') {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // ICS file header
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tribos.studio//Training Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + (plan?.name || 'Training Plan'),
    'X-WR-TIMEZONE:America/Denver',
    'X-WR-CALDESC:Training plan from tribos.studio'
  ].join('\r\n');

  // Add each workout as an event
  workouts.forEach((workout, index) => {
    const workoutDate = new Date(workout.workout_date);
    const startDate = formatICSDate(workoutDate);

    // Calculate end time (start + duration)
    const endDate = new Date(workoutDate);
    endDate.setMinutes(endDate.getMinutes() + (workout.target_duration || 60));
    const endDateFormatted = formatICSDate(endDate);

    // Create description with workout details
    const description = createWorkoutDescription(workout);

    // Create alarm (reminder 1 hour before)
    const alarm = [
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Workout in 1 hour: ' + workout.workout_name,
      'END:VALARM'
    ].join('\r\n');

    // Create event
    const event = [
      'BEGIN:VEVENT',
      'UID:' + workout.id + '@tribos.studio',
      'DTSTAMP:' + timestamp,
      'DTSTART:' + startDate,
      'DTEND:' + endDateFormatted,
      'SUMMARY:🚴 ' + workout.workout_name,
      'DESCRIPTION:' + escapeICSText(description),
      'LOCATION:',
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'ORGANIZER;CN=tribos.studio:mailto:' + userEmail,
      alarm,
      'END:VEVENT'
    ].join('\r\n');

    icsContent += '\r\n' + event;
  });

  // Close calendar
  icsContent += '\r\nEND:VCALENDAR';

  return icsContent;
}

/**
 * Format date to ICS format (YYYYMMDDTHHMMSSZ)
 * @param {Date} date - JavaScript Date object
 * @returns {string} ICS formatted date
 */
function formatICSDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Create detailed workout description
 * @param {Object} workout - Workout object
 * @returns {string} Formatted description
 */
function createWorkoutDescription(workout) {
  const parts = [];

  // Add workout type and zone
  if (workout.workout_type) {
    parts.push(`Type: ${workout.workout_type}`);
  }
  if (workout.target_zone) {
    parts.push(`Zone: ${workout.target_zone}`);
  }

  // Add targets
  if (workout.target_duration) {
    parts.push(`Duration: ${workout.target_duration} minutes`);
  }
  if (workout.target_distance) {
    parts.push(`Distance: ${workout.target_distance} km`);
  }
  if (workout.target_tss) {
    parts.push(`TSS: ${workout.target_tss}`);
  }

  // Add description
  if (workout.description) {
    parts.push('\\n' + workout.description);
  }

  // Add notes
  if (workout.notes) {
    parts.push('\\nNotes: ' + workout.notes);
  }

  // Add link back to app
  parts.push('\\n\\nView in tribos.studio: https://www.tribos.studio/training');

  return parts.join('\\n');
}

/**
 * Escape special characters for ICS format
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeICSText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Download .ICS file
 * @param {string} icsContent - ICS file content
 * @param {string} filename - Desired filename (without .ics extension)
 */
export function downloadICSFile(icsContent, filename = 'training-plan') {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.ics`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(link.href);
}

/**
 * Export training plan to calendar
 * @param {Array} workouts - Array of planned workouts
 * @param {Object} plan - Training plan object
 * @param {string} userEmail - User's email
 */
export function exportTrainingPlanToCalendar(workouts, plan, userEmail) {
  // Filter out past workouts (optional - keep all or only future)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // You can choose to export all workouts or only future ones
  // const futureWorkouts = workouts.filter(w => new Date(w.workout_date) >= today);
  const futureWorkouts = workouts; // Export all for now

  if (futureWorkouts.length === 0) {
    throw new Error('No workouts to export');
  }

  // Generate ICS content
  const icsContent = generateICSContent(futureWorkouts, plan, userEmail);

  // Create filename
  const filename = `${plan?.name || 'training-plan'}-${new Date().toISOString().split('T')[0]}`;

  // Download file
  downloadICSFile(icsContent, filename);

  return {
    workoutsExported: futureWorkouts.length,
    filename: filename + '.ics'
  };
}

/**
 * Export a single week to calendar
 * @param {Array} workouts - Array of workouts for the week
 * @param {number} weekNumber - Week number
 * @param {Object} plan - Training plan object
 * @param {string} userEmail - User's email
 */
export function exportWeekToCalendar(workouts, weekNumber, plan, userEmail) {
  if (workouts.length === 0) {
    throw new Error('No workouts in this week');
  }

  const icsContent = generateICSContent(workouts, plan, userEmail);
  const filename = `week-${weekNumber}-${plan?.name || 'training'}`;

  downloadICSFile(icsContent, filename);

  return {
    workoutsExported: workouts.length,
    filename: filename + '.ics'
  };
}
